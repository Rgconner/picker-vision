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

from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base
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
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "1.0.0")

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
    return {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION}


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
