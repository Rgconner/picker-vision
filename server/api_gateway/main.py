import asyncio
import json
import logging
import os
import pathlib
import time
from datetime import datetime, timezone

import httpx
import redis as redis_lib
import websockets
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

SERVICE_NAME = "api-gateway"
_VERSION_FILE = pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)
_STARTED_AT = datetime.now(timezone.utc).isoformat()
_START_MONO = time.monotonic()
_COUNTERS: dict[str, int] = {
    "pickers_registered": 0,
    "events_proxied":     0,
    "http_requests":      0,
}

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

PICKER_TTL = 120          # seconds — Redis key TTL; must be > PICKER_STALE_AFTER
PICKER_STALE_AFTER = 45   # seconds — Pi heartbeats every 30s; allow 1.5× before marking offline

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_gateway")
import log_ring as _log_ring
_log_ring.attach()

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


def _picker_status(info: dict) -> str:
    last_seen_at = info.get("last_seen_at")
    if not last_seen_at:
        return info.get("status", "offline")
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_seen_at)).total_seconds()
        return "online" if age <= PICKER_STALE_AFTER else "offline"
    except ValueError:
        return info.get("status", "offline")


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
    if _redis:
        _redis.setex(key, PICKER_TTL, json.dumps(info))
    else:
        _memory_registry[key] = info


def _redis_get_picker(picker_id: str) -> dict | None:
    key = _picker_key(picker_id, "info")
    if _redis:
        raw = _redis.get(key)
        return json.loads(raw) if raw else None
    return _memory_registry.get(key)


def _redis_list_pickers() -> list[dict]:
    if _redis:
        keys = _redis.keys("picker:*:info")
        pickers = []
        for key in keys:
            raw = _redis.get(key)
            if not raw:
                continue
            info = json.loads(raw)
            info["status"] = _picker_status(info)
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
_API_KEY_EXEMPT_EXACT    = {"/health", "/pickers/register", "/api/logs", "/api/telemetry"}
_API_KEY_EXEMPT_PREFIXES = ("/api/debug/",)
_DEBUG_LOG_TTL           = 600   # 10 minutes
_DEBUG_LOG_MAXLEN        = 100   # max log lines per picker in Redis list


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    _COUNTERS["http_requests"] += 1
    if REQUIRE_API_KEY:
        path = request.url.path
        exempt = path in _API_KEY_EXEMPT_EXACT or any(path.startswith(p) for p in _API_KEY_EXEMPT_PREFIXES)
        if not exempt:
            key = request.headers.get("X-API-Key", "")
            if not key or key != API_KEY:
                return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})
    return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _proxy(method: str, url: str, body: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Use `is not None` so an empty dict {} is still serialised as a JSON
        # object body — `if body` treats {} as falsy and omits the body,
        # causing FastAPI Pydantic 422 errors on endpoints that require a body.
        if body is not None:
            resp = await client.request(method, url, json=body)
        else:
            resp = await client.request(method, url)
        resp.raise_for_status()
        # 204 No Content has no body — return empty dict rather than crashing on .json()
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()


async def _ws_proxy(client_ws: WebSocket, upstream_url: str, picker_id: str = "unknown"):
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
    except Exception as e:
        logger.warning("WS proxy error picker=%s: %s", picker_id, e)
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
    device_id: str | None = None      # persistent browser UUID from localStorage
    user_agent: str | None = None     # navigator.userAgent — identifies device model


class ControlBody(BaseModel):
    action: str
    staging_code: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
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


@app.post("/pickers/register")
async def register_picker(body: PickerRegisterBody):
    _COUNTERS["pickers_registered"] += 1
    now = datetime.now(timezone.utc).isoformat()
    existing = _redis_get_picker(body.picker_id) or {}

    # Reject registration if picker_id is already owned by a different device.
    # This prevents a desktop/laptop session from stomping a mobile scanner session.
    if (
        body.device_id
        and existing.get("device_id")
        and existing["device_id"] != body.device_id
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "picker_id_conflict",
                "message": f"Picker ID '{body.picker_id}' is already registered by another device. Choose a different ID.",
                "picker_id": body.picker_id,
            }
        )

    info = {
        "picker_id":    body.picker_id,
        "stream_url":   body.stream_url,
        "control_url":  body.control_url,
        "status":       "online",
        "registered_at": existing.get("registered_at", now),
        "last_seen_at": now,
        "version":      body.version,
        "device_id":    body.device_id or existing.get("device_id"),
        "user_agent":   body.user_agent or existing.get("user_agent"),
    }
    _redis_set_picker(info)
    return {"registered": True, "picker_id": body.picker_id}


@app.post("/pickers/heartbeat")
async def heartbeat_picker(body: PickerRegisterBody):
    return await register_picker(body)


@app.get("/pickers")
async def list_pickers():
    return _redis_list_pickers()


@app.get("/stream/{picker_id}")
async def stream(picker_id: str):
    raise HTTPException(status_code=404, detail="Direct picker streaming is not available in Kubernetes mode")


@app.post("/control/{picker_id}")
async def control(picker_id: str, body: ControlBody):
    info = _redis_get_picker(picker_id)
    if not info:
        raise HTTPException(status_code=404, detail="Picker not found")
    raise HTTPException(status_code=501, detail="Direct picker control is not available in Kubernetes mode")


@app.post("/events/detection")
async def events_detection(request: Request):
    _COUNTERS["events_proxied"] += 1
    body = await request.json()
    return await _proxy("POST", f"{EVENT_PROCESSOR_URL}/events/detection", body)


@app.websocket("/ws/{picker_id}")
async def ws_picker(picker_id: str, websocket: WebSocket):
    upstream = f"ws://{_ws_hub_host}/ws/{picker_id}"
    await _ws_proxy(websocket, upstream, picker_id=picker_id)


@app.websocket("/ws/supervisor")
async def ws_supervisor(websocket: WebSocket):
    upstream = f"ws://{_ws_hub_host}/ws/supervisor"
    await _ws_proxy(websocket, upstream, picker_id="supervisor")


# ---------------------------------------------------------------------------
# Order / Product / Staging proxies
# ---------------------------------------------------------------------------

@app.get("/api/users")
async def api_users():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/users")

@app.post("/api/users")
async def api_create_user(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/users", await request.json())

@app.put("/api/users/{user_id}")
async def api_update_user(user_id: str, request: Request):
    return await _proxy("PUT", f"{ORDER_SERVICE_URL}/users/{user_id}", await request.json())

@app.delete("/api/users/{user_id}")
async def api_delete_user(user_id: str):
    return await _proxy("DELETE", f"{ORDER_SERVICE_URL}/users/{user_id}")

@app.get("/api/cart-types")
async def api_cart_types():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/cart-types")

@app.post("/api/cart-types")
async def api_create_cart_type(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/cart-types", await request.json())

@app.put("/api/cart-types/{cart_id}")
async def api_update_cart_type(cart_id: str, request: Request):
    return await _proxy("PUT", f"{ORDER_SERVICE_URL}/cart-types/{cart_id}", await request.json())

@app.delete("/api/cart-types/{cart_id}")
async def api_delete_cart_type(cart_id: str):
    return await _proxy("DELETE", f"{ORDER_SERVICE_URL}/cart-types/{cart_id}")

@app.get("/api/ai-config")
async def api_get_ai_config():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/ai-config")

@app.put("/api/ai-config")
async def api_update_ai_config(request: Request):
    return await _proxy("PUT", f"{ORDER_SERVICE_URL}/ai-config", await request.json())

@app.get("/api/workflow-config")
async def api_get_workflow_config():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/workflow-config")

@app.put("/api/workflow-config")
async def api_update_workflow_config(request: Request):
    return await _proxy("PUT", f"{ORDER_SERVICE_URL}/workflow-config", await request.json())


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


# ── Demo loop proxies ────────────────────────────────────────────────────────

@app.post("/api/demo/start")
async def api_demo_start(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/demo/start", await request.json())

@app.get("/api/demo/status")
async def api_demo_status():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/demo/status")

@app.post("/api/demo/stop")
async def api_demo_stop(request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        logger.debug("demo/stop: no JSON body")
    # Pass body dict always (even when empty) so FastAPI Pydantic on the
    # order-service receives a valid JSON object and doesn't return 422.
    result = await _proxy("POST", f"{ORDER_SERVICE_URL}/demo/stop", body)

    # QOL-028: broadcast demo_reset to all connected picker WebSocket channels
    # so mobile clients can stop their scan loop and show "Demo ended" screen.
    try:
        import json as _json
        reset_msg = _json.dumps({"type": "demo_reset"})
        for key in _redis.scan_iter("picker:*:state"):
            parts = key.split(":")
            if len(parts) >= 2:
                pid = parts[1]
                _redis.publish(f"picker:{pid}:updates", reset_msg)
        logger.info("demo/stop: published demo_reset to all picker channels")
    except Exception as e:
        logger.warning("demo/stop: failed to publish demo_reset: %s", e)

    return result


# ── BTT warehouse / scenario / label / instance proxy routes ─────────────────
# These were previously only reachable in Vite dev mode via /api/order/* prefix.
# All routes below proxy directly to the order-service under /api/order/*.

@app.get("/api/order/instance-profile")
async def api_instance_profile():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/instance-profile")

@app.post("/api/order/warehouse/grid")
async def api_warehouse_grid(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/warehouse/grid", await request.json())

@app.post("/api/order/warehouse/inventory")
async def api_warehouse_inventory(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/warehouse/inventory", await request.json())

@app.get("/api/order/warehouse/scenarios")
async def api_warehouse_scenarios():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/warehouse/scenarios")

@app.post("/api/order/warehouse/scenarios")
async def api_warehouse_scenarios_save(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/warehouse/scenarios", await request.json())

@app.get("/api/order/warehouse/scenarios/{scenario_id}")
async def api_warehouse_scenario_get(scenario_id: str):
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/warehouse/scenarios/{scenario_id}")

@app.delete("/api/order/warehouse/scenarios/{scenario_id}", status_code=204)
async def api_warehouse_scenario_delete(scenario_id: str):
    return await _proxy("DELETE", f"{ORDER_SERVICE_URL}/warehouse/scenarios/{scenario_id}")

@app.post("/api/order/warehouse/physical-test-setup")
async def api_physical_test_setup(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/warehouse/physical-test-setup", await request.json())

@app.get("/api/order/labels/products")
async def api_labels_products():
    return await _proxy("GET", f"{ORDER_SERVICE_URL}/labels/products")

@app.post("/api/order/labels/generate")
async def api_labels_generate(request: Request):
    import httpx as _httpx
    body = await request.json()
    async with _httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            f"{ORDER_SERVICE_URL}/labels/generate",
            json=body,
            headers={"Content-Type": "application/json"},
        )
    from fastapi.responses import Response as _GwResponse
    return _GwResponse(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/pdf"),
        headers={"Content-Disposition": r.headers.get("content-disposition", "attachment")},
    )

@app.post("/api/demo/advance")
async def api_demo_advance(request: Request):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/demo/advance", await request.json())


# ── Pack wizard proxies ───────────────────────────────────────────────────────

@app.post("/api/orders/{order_id}/pack")
async def api_orders_pack(order_id: str):
    return await _proxy("POST", f"{ORDER_SERVICE_URL}/orders/{order_id}/pack", {})


@app.patch("/api/orders/{order_id}/totes/{tote_id}/layers/{layer_id}")
async def api_orders_layer(order_id: str, tote_id: str, layer_id: str, request: Request):
    return await _proxy(
        "PATCH",
        f"{ORDER_SERVICE_URL}/orders/{order_id}/totes/{tote_id}/layers/{layer_id}",
        await request.json(),
    )


@app.get("/api/scan-log")
async def api_scan_log(limit: int = 50):
    return await _proxy("GET", f"{EVENT_PROCESSOR_URL}/scan-log?limit={limit}")


@app.get("/api/pickers")
async def api_pickers():
    return _redis_list_pickers()


@app.get("/api/versions")
async def api_versions():
    return await _collect_service_versions()


# Service name → internal URL mapping for log proxying
_LOG_SERVICE_URLS: dict[str, str] = {
    "api-gateway":     None,          # self — served directly
    "order-service":   ORDER_SERVICE_URL,
    "event-processor": EVENT_PROCESSOR_URL,
    "websocket-hub":   WEBSOCKET_HUB_URL,
}


@app.get("/api/logs/{service}")
async def api_logs_service(service: str):
    if service == "api-gateway":
        return get_logs()
    url = _LOG_SERVICE_URLS.get(service)
    if url is None:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service!r}")
    return await _proxy("GET", f"{url}/logs")


@app.get("/api/logs/pi/{picker_id}")
async def api_logs_pi(picker_id: str):
    info = _redis_get_picker(picker_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Picker {picker_id!r} not found")
    control_url = info.get("control_url", "").rstrip("/")
    if not control_url:
        raise HTTPException(status_code=503, detail=f"Picker {picker_id!r} has no control_url registered")
    return await _proxy("GET", f"{control_url}/logs")


# ---------------------------------------------------------------------------
# Telemetry — aggregated health + picker registry
# ---------------------------------------------------------------------------

_TELEMETRY_SERVICES = {
    "api-gateway":     None,             # self
    "order-service":   ORDER_SERVICE_URL,
    "event-processor": EVENT_PROCESSOR_URL,
    "websocket-hub":   WEBSOCKET_HUB_URL,
}


async def _collect_telemetry() -> dict:
    """Collect /health from all internal services and merge with picker registry."""
    results: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=3.0) as client:
        for name, url in _TELEMETRY_SERVICES.items():
            if url is None:
                # Self — build from live counters
                results[name] = {
                    "status":         "ok",
                    "service":        SERVICE_NAME,
                    "version":        SERVICE_VERSION,
                    "started_at":     _STARTED_AT,
                    "uptime_seconds": round(time.monotonic() - _START_MONO),
                    "counters":       dict(_COUNTERS),
                }
                continue
            try:
                resp = await client.get(f"{url}/health")
                if resp.status_code == 200:
                    results[name] = {**resp.json(), "reachable": True}
                else:
                    results[name] = {"status": "error", "http_status": resp.status_code, "reachable": False}
            except Exception as exc:
                results[name] = {"status": "unreachable", "error": str(exc), "reachable": False}

    pickers = _redis_list_pickers()
    return {"services": results, "pickers": pickers, "collected_at": datetime.now(timezone.utc).isoformat()}


@app.get("/api/telemetry")
async def api_telemetry():
    return await _collect_telemetry()


@app.get("/api/telemetry/stream")
async def api_telemetry_stream():
    """Server-Sent Events stream — pushes telemetry every 5 seconds."""
    async def _generate():
        while True:
            data = await _collect_telemetry()
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(_generate(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# State proxies
# ---------------------------------------------------------------------------

@app.get("/state/{picker_id}")
async def state_picker(picker_id: str):
    return await _proxy("GET", f"{WEBSOCKET_HUB_URL}/state/{picker_id}")


@app.get("/state/supervisor")
async def state_supervisor():
    return await _proxy("GET", f"{WEBSOCKET_HUB_URL}/state/supervisor")


# ---------------------------------------------------------------------------
# Debug snapshot — stores the latest composite camera+AR JPEG per picker so
# that an external viewer (Bob, supervisor, developer) can see exactly what
# the phone camera is showing, including AR overlay boxes.
#
# POST /api/debug/snapshot/{picker_id}   — phone posts a base64 JPEG snapshot
# GET  /api/debug/snapshot/{picker_id}   — retrieve latest snapshot as image/jpeg
# ---------------------------------------------------------------------------

import base64 as _base64
from fastapi.responses import Response as _Response

_DEBUG_SNAPSHOT_TTL = 30  # seconds — expire if phone stops posting


@app.post("/api/debug/snapshot/{picker_id}")
async def debug_snapshot_post(picker_id: str, request: Request):
    """Accept a base64-encoded JPEG snapshot from the mobile picker and store in Redis."""
    body = await request.json()
    b64: str = body.get("image", "")
    if not b64:
        return {"stored": False, "reason": "no image"}

    # Strip the data URI prefix if present (data:image/jpeg;base64,...)
    if "," in b64:
        b64 = b64.split(",", 1)[1]

    key = f"debug:snapshot:{picker_id}"
    if _redis:
        _redis.setex(key, _DEBUG_SNAPSHOT_TTL, b64)
    else:
        _memory_registry[key] = b64  # type: ignore[assignment]

    return {"stored": True, "picker_id": picker_id}


@app.get("/api/debug/snapshot/{picker_id}")
async def debug_snapshot_get(picker_id: str):
    """Return the latest snapshot for picker_id as a raw JPEG image."""
    key = f"debug:snapshot:{picker_id}"
    b64: str | None = None
    if _redis:
        b64 = _redis.get(key)
    else:
        b64 = _memory_registry.get(key)  # type: ignore[assignment]

    if not b64:
        raise HTTPException(status_code=404, detail=f"No snapshot available for picker {picker_id!r}")

    try:
        jpeg_bytes = _base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=422, detail="Stored snapshot is not valid base64")

    return _Response(content=jpeg_bytes, media_type="image/jpeg")


# ---------------------------------------------------------------------------
# Debug logs — ships browser console output from mobile pickers to the server
# so remote diagnosis does not require physical access to the device.
#
# POST /api/debug/logs/{picker_id}  — phone posts log lines (level + message)
# GET  /api/debug/logs/{picker_id}  — retrieve last N lines, newest first
# ---------------------------------------------------------------------------

@app.post("/api/debug/logs/{picker_id}")
async def debug_logs_post(picker_id: str, request: Request):
    """Accept browser console log lines from the mobile picker and store in Redis."""
    body   = await request.json()
    lines  = body.get("lines", [])
    if not lines:
        return {"stored": 0}

    key = f"debug:logs:{picker_id}"
    stored = 0
    for entry in lines:
        record = {
            "ts":      datetime.now(timezone.utc).isoformat(),
            "level":   entry.get("level", "info"),
            "message": str(entry.get("message", "")),
        }
        if _redis:
            _redis.lpush(key, json.dumps(record))
            _redis.ltrim(key, 0, _DEBUG_LOG_MAXLEN - 1)
            _redis.expire(key, _DEBUG_LOG_TTL)
        stored += 1

    return {"stored": stored, "picker_id": picker_id}


@app.get("/api/debug/logs/{picker_id}")
async def debug_logs_get(picker_id: str, limit: int = 50):
    """Return recent console log lines for picker_id, newest first."""
    limit = min(limit, _DEBUG_LOG_MAXLEN)
    key   = f"debug:logs:{picker_id}"
    lines: list = []
    if _redis:
        raw = _redis.lrange(key, 0, limit - 1)
        lines = [json.loads(r) for r in raw]
    return {"picker_id": picker_id, "lines": lines}
