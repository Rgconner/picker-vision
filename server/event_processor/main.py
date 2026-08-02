"""Event Processor — FastAPI application.

Receives detection events from Pi nodes, enriches them by calling the Order
Service, detects order completion, stores live state in Redis, and publishes
state updates to the WebSocket Hub via Redis Pub/Sub.

Endpoints
---------
GET  /health
POST /events/detection
POST /orders/{order_id}/confirm-packed
"""

import asyncio
import collections
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

SERVICE_NAME = "event-processor"
import pathlib as _pathlib
_VERSION_FILE = _pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)

_STARTED_AT  = datetime.now(timezone.utc).isoformat()
_START_MONO  = time.monotonic()
_COUNTERS: dict[str, int] = {
    "events_received":           0,
    "events_processed":          0,
    "events_enriched":           0,
    "order_service_errors":      0,
    "order_service_timeouts":    0,
    "validations_requested":     0,
    "orders_completed_detected": 0,
}

# Scan event ledger — rolling store of the last 100 scan events.
# Persisted to Redis key "scan-ledger" so it survives pod restarts.
_SCAN_LEDGER_KEY = "scan-ledger"
_SCAN_LEDGER_MAXLEN = 100
_SCAN_LEDGER_TTL = 3600  # 1 hour
_scan_ledger: collections.deque = collections.deque(maxlen=_SCAN_LEDGER_MAXLEN)

import httpx
import redis as redis_lib
from fastapi import FastAPI, HTTPException

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://localhost:8001")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
API_GATEWAY_URL = os.getenv("API_GATEWAY_URL", "http://localhost:8000")

# ---------------------------------------------------------------------------
# Redis client (sync — used only for SET/PUBLISH which are fast fire-and-forget)
# ---------------------------------------------------------------------------

_redis = redis_lib.from_url(REDIS_URL, decode_responses=True)

# ---------------------------------------------------------------------------
# Order data cache  {cache_key: (timestamp, data)}
# ---------------------------------------------------------------------------

_ORDER_CACHE_TTL = 5.0  # seconds — 1 s was shorter than a single round-trip under 20-picker load;
                        # raised back to 5 s so cache outlives the burst window
_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, data = entry
    if time.monotonic() - ts > _ORDER_CACHE_TTL:
        del _cache[key]
        return None
    return data


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = (time.monotonic(), data)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("event_processor")

import log_ring as _log_ring
_log_ring.attach()

app = FastAPI(title="Event Processor", version=SERVICE_VERSION)


@app.on_event("startup")
def _restore_scan_ledger() -> None:
    """Load persisted scan entries from Redis into the in-memory ledger."""
    try:
        raw_entries = _redis.lrange(_SCAN_LEDGER_KEY, 0, _SCAN_LEDGER_MAXLEN - 1)
        # Redis list is newest-first (LPUSH); deque expects oldest-first
        for raw in reversed(raw_entries):
            try:
                _scan_ledger.append(json.loads(raw))
            except Exception:
                pass
        logger.info("scan-ledger: restored %d entries from Redis", len(_scan_ledger))
    except Exception as exc:
        logger.warning("scan-ledger: could not restore from Redis: %s", exc)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status":          "ok",
        "service":         SERVICE_NAME,
        "version":         SERVICE_VERSION,
        "started_at":      _STARTED_AT,
        "uptime_seconds":  round(time.monotonic() - _START_MONO),
        "counters":        dict(_COUNTERS),
    }


@app.get("/logs")
def get_logs():
    return {"service": SERVICE_NAME, "lines": _log_ring.get_lines()}


# ---------------------------------------------------------------------------
# Detection event
# ---------------------------------------------------------------------------

@app.post("/events/detection")
async def receive_detection(body: dict):
    """Receive a detection event from a Pi node, enrich it, and broadcast state."""
    _COUNTERS["events_received"] += 1

    picker_id: str = body.get("picker_id", "unknown")
    action: str | None = body.get("action")
    detections: list[dict] = body.get("detections", [])
    staging_regions: list[dict] = body.get("staging_regions", [])
    trace_id: str = body.get("trace_id", "no-trace")

    t0 = time.monotonic()
    ledger_entry: dict = {
        "trace_id":        trace_id,
        "picker_id":       picker_id,
        "ts":              time.time(),
        "time":            datetime.now(timezone.utc).strftime("%H:%M:%S.") + f"{int(datetime.now(timezone.utc).microsecond / 1000):03d}",
        "barcodes":        [d["value"] for d in detections if d.get("type") == "product"],
        "outcomes":        [],
        "processing_ms":   0,
        "order_completed": None,
        "validation":      None,
        "error":           None,
    }

    logger.info("detect trace=%s picker=%s barcodes=%s",
                trace_id, picker_id, ledger_entry["barcodes"])

    try:
      async with httpx.AsyncClient(timeout=10.0) as client:
        # ------------------------------------------------------------------
        # 1. Fetch order data concurrently (with cache)
        # ------------------------------------------------------------------
        orders_data = _cache_get("orders")
        if orders_data is None:
            try:
                resp = await client.get(f"{ORDER_SERVICE_URL}/orders")
                if resp.status_code == 200:
                    orders_data = resp.json()
                else:
                    _COUNTERS["order_service_errors"] += 1
                    logger.warning("order-service GET /orders returned HTTP %d trace=%s",
                                   resp.status_code, trace_id)
                    orders_data = []
            except httpx.TimeoutException:
                _COUNTERS["order_service_errors"] += 1
                _COUNTERS["order_service_timeouts"] += 1
                logger.warning("order-service GET /orders timed out trace=%s", trace_id)
                orders_data = []
            _cache_set("orders", orders_data)

        # Build a flat lookup: barcode → list of matching open order lines.
        # Scope to orders with status "picking" only — excludes completed orders
        # from previous demo runs and prevents cross-picker contamination where
        # picker A's completed order would still match picker B's barcodes.
        barcode_to_lines: dict[str, list[dict]] = {}
        for order in orders_data:
            if order.get("status") != "picking":
                continue
            for line in order.get("lines", []):
                bc = line["product_barcode"]
                barcode_to_lines.setdefault(bc, []).append({**line, "_order": order})

        # ------------------------------------------------------------------
        # 2. Enrich product detections concurrently
        # ------------------------------------------------------------------
        unique_barcodes = list({d["value"] for d in detections if d.get("type") == "product"})

        async def _fetch_product(barcode: str) -> tuple[str, dict | None]:
            cached = _cache_get(f"product:{barcode}")
            if cached is not None:
                return barcode, cached
            try:
                resp = await client.get(f"{ORDER_SERVICE_URL}/products/{barcode}")
                data = resp.json() if resp.status_code == 200 else None
                _cache_set(f"product:{barcode}", data)  # only cache a real response
            except Exception:
                # ReadTimeout / ConnectError under load — return None but do NOT
                # cache it: next detection will retry the live DB so a transient
                # timeout never permanently poisons product lookups.
                data = None
            return barcode, data

        product_results = await asyncio.gather(*[_fetch_product(bc) for bc in unique_barcodes])
        product_map: dict[str, dict | None] = dict(product_results)

        enriched_detections = []
        for det in detections:
            d = dict(det)
            barcode = d.get("value", "")
            product_info = product_map.get(barcode)

            # Default enrichment
            d["product_description"] = product_info["description"] if product_info else None
            d["on_active_order"] = False
            d["order_id"] = None
            d["line_id"] = None
            d["staging_code"] = d.get("staging_code")
            d["staging_label"] = None
            d["status"] = "unexpected"

            matching_lines = barcode_to_lines.get(barcode, [])
            # Prefer a "pending" line, then fall back to any open line
            active_line = next(
                (ln for ln in matching_lines if ln["status"] == "pending"),
                next((ln for ln in matching_lines if ln["status"] == "picked"), None),
            )
            if active_line:
                d["on_active_order"] = True
                d["staging_code"] = active_line["staging_code"]
                d["staging_label"] = active_line.get("staging_label")
                d["order_id"] = active_line["_order"]["id"]
                d["line_id"] = active_line["id"]
                d["status"] = "correct"
                # Pi auto-pick removed. Picks are written by the mobile confirm
                # action only (PATCH /orders/{id}/lines/{line_id} from the client).
                # Pi node files are kept but no longer in the active flow.

            enriched_detections.append(d)
            if d.get("type") == "product":
                logger.debug("enrich trace=%s barcode=%s outcome=%s order=%s",
                             trace_id, barcode, d["status"], d.get("order_id", "—"))

        # ------------------------------------------------------------------
        # 3. Enrich staging regions concurrently
        # ------------------------------------------------------------------
        unique_staging_codes = list({r["staging_code"] for r in staging_regions if r.get("staging_code")})

        async def _fetch_staging(code: str) -> tuple[str, dict | None]:
            cached = _cache_get(f"staging:{code}")
            if cached is not None:
                return code, cached
            resp = await client.get(f"{ORDER_SERVICE_URL}/staging/{code}")
            data = resp.json() if resp.status_code == 200 else None
            _cache_set(f"staging:{code}", data)
            return code, data

        staging_results = await asyncio.gather(*[_fetch_staging(code) for code in unique_staging_codes])
        staging_map: dict[str, dict | None] = dict(staging_results)

        enriched_regions = []
        for region in staging_regions:
            r = dict(region)
            code = r.get("staging_code", "")
            staging_info = staging_map.get(code)

            r["staging_label"] = staging_info["label"] if staging_info else None
            r["staging_type"] = staging_info["staging_type"] if staging_info else None

            # Determine lock state from Redis
            lock_key = f"staging:{code}:locked"
            is_locked = _redis.exists(lock_key) > 0

            if is_locked:
                r["staging_status"] = "locked"
            elif staging_info and staging_info.get("status") == "locked":
                r["staging_status"] = "locked"
            else:
                r["staging_status"] = staging_info["status"] if staging_info else "pending"

            r["lock_state"] = is_locked
            enriched_regions.append(r)

        # ------------------------------------------------------------------
        # 4. Order completion check
        # Completion is now driven by the mobile confirm action (POST /demo/advance),
        # not by the scan event. This check remains for supervisor WebSocket state
        # updates — it reads DB state as-is without writing picks.
        # ------------------------------------------------------------------
        order_complete_pending_id: str | None = None
        order_complete_staging_code: str | None = None

        detected_barcodes = {d["value"] for d in enriched_detections if d.get("on_active_order")}
        detected_staging_codes = {r["staging_code"] for r in enriched_regions}

        for order in orders_data:
            lines = order.get("lines", [])
            if not lines:
                continue
            all_picked = all(ln["status"] == "picked" for ln in lines)
            if all_picked:
                order_complete_pending_id = order["id"]
                # Use the first staging code in the order as representative
                order_complete_staging_code = lines[0]["staging_code"] if lines else None
                logger.info("order_complete trace=%s picker=%s order=%s staging=%s",
                            trace_id, picker_id, order_complete_pending_id, order_complete_staging_code)
                _COUNTERS["orders_completed_detected"] += 1
                break

        # ------------------------------------------------------------------
        # 5. Handle validate action
        # ------------------------------------------------------------------
        validation_result: dict | None = None
        if action == "validate":
            _COUNTERS["validations_requested"] += 1
            all_order_barcodes = {
                ln["product_barcode"]
                for order in orders_data
                for ln in order.get("lines", [])
            }
            current_barcodes = {d["value"] for d in enriched_detections}
            correct = [bc for bc in current_barcodes if bc in all_order_barcodes]
            missing = [bc for bc in all_order_barcodes if bc not in current_barcodes]
            unexpected = [bc for bc in current_barcodes if bc not in all_order_barcodes]
            validation_result = {
                "type": "validation_result",
                "picker_id": picker_id,
                "correct": correct,
                "missing": missing,
                "unexpected": unexpected,
            }
            logger.info("validate trace=%s picker=%s correct=%d missing=%d unexpected=%d",
                        trace_id, picker_id, len(correct), len(missing), len(unexpected))
            ledger_entry["validation"] = {"correct": len(correct), "missing": len(missing), "unexpected": len(unexpected)}

        # ------------------------------------------------------------------
        # 6. Build enriched payload
        # ------------------------------------------------------------------
        enriched_payload = {
            "picker_id": picker_id,
            "timestamp": body.get("timestamp"),
            "action": action,
            "trace_id": trace_id,
            "detections": enriched_detections,
            "staging_regions": enriched_regions,
        }
        if order_complete_pending_id:
            enriched_payload["order_complete_pending"] = {
                "type": "order_complete_pending",
                "order_id": order_complete_pending_id,
                "picker_id": picker_id,
                "staging_code": order_complete_staging_code,
            }

        # ------------------------------------------------------------------
        # 7. Write to Redis
        # ------------------------------------------------------------------
        state_key = f"picker:{picker_id}:state"
        _redis.setex(state_key, 30, json.dumps(enriched_payload))

        if order_complete_pending_id:
            _redis.setex(
                f"picker:{picker_id}:order_complete_pending",
                60,
                order_complete_pending_id,
            )

        # ------------------------------------------------------------------
        # 8. Publish to Pub/Sub
        # ------------------------------------------------------------------
        channel = f"picker:{picker_id}:updates"
        _redis.publish(channel, json.dumps(enriched_payload))

        if validation_result:
            _redis.publish(channel, json.dumps(validation_result))

        # Populate ledger outcomes and mark enriched
        ledger_entry["outcomes"] = [
            {
                "barcode":  d["value"],
                "result":   d.get("status", "unknown"),
                "order_id": d.get("order_id"),
            }
            for d in enriched_detections
            if d.get("type") == "product"
        ]
        ledger_entry["order_completed"] = order_complete_pending_id
        _COUNTERS["events_enriched"] += 1

      _COUNTERS["events_processed"] += 1
      return {
          "status": "processed",
          "picker_id": picker_id,
          "trace_id": trace_id,
          "detection_count": len(enriched_detections),
      }

    except Exception as exc:
        ledger_entry["error"] = str(exc)
        raise
    finally:
        ledger_entry["processing_ms"] = round((time.monotonic() - t0) * 1000)
        _scan_ledger.append(ledger_entry)
        try:
            _redis.lpush(_SCAN_LEDGER_KEY, json.dumps(ledger_entry))
            _redis.ltrim(_SCAN_LEDGER_KEY, 0, _SCAN_LEDGER_MAXLEN - 1)
            _redis.expire(_SCAN_LEDGER_KEY, _SCAN_LEDGER_TTL)
        except Exception as exc:
            logger.debug("scan-ledger: Redis write failed (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# Confirm packed
# ---------------------------------------------------------------------------

@app.post("/orders/{order_id}/confirm-packed")
async def confirm_packed(order_id: str):
    """Mark order as packed and lock staging targets in Redis for 1 hour."""

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Call the Order Service
        resp = await client.post(f"{ORDER_SERVICE_URL}/orders/{order_id}/confirm-packed")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Order {order_id!r} not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Order Service error")

        order_data = resp.json()

        # Lock staging targets in Redis.
        # TTL = 1 hour — prevents a rehearsal run poisoning the live demo.
        # (Was 86400 = 24 hours. Pi hardware retired; /control/broadcast removed.)
        staging_codes = list({ln["staging_code"] for ln in order_data.get("lines", []) if ln.get("staging_code")})
        for code in staging_codes:
            _redis.setex(f"staging:{code}:locked", 3600, "1")

        # Publish a staging_locked message to all picker channels
        locked_msg = json.dumps({"type": "staging_locked", "order_id": order_id, "staging_codes": staging_codes})
        # Broadcast to all known active picker channels
        for key in _redis.scan_iter("picker:*:state"):
            parts = key.split(":")
            if len(parts) >= 2:
                pid = parts[1]
                _redis.publish(f"picker:{pid}:updates", locked_msg)

    return order_data


# ---------------------------------------------------------------------------
# Scan log
# ---------------------------------------------------------------------------

@app.get("/scan-log")
def get_scan_log(limit: int = 50):
    """Return recent scan events from the in-memory ledger, newest first."""
    limit = min(limit, 100)
    entries = list(_scan_ledger)
    entries.reverse()
    return entries[:limit]
