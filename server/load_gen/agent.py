"""VirtualPicker — asyncio coroutine that simulates a single headless picker.

Each instance runs independently.  The load-gen main.py spawns N of these
as asyncio Tasks and tracks their stats via shared in-memory state.

API calls made (all via api-gateway, never directly to internal services):
  POST  /pickers/register
  POST  /api/demo/start
  GET   /api/orders/{order_id}
  POST  /events/detection
  PATCH /api/orders/{order_id}/lines/{line_id}
  POST  /api/demo/advance
  POST  /pickers/heartbeat   (every HEARTBEAT_INTERVAL seconds)
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("load_gen.agent")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEARTBEAT_INTERVAL = 30       # seconds — mirrors real picker behaviour
_FAKE_STREAM_URL   = "http://load-gen:8004/noop/stream"
_FAKE_CONTROL_URL  = "http://load-gen:8004/noop/control"

# Fallback wrong-barcode pool used when the live product list can't be fetched.
# These are plausible-looking EAN-13 values that will always fail detection.
_FALLBACK_WRONG_BARCODES = [
    "5901234123457",
    "4006381333931",
    "8710447157084",
    "0012345678905",
    "9780201379624",
]


# ---------------------------------------------------------------------------
# Shared stats object (mutated by the agent, read by /status endpoint)
# ---------------------------------------------------------------------------

@dataclass
class PickerStats:
    picker_id:        str
    status:           str   = "starting"     # starting | picking | advancing | done | error
    orders_completed: int   = 0
    scans_sent:       int   = 0
    picks_confirmed:  int   = 0
    errors:           int   = 0
    current_order_id: str | None = None
    started_at:       float = field(default_factory=time.monotonic)

    def to_dict(self) -> dict[str, Any]:
        return {
            "picker_id":        self.picker_id,
            "status":           self.status,
            "orders_completed": self.orders_completed,
            "scans_sent":       self.scans_sent,
            "picks_confirmed":  self.picks_confirmed,
            "errors":           self.errors,
            "current_order_id": self.current_order_id,
            "uptime_seconds":   round(time.monotonic() - self.started_at),
        }


# ---------------------------------------------------------------------------
# VirtualPicker
# ---------------------------------------------------------------------------

class VirtualPicker:
    """Runs a full pick-loop against the live api-gateway.

    Args:
        picker_id:         Unique ID for this virtual picker (e.g. "vp-1").
        base_url:          api-gateway base URL (no trailing slash).
        scan_interval_ms:  Pause between scans in milliseconds.
        mistake_prob:      Probability [0, 1) of sending a wrong barcode first.
        orders_per_picker: 0 = run until stop_event is set.
        stop_event:        asyncio.Event — set externally to stop the loop.
        stats:             PickerStats instance owned by this picker.
        wrong_barcodes:    Pre-fetched pool of wrong barcodes (may be empty).
    """

    def __init__(
        self,
        picker_id:         str,
        base_url:          str,
        scan_interval_ms:  int,
        mistake_prob:      float,
        orders_per_picker: int,
        stop_event:        asyncio.Event,
        stats:             PickerStats,
        wrong_barcodes:    list[str],
    ) -> None:
        self.picker_id         = picker_id
        self.base_url          = base_url.rstrip("/")
        self.scan_interval_ms  = scan_interval_ms
        self.mistake_prob      = mistake_prob
        self.orders_per_picker = orders_per_picker
        self._stop_event       = stop_event
        self.stats             = stats
        self._wrong_barcodes   = wrong_barcodes or _FALLBACK_WRONG_BARCODES
        self._client: httpx.AsyncClient | None = None

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Main coroutine.  Returns when stop_event is set or orders_per_picker reached."""
        async with httpx.AsyncClient(
            base_url=self.base_url,
            timeout=15.0,
            headers={"X-Virtual-Picker": "true"},
        ) as client:
            self._client = client
            try:
                await self._run_inner()
            except asyncio.CancelledError:
                logger.info("picker=%s cancelled", self.picker_id)
            except Exception as exc:
                logger.error("picker=%s fatal error: %s", self.picker_id, exc)
                self.stats.status = "error"
                self.stats.errors += 1
            finally:
                self._client = None
                if self.stats.status not in ("error",):
                    self.stats.status = "done"

    # ------------------------------------------------------------------
    # Inner loop
    # ------------------------------------------------------------------

    async def _run_inner(self) -> None:
        await self._register()
        session = await self._demo_start()
        order_id: str = session["current_order_id"]

        # Heartbeat task — runs in parallel with pick loop
        hb_task = asyncio.create_task(self._heartbeat_loop())

        try:
            while not self._stop_event.is_set():
                self.stats.current_order_id = order_id
                self.stats.status = "picking"

                order = await self._get_order(order_id)
                pending = [
                    line for line in order.get("lines", [])
                    if line.get("status") == "pending"
                ]

                for line in pending:
                    if self._stop_event.is_set():
                        break

                    barcode: str = line.get("product_barcode", "")

                    # Optional wrong-scan first (mistake_prob % of lines)
                    if self.mistake_prob > 0 and random.random() < self.mistake_prob:
                        wrong = self._pick_wrong_barcode(exclude=barcode)
                        await self._send_detection(wrong)
                        self.stats.scans_sent += 1
                        await asyncio.sleep(self.scan_interval_ms / 1000)

                    # Correct scan → detection event
                    await self._send_detection(barcode)
                    self.stats.scans_sent += 1
                    await asyncio.sleep(self.scan_interval_ms / 1000)

                    # Confirm pick (mirrors mobile confirmPick action)
                    await self._confirm_pick(order_id, line["id"])
                    self.stats.picks_confirmed += 1

                # Advance to next order
                self.stats.status = "advancing"
                result = await self._demo_advance(order_id)

                if result.get("done"):
                    # Order service says the session has hit its max
                    break

                next_order_id = result.get("current_order_id")
                if not next_order_id:
                    # No session owns this order anymore — stop gracefully
                    logger.info("picker=%s demo_advance returned no order; stopping", self.picker_id)
                    break

                self.stats.orders_completed += 1
                order_id = next_order_id

                if self.orders_per_picker and self.stats.orders_completed >= self.orders_per_picker:
                    break

        finally:
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass

    # ------------------------------------------------------------------
    # API helpers
    # ------------------------------------------------------------------

    async def _register(self) -> None:
        resp = await self._client.post(
            "/pickers/register",
            json={
                "picker_id":   self.picker_id,
                "stream_url":  _FAKE_STREAM_URL,
                "control_url": _FAKE_CONTROL_URL,
                "version":     "load-gen",
                "device_id":   f"loadgen-{self.picker_id}",
            },
        )
        resp.raise_for_status()
        logger.info("picker=%s registered", self.picker_id)

    async def _demo_start(self) -> dict[str, Any]:
        resp = await self._client.post(
            "/api/demo/start",
            json={"mode": "personal", "picker_id": self.picker_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def _get_order(self, order_id: str) -> dict[str, Any]:
        resp = await self._client.get(f"/api/orders/{order_id}")
        resp.raise_for_status()
        return resp.json()

    async def _send_detection(self, barcode: str) -> None:
        resp = await self._client.post(
            "/events/detection",
            json={
                "picker_id":  self.picker_id,
                "detections": [{"type": "product", "value": barcode}],
            },
        )
        # Non-fatal: detection rejections are expected (wrong-scan scenario)
        if resp.status_code >= 500:
            self.stats.errors += 1
            logger.warning("picker=%s detection error %d", self.picker_id, resp.status_code)

    async def _confirm_pick(self, order_id: str, line_id: str) -> None:
        resp = await self._client.patch(f"/api/orders/{order_id}/lines/{line_id}")
        if resp.status_code >= 400:
            self.stats.errors += 1
            logger.warning("picker=%s confirm_pick error %d oid=%s lid=%s",
                           self.picker_id, resp.status_code, order_id, line_id)

    async def _demo_advance(self, order_id: str) -> dict[str, Any]:
        resp = await self._client.post(
            "/api/demo/advance",
            json={"order_id": order_id, "picker_id": self.picker_id},
        )
        resp.raise_for_status()
        return resp.json()

    async def _heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            try:
                await self._client.post(
                    "/pickers/heartbeat",
                    json={
                        "picker_id":   self.picker_id,
                        "stream_url":  _FAKE_STREAM_URL,
                        "control_url": _FAKE_CONTROL_URL,
                        "version":     "load-gen",
                        "device_id":   f"loadgen-{self.picker_id}",
                    },
                )
            except Exception as exc:
                logger.debug("picker=%s heartbeat failed: %s", self.picker_id, exc)

    # ------------------------------------------------------------------
    # Noise model helpers
    # ------------------------------------------------------------------

    def _pick_wrong_barcode(self, exclude: str) -> str:
        """Return a random barcode from the wrong-barcode pool, excluding `exclude`."""
        candidates = [b for b in self._wrong_barcodes if b != exclude]
        if not candidates:
            # Edge case: pool is exactly [exclude] — return it anyway
            return self._wrong_barcodes[0] if self._wrong_barcodes else "0000000000000"
        return random.choice(candidates)


# ---------------------------------------------------------------------------
# Utility — fetch wrong-barcode pool from order-service at startup
# ---------------------------------------------------------------------------

async def fetch_wrong_barcodes(base_url: str) -> list[str]:
    """Fetch all known BTT product barcodes so agents have a realistic noise pool.

    Calls GET /api/order/labels/products which returns all BTT-prefixed products.
    Falls back gracefully to [] (agents will use _FALLBACK_WRONG_BARCODES).
    """
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
            resp = await client.get("/api/order/labels/products")
            if resp.status_code == 200:
                products = resp.json()
                barcodes = [p["barcode"] for p in products if p.get("barcode")]
                if barcodes:
                    logger.info("fetch_wrong_barcodes: loaded %d product barcodes", len(barcodes))
                    return barcodes
    except Exception as exc:
        logger.warning("fetch_wrong_barcodes: could not load product list (%s), using fallback", exc)
    return []
