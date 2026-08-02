"""Load Generator — FastAPI control service.

Endpoints
---------
POST /start    Start N virtual pickers
POST /stop     Stop all or a single runner_id
GET  /status   Live counters per picker
GET  /health   Liveness

Regional Simulation endpoints
------------------------------
POST /simulations/start           { preset, months } → generate RS, return record
GET  /simulations                 → list all RS records
GET  /simulations/{rs_id}         → full RS record + picker profiles
DELETE /simulations/{rs_id}       → delete RS and all its pick events
GET  /simulations/{rs_id}/capacity/{store_id}  → ARCH-003 signal for one store
GET  /simulations/{rs_id}/capacity             → signals for all stores
GET  /simulations/{rs_id}/gantt                → Gantt grid data
"""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import time
from datetime import date, datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agent import PickerStats, VirtualPicker, fetch_wrong_barcodes
import capacity as cap_module
import simulator as sim_module

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

API_GATEWAY_URL       = os.getenv("API_GATEWAY_URL", "http://api-gateway:8000")
API_KEY               = os.getenv("API_KEY", "")
LOAD_GEN_DATABASE_URL = os.getenv("LOAD_GEN_DATABASE_URL", "")

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


# ---------------------------------------------------------------------------
# Regional Simulation endpoints
# ---------------------------------------------------------------------------

class SimStartRequest(BaseModel):
    preset: str = "simple"
    months: int = 3


def _require_db() -> str:
    if not LOAD_GEN_DATABASE_URL:
        raise HTTPException(
            status_code=503,
            detail="LOAD_GEN_DATABASE_URL not configured — Postgres not available",
        )
    return LOAD_GEN_DATABASE_URL


@app.post("/simulations/start")
def simulations_start(body: SimStartRequest) -> dict[str, Any]:
    db_url = _require_db()
    if body.months < 1 or body.months > 24:
        raise HTTPException(status_code=422, detail="months must be between 1 and 24")
    try:
        result = sim_module.generate_simulation(
            preset=body.preset,
            months=body.months,
            db_url=db_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result.to_dict()


@app.get("/simulations")
def simulations_list() -> list[dict[str, Any]]:
    db_url = _require_db()
    return sim_module.list_simulations(db_url)


@app.get("/simulations/{rs_id}/capacity/{store_id}")
def simulations_capacity_store(rs_id: str, store_id: str) -> dict[str, Any]:
    db_url = _require_db()
    signal = cap_module.store_capacity_signal(db_url, rs_id, store_id)
    if signal is None:
        raise HTTPException(status_code=404, detail=f"RS {rs_id!r} or store {store_id!r} not found")
    return signal


@app.get("/simulations/{rs_id}/capacity")
def simulations_capacity_all(rs_id: str) -> list[dict[str, Any]]:
    db_url = _require_db()
    result = cap_module.all_store_capacity_signals(db_url, rs_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"RS {rs_id!r} not found or has no events")
    return result


@app.get("/simulations/{rs_id}/gantt")
def simulations_gantt(
    rs_id: str,
    granularity: str = "day",
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    db_url = _require_db()
    # Default: last 30 days
    end_date   = date.fromisoformat(end)   if end   else date.today()
    start_date = date.fromisoformat(start) if start else (end_date.replace(day=1))
    result = cap_module.gantt_data(db_url, rs_id, granularity, start_date, end_date)
    if result is None:
        raise HTTPException(status_code=404, detail=f"RS {rs_id!r} not found")
    return result


@app.get("/simulations/{rs_id}")
def simulations_get(rs_id: str) -> dict[str, Any]:
    db_url = _require_db()
    result = sim_module.get_simulation(rs_id, db_url)
    if result is None:
        raise HTTPException(status_code=404, detail=f"RS {rs_id!r} not found")
    return result


@app.delete("/simulations/{rs_id}")
def simulations_delete(rs_id: str) -> dict[str, Any]:
    db_url = _require_db()
    deleted = sim_module.delete_simulation(rs_id, db_url)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"RS {rs_id!r} not found")
    return {"deleted": rs_id}
