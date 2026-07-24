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
import json
import os
import time
from typing import Any

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

_ORDER_CACHE_TTL = 5.0  # seconds
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

app = FastAPI(title="Event Processor")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "event-processor"}


# ---------------------------------------------------------------------------
# Detection event
# ---------------------------------------------------------------------------

@app.post("/events/detection")
async def receive_detection(body: dict):
    """Receive a detection event from a Pi node, enrich it, and broadcast state."""

    picker_id: str = body.get("picker_id", "unknown")
    action: str | None = body.get("action")
    detections: list[dict] = body.get("detections", [])
    staging_regions: list[dict] = body.get("staging_regions", [])

    async with httpx.AsyncClient(timeout=5.0) as client:
        # ------------------------------------------------------------------
        # 1. Fetch order data concurrently (with cache)
        # ------------------------------------------------------------------
        orders_data = _cache_get("orders")
        if orders_data is None:
            resp = await client.get(f"{ORDER_SERVICE_URL}/orders")
            orders_data = resp.json() if resp.status_code == 200 else []
            _cache_set("orders", orders_data)

        # Build a flat lookup: barcode → list of matching open order lines
        # (lines where status is "pending" or "picked")
        barcode_to_lines: dict[str, list[dict]] = {}
        for order in orders_data:
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
            resp = await client.get(f"{ORDER_SERVICE_URL}/products/{barcode}")
            data = resp.json() if resp.status_code == 200 else None
            _cache_set(f"product:{barcode}", data)
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

            enriched_detections.append(d)

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
            all_detected = all(ln["product_barcode"] in detected_barcodes for ln in lines)
            all_staged = all(ln["staging_code"] in detected_staging_codes for ln in lines)
            if all_picked and all_detected and all_staged:
                order_complete_pending_id = order["id"]
                # Use the first staging code in the order as representative
                order_complete_staging_code = lines[0]["staging_code"] if lines else None
                break

        # ------------------------------------------------------------------
        # 5. Handle validate action
        # ------------------------------------------------------------------
        validation_result: dict | None = None
        if action == "validate":
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

        # ------------------------------------------------------------------
        # 6. Build enriched payload
        # ------------------------------------------------------------------
        enriched_payload = {
            "picker_id": picker_id,
            "timestamp": body.get("timestamp"),
            "action": action,
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

    return {
        "status": "processed",
        "picker_id": picker_id,
        "detection_count": len(enriched_detections),
    }


# ---------------------------------------------------------------------------
# Confirm packed
# ---------------------------------------------------------------------------

@app.post("/orders/{order_id}/confirm-packed")
async def confirm_packed(order_id: str):
    """Mark order as packed, lock staging targets in Redis, push lock_staging to Pi."""

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Call the Order Service
        resp = await client.post(f"{ORDER_SERVICE_URL}/orders/{order_id}/confirm-packed")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Order {order_id!r} not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Order Service error")

        order_data = resp.json()

        # Lock staging targets in Redis and push control messages
        staging_codes = list({ln["staging_code"] for ln in order_data.get("lines", [])})
        for code in staging_codes:
            _redis.setex(f"staging:{code}:locked", 86400, "1")

            # Forward lock_staging control message to Pi nodes via API Gateway
            try:
                await client.post(
                    f"{API_GATEWAY_URL}/control/broadcast",
                    json={"action": "lock_staging", "staging_code": code},
                    timeout=3.0,
                )
            except Exception:
                pass  # best-effort; Pi will pick up lock state from Redis on next event

        # Publish a staging_locked message to all picker channels
        locked_msg = json.dumps({"type": "staging_locked", "order_id": order_id, "staging_codes": staging_codes})
        # Broadcast to all known active picker channels
        for key in _redis.scan_iter("picker:*:state"):
            parts = key.split(":")
            if len(parts) >= 2:
                pid = parts[1]
                _redis.publish(f"picker:{pid}:updates", locked_msg)

    return order_data
