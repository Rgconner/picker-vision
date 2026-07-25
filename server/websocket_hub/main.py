"""WebSocket Hub — FastAPI application.

Manages browser WebSocket connections, subscribes to Redis Pub/Sub channels,
and forwards enriched picker state to connected clients in real-time.

Endpoints
---------
GET  /health
WS   /ws/supervisor           — aggregated feed for all active pickers
WS   /ws/{picker_id}          — operator feed for a single picker
GET  /state/supervisor        — REST snapshot of all active picker states
GET  /state/{picker_id}       — REST snapshot for a single picker (initial page load)

Note: /state/supervisor must be declared before /state/{picker_id} in the
router so FastAPI matches the literal "supervisor" path before the dynamic
segment.  The same rule applies for /ws/supervisor vs /ws/{picker_id}.
"""

import asyncio
import json
import os
import threading
from typing import Any

SERVICE_NAME = "websocket-hub"
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "1.0.0")

import redis as redis_lib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ---------------------------------------------------------------------------
# Redis clients
# ---------------------------------------------------------------------------

# Sync client used for GET state (REST) — simple blocking calls
_redis_sync = redis_lib.from_url(REDIS_URL, decode_responses=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="WebSocket Hub", version=SERVICE_VERSION)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_pubsub() -> redis_lib.client.PubSub:
    """Create a fresh PubSub object from a dedicated connection."""
    client = redis_lib.from_url(REDIS_URL, decode_responses=True)
    return client.pubsub()


def _launch_listener(
    pubsub: redis_lib.client.PubSub,
    queue: asyncio.Queue,
    loop: asyncio.AbstractEventLoop,
    stop_event: threading.Event,
    pattern: bool = False,
) -> threading.Thread:
    """Spawn a daemon thread that blocks on pubsub.listen() and enqueues messages."""

    def _run():
        try:
            for msg in pubsub.listen():
                if stop_event.is_set():
                    break
                msg_type = msg.get("type")
                if msg_type in ("message", "pmessage"):
                    data = msg.get("data", "")
                    asyncio.run_coroutine_threadsafe(queue.put(data), loop)
        except Exception:
            pass  # connection closed — WebSocket handler will detect disconnect

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}


# ---------------------------------------------------------------------------
# REST state endpoints  (supervisor MUST come first)
# ---------------------------------------------------------------------------

@app.get("/state/supervisor")
def get_supervisor_state():
    """Return all active picker states from Redis."""
    result: dict[str, Any] = {}
    for key in _redis_sync.scan_iter("picker:*:state"):
        # key format: picker:<picker_id>:state
        parts = key.split(":")
        if len(parts) < 3:
            continue
        picker_id = parts[1]
        raw = _redis_sync.get(key)
        if raw:
            try:
                result[picker_id] = json.loads(raw)
            except json.JSONDecodeError:
                result[picker_id] = raw
    return result


@app.get("/state/{picker_id}")
def get_state(picker_id: str):
    """Return current state for a picker (initial page-load REST call)."""
    raw = _redis_sync.get(f"picker:{picker_id}:state")
    if not raw:
        return {"error": "no state"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "invalid state"}


# ---------------------------------------------------------------------------
# WebSocket — supervisor  (must be declared before /ws/{picker_id})
# ---------------------------------------------------------------------------

@app.websocket("/ws/supervisor")
async def ws_supervisor(websocket: WebSocket):
    """Supervisor feed — receives state updates from ALL active picker channels."""
    await websocket.accept()

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    stop_event = threading.Event()

    pubsub = _make_pubsub()
    pubsub.psubscribe("picker:*:updates")
    _launch_listener(pubsub, queue, loop, stop_event, pattern=True)

    # Send current snapshot of all picker states on connect
    snapshot: dict[str, Any] = {}
    for key in _redis_sync.scan_iter("picker:*:state"):
        parts = key.split(":")
        if len(parts) >= 3:
            pid = parts[1]
            raw = _redis_sync.get(key)
            if raw:
                try:
                    snapshot[pid] = json.loads(raw)
                except json.JSONDecodeError:
                    pass
    if snapshot:
        await websocket.send_text(json.dumps({"type": "snapshot", "pickers": snapshot}))

    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(data)
            except asyncio.TimeoutError:
                # Send a keepalive ping to detect stale connections
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        stop_event.set()
        try:
            pubsub.punsubscribe("picker:*:updates")
            pubsub.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# WebSocket — single picker operator view
# ---------------------------------------------------------------------------

@app.websocket("/ws/{picker_id}")
async def ws_picker(websocket: WebSocket, picker_id: str):
    """Operator feed — receives state updates for a single picker."""
    await websocket.accept()

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    stop_event = threading.Event()

    pubsub = _make_pubsub()
    channel = f"picker:{picker_id}:updates"
    pubsub.subscribe(channel)
    _launch_listener(pubsub, queue, loop, stop_event)

    # Send current state immediately on connect (before any Pub/Sub messages arrive)
    raw = _redis_sync.get(f"picker:{picker_id}:state")
    if raw:
        await websocket.send_text(raw)

    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=30.0)
                await websocket.send_text(data)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        stop_event.set()
        try:
            pubsub.unsubscribe(channel)
            pubsub.close()
        except Exception:
            pass
