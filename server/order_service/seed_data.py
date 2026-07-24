"""Seed the database with realistic warehouse data on first run.

Checks whether the Product table is empty before inserting — safe to call on
every startup without creating duplicate rows.
"""

import uuid
from datetime import datetime

from models import Order, OrderLine, Product, StagingContainer

# ---------------------------------------------------------------------------
# Static seed data
# ---------------------------------------------------------------------------

PRODUCTS = [
    {"barcode": "WH-00001", "description": "Widget A - Small Blue",     "sku": "SKU-A001", "weight_kg": 0.2},
    {"barcode": "WH-00002", "description": "Widget B - Medium Red",     "sku": "SKU-A002", "weight_kg": 0.5},
    {"barcode": "WH-00003", "description": "Gadget C - Large Green",    "sku": "SKU-B001", "weight_kg": 1.2},
    {"barcode": "WH-00004", "description": "Component D - Pack of 10",  "sku": "SKU-B002", "weight_kg": 0.8},
    {"barcode": "WH-00005", "description": "Assembly E - Heavy Duty",   "sku": "SKU-C001", "weight_kg": 3.5},
    {"barcode": "WH-00006", "description": "Part F - Precision",        "sku": "SKU-C002", "weight_kg": 0.1},
    {"barcode": "WH-00007", "description": "Module G - Standard",       "sku": "SKU-D001", "weight_kg": 0.9},
    {"barcode": "WH-00008", "description": "Unit H - Deluxe",           "sku": "SKU-D002", "weight_kg": 2.1},
    {"barcode": "WH-00009", "description": "Item I - Economy",          "sku": "SKU-E001", "weight_kg": 0.3},
    {"barcode": "WH-00010", "description": "Item J - Premium",          "sku": "SKU-E002", "weight_kg": 0.7},
]

STAGING_CONTAINERS = [
    {"code": "ALPH", "label": "Alpha Bay 1",    "staging_type": "area",      "qr_payload": "STAGING:ALPH", "status": "in_use"},
    {"code": "BETA", "label": "Beta Bay 2",     "staging_type": "area",      "qr_payload": "STAGING:BETA", "status": "in_use"},
    {"code": "GAMM", "label": "Gamma Tote 1",   "staging_type": "container", "qr_payload": "STAGING:GAMM", "status": "in_use"},
    {"code": "DELT", "label": "Delta Tote 2",   "staging_type": "container", "qr_payload": "STAGING:DELT", "status": "in_use"},
    {"code": "EPSN", "label": "Epsilon Tote 3", "staging_type": "container", "qr_payload": "STAGING:EPSN", "status": "in_use"},
]

# Orders are defined with explicit UUIDs so the seed is reproducible across restarts.
_ORD1 = "a1b2c3d4-0001-0001-0001-000000000001"
_ORD2 = "a1b2c3d4-0002-0002-0002-000000000002"
_ORD3 = "a1b2c3d4-0003-0003-0003-000000000003"

ORDERS = [
    {
        "id": _ORD1,
        "reference": "ORD-2024-001",
        "customer": "Acme Corp",
        "status": "picking",
        "created_at": datetime(2024, 1, 15, 9, 0, 0),
        "lines": [
            {"id": "b1000001-0001-0001-0001-000000000001", "product_barcode": "WH-00001", "quantity": 2, "staging_code": "ALPH"},
            {"id": "b1000001-0001-0001-0001-000000000002", "product_barcode": "WH-00003", "quantity": 1, "staging_code": "ALPH"},
            {"id": "b1000001-0001-0001-0001-000000000003", "product_barcode": "WH-00007", "quantity": 3, "staging_code": "BETA"},
        ],
    },
    {
        "id": _ORD2,
        "reference": "ORD-2024-002",
        "customer": "Globex Ltd",
        "status": "picking",
        "created_at": datetime(2024, 1, 15, 10, 30, 0),
        "lines": [
            {"id": "b2000002-0002-0002-0002-000000000001", "product_barcode": "WH-00002", "quantity": 1, "staging_code": "GAMM"},
            {"id": "b2000002-0002-0002-0002-000000000002", "product_barcode": "WH-00005", "quantity": 2, "staging_code": "GAMM"},
            {"id": "b2000002-0002-0002-0002-000000000003", "product_barcode": "WH-00009", "quantity": 4, "staging_code": "DELT"},
        ],
    },
    {
        "id": _ORD3,
        "reference": "ORD-2024-003",
        "customer": "Initech Inc",
        "status": "pending",
        "created_at": datetime(2024, 1, 15, 11, 0, 0),
        "lines": [
            {"id": "b3000003-0003-0003-0003-000000000001", "product_barcode": "WH-00004", "quantity": 2, "staging_code": "EPSN"},
            {"id": "b3000003-0003-0003-0003-000000000002", "product_barcode": "WH-00006", "quantity": 5, "staging_code": "EPSN"},
            {"id": "b3000003-0003-0003-0003-000000000003", "product_barcode": "WH-00008", "quantity": 1, "staging_code": "EPSN"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

def run_seed(session) -> None:
    """Populate the database with seed data if the Product table is empty."""
    if session.query(Product).first() is not None:
        return  # already seeded

    for p in PRODUCTS:
        session.add(Product(**p))

    for s in STAGING_CONTAINERS:
        session.add(StagingContainer(**s))

    for order_data in ORDERS:
        lines_data = order_data.pop("lines")
        order = Order(**order_data)
        session.add(order)
        for line_data in lines_data:
            session.add(OrderLine(order_id=order.id, **line_data))
        order_data["lines"] = lines_data  # restore for repeatability

    session.commit()
