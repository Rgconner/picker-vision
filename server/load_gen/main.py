"""Load Generator — FastAPI control service.

Endpoints
---------
POST /start    Start N virtual pickers
POST /stop     Stop all or a single runner_id
GET  /status   Live counters per picker
GET  /health   Liveness
"""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import PickerStats, VirtualPicker, fetch_wrong_barcodes

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SERVICE_NAME    = "load-gen"
_VERSION_FILE   = pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)
_STARTED_AT = datetime.now(timezone.utc).isoformat()
_START_MONO = time.monotonic()

API_GATEWAY_URL = os.getenv("API_GATEWAY_URL", "http://api-gateway:8000")
API_KEY         = os.getenv("API_KEY", "")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("load_gen")

# ---------------------------------------------------------------------------
# In-memory run state
# ---------------------------------------------------------------------------

# runner_id → asyncio.Task
_tasks:      dict[str, asyncio.Task]      = {}
# runner_id → PickerStats (shared with agent, read-only here)
_stats:      dict[str, PickerStats]       = {}
# shared stop event — set() stops all pickers; individual stops cancel tasks directly
_stop_event: asyncio.Event | None        = None
# cached wrong-barcode pool, populated at /start time
_wrong_barcodes: list[str]               = []

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class StartRequest(BaseModel):
    picker_count:        int   = 3
    scan_interval_ms:    int   = 800
    mistake_probability: float = 0.0
    orders_per_picker:   int   = 0
    picker_id_prefix:    str   = "vp-"


class StopRequest(BaseModel):
    runner_id: str | None = None   # None → stop all

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="Load Generator", version=SERVICE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_api_key(x_api_key: str | None) -> None:
    """Raise 401 if API_KEY is configured and the header doesn't match."""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status":         "ok",
        "service":        SERVICE_NAME,
        "version":        SERVICE_VERSION,
        "started_at":     _STARTED_AT,
        "uptime_seconds": round(time.monotonic() - _START_MONO),
        "running":        len(_tasks) > 0,
        "picker_count":   len(_tasks),
    }


@app.post("/start")
async def start(body: StartRequest, x_api_key: str | None = Header(default=None)) -> dict[str, Any]:
    _require_api_key(x_api_key)
    global _stop_event, _wrong_barcodes

    # Stop any existing run first
    if _tasks:
        await _stop_all()

    _stop_event    = asyncio.Event()
    _wrong_barcodes = await fetch_wrong_barcodes(API_GATEWAY_URL)

    launched: list[str] = []
    for i in range(1, body.picker_count + 1):
        runner_id = f"{body.picker_id_prefix}{i}"
        stats     = PickerStats(picker_id=runner_id)
        picker    = VirtualPicker(
            picker_id         = runner_id,
            base_url          = API_GATEWAY_URL,
            scan_interval_ms  = body.scan_interval_ms,
            mistake_prob      = body.mistake_probability,
            orders_per_picker = body.orders_per_picker,
            stop_event        = _stop_event,
            stats             = stats,
            wrong_barcodes    = _wrong_barcodes,
        )
        task              = asyncio.create_task(picker.run(), name=runner_id)
        _tasks[runner_id] = task
        _stats[runner_id] = stats
        launched.append(runner_id)

    logger.info("load-gen started: %d pickers, interval=%dms, mistake=%.0f%%",
                body.picker_count, body.scan_interval_ms, body.mistake_probability * 100)
    return {"started": True, "pickers": launched}


@app.post("/stop")
async def stop(body: StopRequest, x_api_key: str | None = Header(default=None)) -> dict[str, Any]:
    _require_api_key(x_api_key)

    if body.runner_id:
        task = _tasks.pop(body.runner_id, None)
        _stats.pop(body.runner_id, None)
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        return {"stopped": body.runner_id}

    await _stop_all()
    return {"stopped": "all"}


@app.get("/status")
def status() -> dict[str, Any]:
    picker_list = [s.to_dict() for s in _stats.values()]
    totals: dict[str, int] = {"scans_sent": 0, "picks_confirmed": 0, "errors": 0}
    for s in _stats.values():
        totals["scans_sent"]      += s.scans_sent
        totals["picks_confirmed"] += s.picks_confirmed
        totals["errors"]          += s.errors
    return {
        "running": len(_tasks) > 0,
        "pickers": picker_list,
        "totals":  totals,
    }


# No-op endpoints so the fake stream/control URLs registered by virtual pickers
# don't 404 when the supervisor tries to reach them.
@app.get("/noop/{path:path}")
@app.post("/noop/{path:path}")
async def noop(path: str) -> dict[str, str]:
    return {"noop": path}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _stop_all() -> None:
    global _stop_event
    if _stop_event:
        _stop_event.set()
    for task in list(_tasks.values()):
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
    _tasks.clear()
    _stats.clear()
    _stop_event = None
