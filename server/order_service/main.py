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

import json as _json
import os
import random
import sys
import pathlib
import uuid

# Ensure the service root is on sys.path so that models.py and seed_data.py
# are importable regardless of how uvicorn is invoked.
_SERVICE_ROOT = pathlib.Path(__file__).resolve().parent
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

import pathlib as _pathlib
import time as _time
from datetime import datetime as _dt, timezone as _tz
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Order, OrderLine, User, OrderTote, ToteLayer, ToteLineAssignment, WarehouseScenario  # noqa: F401
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
    _sessions_rehydrate()


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
                  "haptic_enabled_default", "mid_pick_validate_after", "instance_profile",
                  "demo_scenario"):
            if k in body:
                setattr(row, k, body[k])
        s.commit()
        return _row_to_dict(row)
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Bob's Tiny Treasures — warehouse setup & scenario management endpoints
# ---------------------------------------------------------------------------

import json as _json
from models import (
    StagingContainer as _StagingContainer,
    WarehouseScenario as _WarehouseScenario,
)

_ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_SCRATCH_ID  = "scratch"
_TOTE_CAP_KG = 0.1


@app.get("/instance-profile", tags=["btt"])
def get_instance_profile():
    """Return the active instance profile (empty string = vanilla)."""
    s = _SessionLocal()
    try:
        row = s.query(_WorkflowConfig).first()
        profile = row.instance_profile if row else ""
        return {"profile": profile}
    finally:
        s.close()


@app.post("/warehouse/grid", tags=["btt"])
async def generate_warehouse_grid(request: Request):
    """Generate shelf StagingContainers for a rows×cols grid.

    Deletes any existing SHELF:* containers first, then creates fresh ones.
    Body: {"rows": int, "cols": int}
    """
    body = await request.json()
    rows = int(body.get("rows", 3))
    cols = int(body.get("cols", 3))
    if not (1 <= rows <= 26 and 1 <= cols <= 9):
        raise HTTPException(status_code=422, detail="rows must be 1-26, cols must be 1-9")

    s = _SessionLocal()
    try:
        # Remove existing shelf locations (staging_type == "area" and qr starts SHELF:)
        existing = s.query(_StagingContainer).filter(
            _StagingContainer.qr_payload.like("SHELF:%")
        ).all()
        for sc in existing:
            s.delete(sc)
        s.flush()

        created = []
        for r in range(rows):
            for c in range(1, cols + 1):
                code = f"{_ROW_LETTERS[r]}{c}"
                sc = _StagingContainer(
                    code         = code,
                    label        = f"Shelf {_ROW_LETTERS[r]}{c}",
                    staging_type = "area",
                    qr_payload   = f"SHELF:{code}",
                    status       = "available",
                )
                s.add(sc)
                created.append(_row_to_dict(sc))
        s.commit()
        return {"created": len(created), "shelves": created}
    finally:
        s.close()


@app.post("/warehouse/inventory", tags=["btt"])
async def record_inventory(request: Request):
    """Upsert a stock assignment on the scratch WarehouseScenario.

    Body: {"location_code": str, "product_barcode": str, "qty": int}
    If the scratch scenario does not exist it is created with a default 3×3 grid.
    """
    body = await request.json()
    location_code   = body.get("location_code", "").upper()
    product_barcode = body.get("product_barcode", "").upper()
    qty             = int(body.get("qty", 1))

    if not location_code or not product_barcode:
        raise HTTPException(status_code=422, detail="location_code and product_barcode required")

    s = _SessionLocal()
    try:
        scratch = s.get(_WarehouseScenario, _SCRATCH_ID)
        if scratch is None:
            scratch = _WarehouseScenario(
                id         = _SCRATCH_ID,
                name       = "scratch",
                grid_rows  = 3,
                grid_cols  = 3,
                payload    = "[]",
            )
            s.add(scratch)
            s.flush()

        items: list = _json.loads(scratch.payload)
        # Upsert: replace any existing entry for this location
        items = [i for i in items if i.get("location_code") != location_code]
        items.append({
            "location_code":   location_code,
            "product_barcode": product_barcode,
            "qty_on_hand":     qty,
        })
        scratch.payload = _json.dumps(items)
        s.commit()
        return {"location_code": location_code, "product_barcode": product_barcode,
                "qty_on_hand": qty, "total_assigned": len(items)}
    finally:
        s.close()


@app.get("/warehouse/scenarios", tags=["btt"])
def list_scenarios():
    """List all saved WarehouseScenarios (excludes the scratch row)."""
    s = _SessionLocal()
    try:
        rows = s.query(_WarehouseScenario).filter(
            _WarehouseScenario.id != _SCRATCH_ID
        ).order_by(_WarehouseScenario.created_at.desc()).all()
        return [_row_to_dict(r) for r in rows]
    finally:
        s.close()


@app.post("/warehouse/scenarios", status_code=201, tags=["btt"])
async def save_scenario(request: Request):
    """Save the current scratch inventory as a named scenario.

    Body: {"name": str}
    Copies the scratch payload into a new (or replaced) named row.
    """
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    s = _SessionLocal()
    try:
        scratch = s.get(_WarehouseScenario, _SCRATCH_ID)
        payload = scratch.payload if scratch else "[]"
        grid_rows = scratch.grid_rows if scratch else 3
        grid_cols = scratch.grid_cols if scratch else 3

        # Replace existing scenario with same name if present
        existing = s.query(_WarehouseScenario).filter(
            _WarehouseScenario.name == name,
            _WarehouseScenario.id   != _SCRATCH_ID,
        ).first()
        if existing:
            existing.payload   = payload
            existing.grid_rows = grid_rows
            existing.grid_cols = grid_cols
            s.commit()
            return _row_to_dict(existing)

        row = _WarehouseScenario(
            id        = str(_uuid.uuid4()),
            name      = name,
            grid_rows = grid_rows,
            grid_cols = grid_cols,
            payload   = payload,
        )
        s.add(row)
        s.commit()
        return _row_to_dict(row)
    finally:
        s.close()


@app.get("/warehouse/scenarios/{scenario_id}", tags=["btt"])
def get_scenario(scenario_id: str):
    """Load a saved scenario by ID."""
    s = _SessionLocal()
    try:
        row = s.get(_WarehouseScenario, scenario_id)
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return _row_to_dict(row)
    finally:
        s.close()


@app.delete("/warehouse/scenarios/{scenario_id}", status_code=204, tags=["btt"])
def delete_scenario(scenario_id: str):
    """Delete a saved scenario. Cannot delete the scratch row."""
    if scenario_id == _SCRATCH_ID:
        raise HTTPException(status_code=400, detail="Cannot delete the scratch scenario")
    s = _SessionLocal()
    try:
        row = s.get(_WarehouseScenario, scenario_id)
        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")
        s.delete(row)
        s.commit()
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Bob's Tiny Treasures — Physical Test Setup
# ---------------------------------------------------------------------------
#
# POST /warehouse/physical-test-setup
#
# One-shot endpoint for supervisors preparing a physical prop-based demo run.
# Accepts shelves (rows×cols), packing areas, tote count, and kit count.
# A "kit" = one of every BTT product (9 items).
#
# Actions performed atomically:
#   1. Generate shelf StagingContainers (rows×cols grid — replaces any existing)
#   2. Distribute kit stock round-robin across shelf locations
#   3. Upsert the scratch WarehouseScenario with the resulting layout
#   4. Save a named WarehouseScenario snapshot: "Physical Test — {name}"
#
# Returns: the scenario row + order capacity estimate.

_BTT_ALL_PRODUCTS = [
    "BTT-00101", "BTT-00102", "BTT-00103",
    "BTT-00201", "BTT-00202", "BTT-00203",
    "BTT-00301", "BTT-00302", "BTT-00303",
]
_ITEMS_PER_KIT = len(_BTT_ALL_PRODUCTS)   # 9


@app.post("/warehouse/physical-test-setup", tags=["btt"])
async def physical_test_setup(request: Request):
    """Generate a complete physical-test warehouse layout from kit parameters.

    Body:
      rows            int  — shelf rows (1–26, default 3)
      cols            int  — shelf columns per row (1–9, default 3)
      kits            int  — number of complete kits (each = 1× all 9 BTT products)
      packing_areas   int  — number of packing areas (informational only, stored in scenario name)
      totes           int  — number of physical totes (informational only, stored in scenario name)
      scenario_name   str  — optional; defaults to auto-generated

    Returns:
      scenario        — saved WarehouseScenario row
      shelves_created int
      stock_entries   int
      order_capacity  { min: int, max: int }  — estimated fillable orders
    """
    body           = await request.json()
    rows           = max(1, min(26, int(body.get("rows", 3))))
    cols           = max(1, min(9,  int(body.get("cols", 3))))
    kits           = max(1, int(body.get("kits", 1)))
    packing_areas  = max(1, int(body.get("packing_areas", 1)))
    totes          = max(1, int(body.get("totes", 1)))
    scenario_name  = (body.get("scenario_name") or "").strip() or (
        f"Physical Test — {rows}×{cols} grid, {kits} kit{'s' if kits != 1 else ''}, "
        f"{totes} tote{'s' if totes != 1 else ''}"
    )

    # Total individual items = kits × 9 products; qty per shelf location
    total_items = kits * _ITEMS_PER_KIT       # e.g. 3 kits × 9 = 27 items
    shelf_count = rows * cols                  # e.g. 3×3 = 9 shelves

    s = _SessionLocal()
    try:
        # ── Step 1: regenerate shelf grid ───────────────────────────────────
        existing_shelves = s.query(_StagingContainer).filter(
            _StagingContainer.qr_payload.like("SHELF:%")
        ).all()
        for sc in existing_shelves:
            s.delete(sc)
        s.flush()

        shelf_codes = []
        for r in range(rows):
            for c in range(1, cols + 1):
                code = f"{_ROW_LETTERS[r]}{c}"
                sc   = _StagingContainer(
                    code         = code,
                    label        = f"Shelf {code}",
                    staging_type = "area",
                    qr_payload   = f"SHELF:{code}",
                    status       = "available",
                )
                s.add(sc)
                shelf_codes.append(code)
        s.flush()

        # ── Step 2: distribute stock round-robin across shelves ─────────────
        # Each kit contributes 1 of every product.  We assign products to
        # shelves round-robin so stock spreads evenly.
        # stock_map: location_code → {product_barcode → qty}
        stock_map: dict[str, dict[str, int]] = {code: {} for code in shelf_codes}
        shelf_idx = 0
        for _ in range(kits):
            for barcode in _BTT_ALL_PRODUCTS:
                loc = shelf_codes[shelf_idx % shelf_count]
                stock_map[loc][barcode] = stock_map[loc].get(barcode, 0) + 1
                shelf_idx += 1

        # ── Step 3: upsert scratch scenario ─────────────────────────────────
        stock_entries = []
        for loc, products in stock_map.items():
            for barcode, qty in products.items():
                stock_entries.append({
                    "location_code":   loc,
                    "product_barcode": barcode,
                    "qty_on_hand":     qty,
                })

        scratch = s.get(_WarehouseScenario, _SCRATCH_ID)
        if scratch is None:
            scratch = _WarehouseScenario(
                id        = _SCRATCH_ID,
                name      = "scratch",
                grid_rows = rows,
                grid_cols = cols,
                payload   = "[]",
            )
            s.add(scratch)
            s.flush()

        scratch.grid_rows = rows
        scratch.grid_cols = cols
        scratch.payload   = _json.dumps(stock_entries)

        # ── Step 4: save named scenario ─────────────────────────────────────
        existing_named = s.query(_WarehouseScenario).filter(
            _WarehouseScenario.name == scenario_name,
            _WarehouseScenario.id   != _SCRATCH_ID,
        ).first()
        if existing_named:
            existing_named.grid_rows = rows
            existing_named.grid_cols = cols
            existing_named.payload   = _json.dumps(stock_entries)
            scenario_row = existing_named
        else:
            import uuid as _uuid_mod
            scenario_row = _WarehouseScenario(
                id        = str(_uuid_mod.uuid4()),
                name      = scenario_name,
                grid_rows = rows,
                grid_cols = cols,
                payload   = _json.dumps(stock_entries),
            )
            s.add(scenario_row)

        s.commit()
        s.refresh(scenario_row)

        # ── Estimate fillable orders ─────────────────────────────────────────
        # Demo orders draw 2–8 lines at random (without replacement from 9 products).
        # With total_items individual picks available:
        #   pessimistic (all 8-line orders): floor(total_items / 8)
        #   optimistic  (all 2-line orders): floor(total_items / 2)
        orders_min = max(0, total_items // 8)
        orders_max = max(0, total_items // 2)

        return {
            "scenario":      _row_to_dict(scenario_row),
            "shelves_created": shelf_count,
            "stock_entries":   len(stock_entries),
            "total_items":     total_items,
            "order_capacity":  {"min": orders_min, "max": orders_max},
            "packing_areas":   packing_areas,
            "totes":           totes,
        }
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Bob's Tiny Treasures — Pack & Verify endpoints
# ---------------------------------------------------------------------------

from packer import plan_packing as _plan_packing
from models import (
    Order      as _Order,
    Product    as _Product,
    OrderTote  as _OrderTote,
    ToteLayer  as _ToteLayer,
    ToteLineAssignment as _ToteLineAssignment,
)


def _pack_plan_to_dict(totes: list) -> dict:
    """Serialise a list of OrderTote ORM rows (with .layers and .assignments) to a plain dict."""
    def _assignment_dict(a) -> dict:
        return {
            "id":               a.id,
            "tote_id":          a.tote_id,
            "line_id":          a.line_id,
            "layer_id":         a.layer_id,
            "quantity_in_tote": a.quantity_in_tote,
            "layer_seq":        a.layer_seq,
        }

    def _layer_dict(layer) -> dict:
        return {
            "id":                  layer.id,
            "tote_id":             layer.tote_id,
            "layer_seq":           layer.layer_seq,
            "status":              layer.status,
            "verification_method": layer.verification_method,
            "verification_result": layer.verification_result,
            "assignments":         [_assignment_dict(a) for a in layer.assignments],
        }

    def _tote_dict(tote) -> dict:
        return {
            "id":                 tote.id,
            "order_id":           tote.order_id,
            "staging_code":       tote.staging_code,
            "tote_seq":           tote.tote_seq,
            "max_weight_kg":      tote.max_weight_kg,
            "assigned_weight_kg": tote.assigned_weight_kg,
            "status":             tote.status,
            "layers":             [_layer_dict(l) for l in tote.layers],
        }

    return {"totes": [_tote_dict(t) for t in totes]}


@app.post("/orders/{order_id}/pack", tags=["btt"])
def pack_order(order_id: str):
    """Run the fallback packer on a completed order.

    Creates OrderTote / ToteLayer / ToteLineAssignment rows.
    Idempotent — if rows already exist, returns the existing plan.
    """
    s = _SessionLocal()
    try:
        order = s.get(_Order, order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.status not in ("complete", "packing"):
            raise HTTPException(
                status_code=409,
                detail=f"Order must be in 'complete' status to pack (current: {order.status!r})"
            )

        # Idempotent: return existing plan if already created
        existing_totes = (
            s.query(_OrderTote)
            .filter(_OrderTote.order_id == order_id)
            .order_by(_OrderTote.tote_seq)
            .all()
        )
        if existing_totes:
            return _pack_plan_to_dict(existing_totes)

        # Build (OrderLine, Product) pairs
        pairs = []
        for line in order.lines:
            product = s.get(_Product, line.product_barcode)
            if product:
                pairs.append((line, product))

        if not pairs:
            raise HTTPException(status_code=422, detail="Order has no lines with known products")

        # Run the pure packer function
        tote_specs = _plan_packing(pairs)

        # Determine staging_code from the first line that has one
        default_staging = next(
            (line.staging_code for line, _ in pairs if line.staging_code), None
        )

        # Persist the plan
        new_totes = []
        for spec in tote_specs:
            tote_id = str(_uuid.uuid4())
            tote = _OrderTote(
                id                 = tote_id,
                order_id           = order_id,
                staging_code       = default_staging,
                tote_seq           = spec.tote_seq,
                max_weight_kg      = _TOTE_CAP_KG,
                assigned_weight_kg = spec.assigned_weight_kg,
                status             = "pending",
            )
            s.add(tote)

            for layer_spec in spec.layers:
                layer_id = str(_uuid.uuid4())
                layer = _ToteLayer(
                    id          = layer_id,
                    tote_id     = tote_id,
                    layer_seq   = layer_spec.layer_seq,
                    status      = "pending",
                )
                s.add(layer)

                # Track how many of each line are assigned to this tote/layer
                qty_map: dict[str, int] = {}
                for item in layer_spec.items:
                    qty_map[item.line_id] = qty_map.get(item.line_id, 0) + 1

                for line_id, qty in qty_map.items():
                    s.add(_ToteLineAssignment(
                        id               = str(_uuid.uuid4()),
                        tote_id          = tote_id,
                        line_id          = line_id,
                        layer_id         = layer_id,
                        quantity_in_tote = qty,
                        layer_seq        = layer_spec.layer_seq,
                    ))

            new_totes.append(tote)

        order.status = "packing"
        s.commit()

        # Re-query to get relationships populated
        totes = (
            s.query(_OrderTote)
            .filter(_OrderTote.order_id == order_id)
            .order_by(_OrderTote.tote_seq)
            .all()
        )
        return _pack_plan_to_dict(totes)
    finally:
        s.close()


@app.get("/orders/{order_id}/pack-plan", tags=["btt"])
def get_pack_plan(order_id: str):
    """Return the existing pack plan (totes + layers + assignments) for an order."""
    s = _SessionLocal()
    try:
        order = s.get(_Order, order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        totes = (
            s.query(_OrderTote)
            .filter(_OrderTote.order_id == order_id)
            .order_by(_OrderTote.tote_seq)
            .all()
        )
        if not totes:
            raise HTTPException(status_code=404, detail="No pack plan found for this order")
        return _pack_plan_to_dict(totes)
    finally:
        s.close()


@app.patch("/orders/{order_id}/totes/{tote_id}/layers/{layer_id}", tags=["btt"])
async def verify_layer(order_id: str, tote_id: str, layer_id: str, request: Request):
    """Mark a layer as verified (or skipped).

    Body: {"status": "verified"|"skipped", "verification_method": str, "verification_result": str}

    Auto-seals the tote when all its layers are done.
    Auto-packs the order when all totes are sealed.
    """
    body = await request.json()
    new_status = body.get("status", "verified")
    if new_status not in ("verified", "skipped"):
        raise HTTPException(status_code=422, detail="status must be 'verified' or 'skipped'")

    s = _SessionLocal()
    try:
        layer = s.get(_ToteLayer, layer_id)
        if not layer or layer.tote_id != tote_id:
            raise HTTPException(status_code=404, detail="Layer not found")

        tote = s.get(_OrderTote, tote_id)
        if not tote or tote.order_id != order_id:
            raise HTTPException(status_code=404, detail="Tote not found")

        # THA-003: idempotency guard — if already verified/skipped, return
        # current plan immediately without re-running auto-seal logic.
        if layer.status in ("verified", "skipped"):
            return _pack_plan_to_dict(
                s.query(_OrderTote)
                .filter(_OrderTote.order_id == order_id)
                .order_by(_OrderTote.tote_seq)
                .all()
            )

        layer.status              = new_status
        layer.verification_method = body.get("verification_method", "none")
        layer.verification_result = body.get("verification_result")

        # Auto-seal tote if all layers are now done
        all_layer_statuses = [l.status for l in tote.layers]
        # Update in-memory: replace the layer we just modified
        all_layer_statuses = [
            new_status if l.id == layer_id else l.status
            for l in tote.layers
        ]
        if all(st in ("verified", "skipped") for st in all_layer_statuses):
            tote.status = "sealed"

        s.flush()

        # Auto-pack order if all totes are sealed
        if tote.status == "sealed":
            order = s.get(_Order, order_id)
            all_totes = s.query(_OrderTote).filter(_OrderTote.order_id == order_id).all()
            if all(t.status == "sealed" for t in all_totes):
                order.status = "packed"

        s.commit()

        return _pack_plan_to_dict(
            s.query(_OrderTote)
            .filter(_OrderTote.order_id == order_id)
            .order_by(_OrderTote.tote_seq)
            .all()
        )
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Bob's Tiny Treasures — Label Sheet Generator endpoints
# ---------------------------------------------------------------------------

from fastapi.responses import Response as _Response
from label_generator import generate_label_pdf as _generate_label_pdf

_DELIVERY_ZONES = [
    {"code": "TINY", "label": "Tiny Tote Line 1",  "qr_payload": "STAGING:TINY"},
    {"code": "WOND", "label": "Wonderland Bay",     "qr_payload": "STAGING:WOND"},
    {"code": "CHRM", "label": "Charm Dispatch",     "qr_payload": "STAGING:CHRM"},
]


@app.get("/labels/products", tags=["btt"])
def list_label_products():
    """Return all BTT products (barcode prefix BTT-) for the label designer."""
    s = _SessionLocal()
    try:
        rows = s.query(_Product).filter(_Product.barcode.like("BTT-%")).order_by(_Product.barcode).all()
        return [
            {
                "barcode":     r.barcode,
                "description": r.description,
                "sku":         r.sku,
                "weight_kg":   r.weight_kg,
                "size_class":  r.size_class,
                "size_inches": r.size_inches,
            }
            for r in rows
        ]
    finally:
        s.close()


@app.post("/labels/generate", tags=["btt"])
async def generate_labels(request: Request):
    """Generate a label sheet PDF and return it as a downloadable file.

    Body: LabelConfig JSON (see label_generator.py for schema).
    Returns: application/pdf
    """
    config = await request.json()

    # Inject zones from server constants if the caller didn't supply them
    if "zones" not in config or not config["zones"]:
        config["zones"] = _DELIVERY_ZONES

    try:
        pdf_bytes = _generate_label_pdf(config)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    return _Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="btt_labels.pdf"'},
    )


# ===========================================================================
# Demo loop — in-memory session store + endpoints
# ===========================================================================
#
# Two modes:
#   "personal"     — each picker_id gets their own independent loop; multiple
#                    sessions can run concurrently (one per picker_id).
#   "presentation" — a single shared loop using picker_id "demo-presenter";
#                    only one presentation loop at a time.
#
# Mistake injection: when mistake_probability > 0, one order line per order
# randomly gets its product_barcode swapped with a non-matching product so
# that the error-handling workflow can be demonstrated live.
# Default is 0 (disabled).  Suggested demo value: 0.2 (20 %).
#
# Safety cap: each session stops automatically after 20 orders.
# ===========================================================================

_BTT_PRODUCTS = [
    "BTT-00101", "BTT-00102", "BTT-00103",
    "BTT-00201", "BTT-00202", "BTT-00203",
    "BTT-00301", "BTT-00302", "BTT-00303",
]
_BTT_STAGING = ["TINY", "WOND", "CHRM"]
_DEMO_MAX_ORDERS = 20
_PRESENTATION_PICKER_ID = "demo-presenter"

# ── Demo session Redis persistence (QOL-026) ─────────────────────────────────
# Sessions survive pod restarts by writing to Redis alongside the in-memory dict.
# Falls back gracefully if Redis is unavailable (in-memory only).

import redis as _redis_lib  # already in Dockerfile

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
_SESSION_KEY_PREFIX = "demo_session:"
_SESSION_TTL = 4 * 3600  # 4 hours — well beyond any realistic demo window

try:
    _redis = _redis_lib.from_url(REDIS_URL, decode_responses=True)
    _redis.ping()
except Exception:
    _redis = None  # type: ignore[assignment]

def _session_save(sid: str, data: dict) -> None:
    """Persist a session dict to Redis (best-effort)."""
    if _redis is None:
        return
    try:
        _redis.setex(f"{_SESSION_KEY_PREFIX}{sid}", _SESSION_TTL, _json.dumps(data))
    except Exception:
        pass

def _session_delete(sid: str) -> None:
    """Remove a session from Redis (best-effort)."""
    if _redis is None:
        return
    try:
        _redis.delete(f"{_SESSION_KEY_PREFIX}{sid}")
    except Exception:
        pass

def _sessions_rehydrate() -> None:
    """On startup: load any live sessions from Redis into _demo_sessions."""
    if _redis is None:
        return
    try:
        for key in _redis.scan_iter(f"{_SESSION_KEY_PREFIX}*"):
            raw = _redis.get(key)
            if not raw:
                continue
            try:
                data = _json.loads(raw)
                sid = data.get("session_id")
                if sid:
                    _demo_sessions[sid] = data
            except Exception:
                pass
    except Exception:
        pass

# session_id → session dict
_demo_sessions: dict[str, dict] = {}


def _create_demo_order(session_data: dict, db_session) -> str:
    """Create one randomized BTT demo order and return its id."""
    session_id = session_data["session_id"]
    seq = session_data["orders_completed"] + 1
    picker_id = session_data["picker_id"]
    mistake_prob = session_data.get("mistake_probability", 0.0)

    reference = f"DEMO-{session_id[:6].upper()}-{seq:03d}"
    customer  = f"Demo ({picker_id})"
    staging_code = random.choice(_BTT_STAGING)

    # Pick 2–8 products without replacement
    n_lines = random.randint(2, min(8, len(_BTT_PRODUCTS)))
    chosen = random.sample(_BTT_PRODUCTS, n_lines)

    # Optionally inject one mistake: swap one line's barcode with a different product
    mistake_idx: int | None = None
    if mistake_prob > 0 and random.random() < mistake_prob and n_lines >= 2:
        mistake_idx = random.randrange(n_lines)

    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        reference=reference,
        customer=customer,
        status="picking",
        created_at=_dt.now(_tz.utc),
    )
    db_session.add(order)

    for i, barcode in enumerate(chosen):
        actual_barcode = barcode
        if i == mistake_idx:
            # Swap with a different product
            others = [p for p in _BTT_PRODUCTS if p != barcode]
            actual_barcode = random.choice(others)

        line = OrderLine(
            id=str(uuid.uuid4()),
            order_id=order_id,
            product_barcode=actual_barcode,
            quantity=random.randint(1, 2),
            quantity_picked=0,
            staging_code=staging_code,
            status="pending",
        )
        db_session.add(line)

    db_session.commit()
    return order_id


def _advance_demo_session(completed_order_id: str) -> None:
    """Called after an order is marked complete.  If a demo session is watching
    that order, create the next order (unless the safety cap is reached)."""
    db = _SessionLocal()
    try:
        for sid, s in list(_demo_sessions.items()):
            if s.get("current_order_id") != completed_order_id:
                continue
            s["orders_completed"] += 1
            if s["orders_completed"] >= _DEMO_MAX_ORDERS:
                del _demo_sessions[sid]
                return
            new_order_id = _create_demo_order(s, db)
            s["current_order_id"] = new_order_id
    finally:
        db.close()


# ── Pydantic models ──────────────────────────────────────────────────────────

class _DemoStartRequest(BaseModel):
    mode: str                          # "personal" | "presentation"
    picker_id: str | None = None       # required when mode="personal"
    mistake_probability: float = 0.0   # 0.0 = off


class _DemoStopRequest(BaseModel):
    session_id: str | None = None      # omit to stop the presentation session


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/demo/start", tags=["demo"])
def demo_start(req: _DemoStartRequest):
    """Start (or restart) a demo order loop.

    Personal mode: each picker_id runs its own independent loop.
    Presentation mode: one shared loop using picker_id 'demo-presenter'.
    Returns the session details including the first order_id.
    """
    db = _SessionLocal()
    try:
        if req.mode == "presentation":
            picker_id = _PRESENTATION_PICKER_ID
            # Stop any existing presentation session
            for sid, s in list(_demo_sessions.items()):
                if s["picker_id"] == _PRESENTATION_PICKER_ID:
                    del _demo_sessions[sid]
                    _session_delete(sid)
        elif req.mode == "personal":
            if not req.picker_id:
                raise HTTPException(status_code=400, detail="picker_id required for personal mode")
            picker_id = req.picker_id
            # Stop any existing personal session for this picker
            for sid, s in list(_demo_sessions.items()):
                if s["picker_id"] == picker_id and s["mode"] == "personal":
                    del _demo_sessions[sid]
                    _session_delete(sid)
        else:
            raise HTTPException(status_code=400, detail="mode must be 'personal' or 'presentation'")

        # QOL-010: cancel stale picking demo orders belonging to *this picker*
        # before creating the first order of the new session — prevents scan
        # ambiguity.  Do NOT cancel orders owned by other active sessions
        # (multi-picker scenario: one picker starting must not wipe others).
        active_order_ids = {
            s.get("current_order_id")
            for s in _demo_sessions.values()
            if s.get("current_order_id")
        }
        expected_customer = f"Demo ({picker_id})"
        stale = db.query(Order).filter(
            Order.status == "picking",
            Order.customer == expected_customer,
        ).all()
        for o in stale:
            if o.id not in active_order_ids:
                o.status = "cancelled"
        db.commit()

        session_id = str(uuid.uuid4())[:8]
        session_data: dict = {
            "session_id":          session_id,
            "picker_id":           picker_id,
            "mode":                req.mode,
            "orders_completed":    0,
            "current_order_id":    None,
            "mistake_probability": req.mistake_probability,
        }
        order_id = _create_demo_order(session_data, db)
        session_data["current_order_id"] = order_id
        _demo_sessions[session_id] = session_data
        _session_save(session_id, session_data)

        return {
            "session_id":          session_id,
            "picker_id":           picker_id,
            "mode":                req.mode,
            "current_order_id":    order_id,
            "mistake_probability": req.mistake_probability,
        }
    finally:
        db.close()


@app.get("/demo/status", tags=["demo"])
def demo_status():
    """Return all active demo sessions."""
    return list(_demo_sessions.values())


@app.post("/demo/stop", status_code=204, tags=["demo"])
def demo_stop(req: _DemoStopRequest):
    """Stop a demo session.  Omit session_id to stop ALL active sessions."""
    db = _SessionLocal()
    try:
        def _cancel_session(sid: str, s: dict) -> None:
            """Remove session and cancel its current picking order."""
            order_id = s.get("current_order_id")
            if order_id:
                o = db.get(Order, order_id)
                if o and o.status == "picking":
                    o.status = "cancelled"
            del _demo_sessions[sid]
            _session_delete(sid)

        if req.session_id:
            s = _demo_sessions.get(req.session_id)
            if s:
                _cancel_session(req.session_id, s)
        else:
            # Stop ALL active sessions (presentation + personal)
            for sid, s in list(_demo_sessions.items()):
                _cancel_session(sid, s)

            # Also cancel any orphaned demo picking orders whose session was
            # lost on a pod restart (in-memory _demo_sessions cleared but
            # SQLite row still has status='picking').
            orphans = (
                db.query(Order)
                .filter(Order.status == "picking", Order.customer.like("Demo (%"))
                .all()
            )
            for o in orphans:
                o.status = "cancelled"

        db.commit()
    finally:
        db.close()


@app.post("/demo/advance", tags=["demo"])
def demo_advance(body: dict):
    """Called by the mobile client after confirming the last pick on an order.

    Idempotent: if the session has already moved past this order_id (because a
    concurrent call already advanced it), the current state is returned without
    creating another order.  This eliminates the double-advance race that occurs
    when two pickers both confirm the final line of the same order.

    Body: {"order_id": str, "picker_id": str}
    Returns the current session state, or {} if no session owns this order.
    """
    order_id  = body.get("order_id")
    picker_id = body.get("picker_id")
    if not order_id or not picker_id:
        raise HTTPException(status_code=400, detail="order_id and picker_id required")

    db = _SessionLocal()
    try:
        for sid, s in list(_demo_sessions.items()):
            # Idempotency gate: if session already moved past this order, return
            # current state without touching orders_completed or creating a new order.
            if s.get("current_order_id") != order_id:
                continue

            s["orders_completed"] += 1
            if s["orders_completed"] >= _DEMO_MAX_ORDERS:
                del _demo_sessions[sid]
                _session_delete(sid)
                return {"done": True, "orders_completed": s["orders_completed"]}
            new_order_id = _create_demo_order(s, db)
            s["current_order_id"] = new_order_id
            _session_save(sid, s)
            return {"current_order_id": new_order_id, "orders_completed": s["orders_completed"]}
        # No session currently owns this order_id — already advanced or no session.
        return {}
    finally:
        db.close()
