"""Order Service — FastAPI application.

Endpoints
---------
GET  /health
GET  /orders
GET  /orders/{order_id}
PATCH /orders/{order_id}/lines/{line_id}
POST /orders/{order_id}/confirm-packed
GET  /products/{barcode}
GET  /staging/{code}
"""

import os
import sys
import pathlib

# Ensure the service root is on sys.path so that models.py and seed_data.py
# are importable regardless of how uvicorn is invoked.
_SERVICE_ROOT = pathlib.Path(__file__).resolve().parent
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

import pathlib as _pathlib
import time as _time
from datetime import datetime as _dt, timezone as _tz
from fastapi import FastAPI, HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, OrderTote, ToteLayer, ToteLineAssignment, WarehouseScenario  # noqa: F401 — imported for create_all side-effect
from seed_data import run_seed
from adapters import get_adapter

# ---------------------------------------------------------------------------
# Database setup
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./picker.db")

_engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
_SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _init_db() -> None:
    """Create all tables (no-op if they already exist) then seed."""
    Base.metadata.create_all(bind=_engine)
    session = _SessionLocal()
    try:
        run_seed(session)
    finally:
        session.close()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

SERVICE_NAME = "order-service"
_VERSION_FILE = _pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)
_STARTED_AT = _dt.now(_tz.utc).isoformat()
_START_MONO = _time.monotonic()

import log_ring as _log_ring

app = FastAPI(
    title="Order Service",
    description=(
        "Manages warehouse orders, products, and staging containers. "
        "Backed by a local SQLite simulation; swap to SAP/OMS via USE_SAP_ADAPTER=true."
    ),
    version=SERVICE_VERSION,
)

_adapter = None


@app.on_event("startup")
def startup_event() -> None:
    global _adapter
    _init_db()
    _adapter = get_adapter()
    _log_ring.attach()


def _get_adapter():
    if _adapter is None:
        raise RuntimeError("Adapter not initialised — startup event has not fired yet.")
    return _adapter


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    summary="Health check",
    description="Returns service liveness status.",
    tags=["meta"],
)
def health():
    return {
        "status":         "ok",
        "service":        SERVICE_NAME,
        "version":        SERVICE_VERSION,
        "started_at":     _STARTED_AT,
        "uptime_seconds": round(_time.monotonic() - _START_MONO),
    }


@app.get("/logs", summary="In-memory log ring", tags=["meta"])
def get_logs():
    return {"service": SERVICE_NAME, "lines": _log_ring.get_lines()}


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

@app.get(
    "/orders",
    summary="List active orders",
    description=(
        "Returns all orders with status **pending** or **picking**, "
        "each with their line items (product description and staging label resolved)."
    ),
    tags=["orders"],
)
def list_orders():
    return _get_adapter().get_orders()


@app.get(
    "/orders/{order_id}",
    summary="Get a single order",
    description="Returns full order detail including resolved line items. 404 if not found.",
    tags=["orders"],
)
def get_order(order_id: str):
    order = _get_adapter().get_order(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"Order {order_id!r} not found")
    return order


@app.patch(
    "/orders/{order_id}/lines/{line_id}",
    summary="Mark a line as picked",
    description=(
        "Increments `quantity_picked` by 1 for the given line. "
        "When `quantity_picked` reaches `quantity` the line status becomes **picked**. "
        "When all lines in the order are picked the order status becomes **complete**. "
        "Returns the updated line."
    ),
    tags=["orders"],
)
def mark_line_picked(order_id: str, line_id: str):
    try:
        return _get_adapter().mark_picked(order_id, line_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post(
    "/orders/{order_id}/confirm-packed",
    summary="Confirm order packed",
    description=(
        "Sets order status to **packed** and locks all staging containers/areas "
        "associated with the order. Returns the updated order."
    ),
    tags=["orders"],
)
def confirm_packed(order_id: str):
    try:
        return _get_adapter().confirm_packed(order_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------

@app.get(
    "/products/{barcode}",
    summary="Get product by barcode",
    description=(
        "Returns product metadata (description, SKU, weight) for the given "
        "Code 128 barcode value. 404 if not found."
    ),
    tags=["products"],
)
def get_product(barcode: str):
    product = _get_adapter().get_product(barcode)
    if product is None:
        raise HTTPException(status_code=404, detail=f"Product {barcode!r} not found")
    return product


# ---------------------------------------------------------------------------
# Staging
# ---------------------------------------------------------------------------

@app.get(
    "/staging/{code}",
    summary="Get staging container by code",
    description=(
        "Returns staging container detail including current order assignments "
        "for the given 4-letter code. 404 if not found."
    ),
    tags=["staging"],
)
def get_staging(code: str):
    staging = _get_adapter().get_staging(code.upper())
    if staging is None:
        raise HTTPException(status_code=404, detail=f"Staging container {code!r} not found")
    return staging


# ---------------------------------------------------------------------------
# Users — CRUD
# ---------------------------------------------------------------------------

import uuid as _uuid
from models import User as _User, CartType as _CartType, AiConfig as _AiConfig, WorkflowConfig as _WorkflowConfig


def _row_to_dict(row) -> dict:
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}


@app.get("/users", tags=["users"])
def list_users():
    s = _SessionLocal()
    try:
        return [_row_to_dict(u) for u in s.query(_User).all()]
    finally:
        s.close()


@app.get("/users/{user_id}", tags=["users"])
def get_user(user_id: str):
    s = _SessionLocal()
    try:
        u = s.query(_User).filter(_User.id == user_id).first()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        return _row_to_dict(u)
    finally:
        s.close()


@app.post("/users", status_code=201, tags=["users"])
async def create_user(request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        u = _User(
            id        = body.get("id") or str(_uuid.uuid4()),
            name      = body["name"],
            role      = body["role"],
            picker_id = body.get("picker_id"),
            pin_hash  = body["pin_hash"],
        )
        s.add(u); s.commit()
        return _row_to_dict(u)
    finally:
        s.close()


@app.put("/users/{user_id}", tags=["users"])
async def update_user(user_id: str, request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        u = s.query(_User).filter(_User.id == user_id).first()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        for k in ("name", "role", "picker_id", "pin_hash"):
            if k in body:
                setattr(u, k, body[k])
        s.commit()
        return _row_to_dict(u)
    finally:
        s.close()


@app.delete("/users/{user_id}", status_code=204, tags=["users"])
def delete_user(user_id: str):
    s = _SessionLocal()
    try:
        u = s.query(_User).filter(_User.id == user_id).first()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        s.delete(u); s.commit()
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Cart Types — CRUD
# ---------------------------------------------------------------------------

@app.get("/cart-types", tags=["cart-types"])
def list_cart_types():
    s = _SessionLocal()
    try:
        return [_row_to_dict(c) for c in s.query(_CartType).all()]
    finally:
        s.close()


@app.post("/cart-types", status_code=201, tags=["cart-types"])
async def create_cart_type(request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        c = _CartType(
            id          = body.get("id") or str(_uuid.uuid4()),
            name        = body["name"],
            max_weight  = float(body.get("max_weight", 0)),
            weight_unit = body.get("weight_unit", "kg"),
            length_cm   = float(body.get("length_cm", 0)),
            width_cm    = float(body.get("width_cm", 0)),
            height_cm   = float(body.get("height_cm", 0)),
            dim_unit    = body.get("dim_unit", "cm"),
            active      = bool(body.get("active", True)),
        )
        s.add(c); s.commit()
        return _row_to_dict(c)
    finally:
        s.close()


@app.put("/cart-types/{cart_id}", tags=["cart-types"])
async def update_cart_type(cart_id: str, request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        c = s.query(_CartType).filter(_CartType.id == cart_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Cart type not found")
        for k in ("name", "max_weight", "weight_unit", "length_cm", "width_cm", "height_cm", "dim_unit", "active"):
            if k in body:
                setattr(c, k, body[k])
        s.commit()
        return _row_to_dict(c)
    finally:
        s.close()


@app.delete("/cart-types/{cart_id}", status_code=204, tags=["cart-types"])
def delete_cart_type(cart_id: str):
    s = _SessionLocal()
    try:
        c = s.query(_CartType).filter(_CartType.id == cart_id).first()
        if not c:
            raise HTTPException(status_code=404, detail="Cart type not found")
        s.delete(c); s.commit()
    finally:
        s.close()


# ---------------------------------------------------------------------------
# AI Config — singleton get/put
# ---------------------------------------------------------------------------

@app.get("/ai-config", tags=["config"])
def get_ai_config():
    s = _SessionLocal()
    try:
        row = s.query(_AiConfig).first()
        if not row:
            row = _AiConfig(); s.add(row); s.commit()
        return _row_to_dict(row)
    finally:
        s.close()


@app.put("/ai-config", tags=["config"])
async def update_ai_config(request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        row = s.query(_AiConfig).first()
        if not row:
            row = _AiConfig(); s.add(row)
        for k in ("provider", "endpoint_url", "api_key", "model",
                  "scan_mandatory_ai", "batch_strategy_ai",
                  "validation_threshold_ai", "voice_mode_ai"):
            if k in body:
                setattr(row, k, body[k])
        s.commit()
        return _row_to_dict(row)
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Workflow Config — singleton get/put
# ---------------------------------------------------------------------------

@app.get("/workflow-config", tags=["config"])
def get_workflow_config():
    s = _SessionLocal()
    try:
        row = s.query(_WorkflowConfig).first()
        if not row:
            row = _WorkflowConfig(); s.add(row); s.commit()
        return _row_to_dict(row)
    finally:
        s.close()


@app.put("/workflow-config", tags=["config"])
async def update_workflow_config(request: Request):
    body = await request.json()
    s = _SessionLocal()
    try:
        row = s.query(_WorkflowConfig).first()
        if not row:
            row = _WorkflowConfig(); s.add(row)
        for k in ("batch_mode", "validation_threshold", "voice_enabled_default",
                  "haptic_enabled_default", "mid_pick_validate_after"):
            if k in body:
                setattr(row, k, body[k])
        s.commit()
        return _row_to_dict(row)
    finally:
        s.close()
