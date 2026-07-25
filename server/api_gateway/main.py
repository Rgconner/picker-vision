import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import httpx
import redis as redis_lib
import websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

SERVICE_NAME = "api-gateway"
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "1.0.0")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://localhost:8001")
EVENT_PROCESSOR_URL = os.getenv("EVENT_PROCESSOR_URL", "http://localhost:8002")
WEBSOCKET_HUB_URL = os.getenv("WEBSOCKET_HUB_URL", "http://localhost:8003")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
REQUIRE_API_KEY = os.getenv("REQUIRE_API_KEY", "false").lower() == "true"
API_KEY = os.getenv("API_KEY", "")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")

# Derive WebSocket host from WEBSOCKET_HUB_URL (strip http:// prefix)
_ws_hub_host = WEBSOCKET_HUB_URL.removeprefix("http://").removeprefix("https://")

PICKER_TTL = 300  # seconds
PICKER_STALE_AFTER = 120  # seconds

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_gateway")

# ---------------------------------------------------------------------------
# Redis (with in-memory fallback)
# ---------------------------------------------------------------------------

_memory_registry: dict[str, dict] = {}

try:
    _redis = redis_lib.from_url(REDIS_URL, decode_responses=True)
    _redis.ping()
    logger.info("Connected to Redis at %s", REDIS_URL)
except Exception as exc:
    logger.warning("Redis unavailable (%s) — using in-memory picker registry", exc)
    _redis = None


def _picker_key(picker_id: str, suffix: str) -> str:
    return f"picker:{picker_id}:{suffix}"


async def _collect_service_versions() -> dict[str, dict]:
    services = {
        "api-gateway": {"url": None, "version": SERVICE_VERSION},
        "order-service": {"url": ORDER_SERVICE_URL},
        "event-processor": {"url": EVENT_PROCESSOR_URL},
        "websocket-hub": {"url": WEBSOCKET_HUB_URL},
    }

    async with httpx.AsyncClient(timeout=3.0) as client:
        for name, service in services.items():
            if service["url"] is None:
                continue
            try:
                resp = await client.get(f"{service['url']}/health")
                if resp.status_code == 200:
                    payload = resp.json()
                    service["version"] = payload.get("version", "unknown")
                else:
                    service["version"] = "unreachable"
            except Exception:
                service["version"] = "unreachable"

    return services


def _redis_set_picker(info: dict) -> None:
    key = _picker_key(info["picker_id"], "info")
    heartbeat_key = _picker_key(info["picker_id"], "heartbeat")
    if _redis:
        pipe = _redis.pipeline()
        pipe.setex(key, PICKER_TTL, json.dumps(info))
        pipe.setex(heartbeat_key, PICKER_TTL, info["last_seen_at"])
        pipe.execute()
    else:
        _memory_registry[key] = info


def _redis_get_picker(picker_id: str) -> dict | None:
    key = _picker_key(picker_id, "info")
    if _redis:
        raw = _redis.get(key)
        return json.loads(raw) if raw else None
    return _memory_registry.get(key)


def _redis_list_pickers() -> list[dict]:
    now = datetime.now(timezone.utc)
    if _redis:
        keys = _redis.keys("picker:*:info")
        pickers = []
        for key in keys:
            raw = _redis.get(key)
            if not raw:
                continue
            info = json.loads(raw)
            last_seen_at = info.get("last_seen_at")
            status = "offline"
            if last_seen_at:
                try:
                    age = (now - datetime.fromisoformat(last_seen_at)).total_seconds()
                    status = "online" if age <= PICKER_STALE_AFTER else "offline"
                except ValueError:
                    status = info.get("status", "offline")
            info["status"] = status
            pickers.append(info)
        return pickers
    return list(_memory_registry.values())


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="API Gateway", version=SERVICE_VERSION)

# CORS middleware
_origins = [o.strip() for o in ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API key middleware
_API_KEY_EXEMPT = {"/health", "/pickers/register"}


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    if REQUIRE_API_KEY and request.url.path not in _API_KEY_EXEMPT:
        key = request.headers.get("X-API-Key", "")
        if not key or key != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _proxy(method: str, url: str, body: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        if body:
            resp = await client.request(method, url, json=body)
        else:
            resp = await client.request(method, url)
        resp.raise_for_status()
        return resp.json()


async def _ws_proxy(client_ws: WebSocket, upstream_url: str):
    await client_ws.accept()
    try:
        async with websockets.connect(upstream_url) as upstream_ws:
            async def forward_to_upstream():
                async for msg in client_ws.iter_text():
                    await upstream_ws.send(msg)

            async def forward_to_client():
                async for msg in upstream_ws:
                    await client_ws.send_text(msg)

            done, pending = await asyncio.wait(
                [asyncio.ensure_future(forward_to_upstream()),
                 asyncio.ensure_future(forward_to_client())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
    except Exception:
        pass
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PickerRegisterBody(BaseModel):
    picker_id: str
    stream_url: str
    control_url: str
    version: str = "unknown"


class ControlBody(BaseModel):
    action: str
    staging_code: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}


@app.post("/pickers/register")
async def register_picker(body: PickerRegisterBody):
    now = datetime.now(timezone.utc).isoformat()
    existing = _redis_get_picker(body.picker_id) or {}
    info = {
        "picker_id": body.picker_id,
        "stream_url": body.stream_url,
        "control_url": body.control_url,
        "status": "online",
        "registered_at": existing.get("registered_at", now),
        "last_seen_at": now,
        "version": body.version,
    }
    _redis_set_picker(info)
    return {"registered": True, "picker_id": body.picker_id}


@app.get("/pickers")
async def list_pickers():
    return _redis_list_pickers()


@app.get("/stream/{picker_id}")
async def stream(picker_id: str):
    info = _redis_get_picker(picker_id)
    if not info:
        raise HTTPException(status_code=404, detail="Picker not found")
    stream_url = info["stream_url"]

    async def _generate():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", stream_url) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(
        _generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/control/{picker_id}")
async def control(picker_id: str, body: ControlBody):
    info = _redis_get_picker(picker_id)
    if not info:
        raise HTTPException(status_code=404, detail="Picker not found")
    return await _proxy("POST", info["control_url"], body.model_dump())


@app.post("/events/detection")
async def events_detection(request: Request):
    body = await request.json()
    return await _proxy("POST", f"{EVENT_PROCESSOR_URL}/events/detection", body)


@app.websocket("/ws/{picker_id}")
async def ws_picker(picker_id: str, websocket: WebSocket):
    upstream = f"ws://{_ws_hub_host}/ws/{picker_id}"
    await _ws_proxy(websocket, upstream)


@app.websocket("/ws/supervisor")
async def ws_supervisor(websocket: WebSocket):
    upstream = f"ws://{_ws_hub_host}/ws/supervisor"
    await _ws_proxy(websocket, upstream)


# ---------------------------------------------------------------------------
# Order / Product / Staging proxies
# ---------------------------------------------------------------------------

@app.get("/api/orders")
async def api_orders():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/orders")


@app.get("/api/orders/{order_id}")
async def api_order(order_id: str):
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/orders/{order_id}")


@app.patch("/api/orders/{order_id}/lines/{line_id}")
async def api_patch_order_line(order_id: str, line_id: str, request: Request):
    body = await request.json()
    return await _proxy("PATCH", f"{ORDER_SERVICE_URL}/orders/{order_id}/lines/{line_id}", body)


@app.post("/api/orders/{order_id}/confirm-packed")
async def api_confirm_packed(order_id: str):
    return await _proxy("POST", f"{EVENT_PROCESSOR_URL}/orders/{order_id}/confirm-packed")


@app.get("/api/products/{barcode}")
async def api_product(barcode: str):
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/products/{barcode}")


@app.get("/api/staging/{code}")
async def api_staging(code: str):
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/staging/{code}")


@app.get("/api/pickers")
async def api_pickers():
    return _redis_list_pickers()


@app.get("/api/versions")
async def api_versions():
    return await _collect_service_versions()


@app.get("/state/{picker_id}")
async def state_picker(picker_id: str):
    return await _proxy("GET", f"{WEBSOCKET_HUB_URL}/state/{picker_id}")


@app.get("/state/supervisor")
async def state_supervisor():
    return await _proxy("GET", f"{WEBSOCKET_HUB_URL}/state/supervisor")
