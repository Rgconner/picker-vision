"""Seed the database with realistic warehouse data on first run.

Checks whether the Product table is empty before inserting — safe to call on
every startup without creating duplicate rows.

PIN hashes are SHA-256 of the plain-text value shown in the comment.
Generate with: python3 -c "import hashlib; print(hashlib.sha256(b'1234').hexdigest())"
"""

from datetime import datetime

from models import (
    AiConfig, CartType, Order, OrderLine,
    Product, StagingContainer, User, WorkflowConfig,
)

# ---------------------------------------------------------------------------
# Users  (2 supervisors, 6 pickers)
# PIN hash = SHA-256 hex of the PIN shown in the comment
# ---------------------------------------------------------------------------

USERS = [
    # ── Supervisors ──────────────────────────────────────────────────────────
    {
        "id":        "sup-00000001-0001-0001-0001-000000000001",
        "name":      "Alex Manager",
        "role":      "supervisor",
        "picker_id": None,
        # password: "sup123"
        "pin_hash":  "b3cad7ff50cd530e8ffdf3d6e553a3706b8a5d22ddbf0d50fde8b50029f0e05e",
    },
    {
        "id":        "sup-00000002-0002-0002-0002-000000000002",
        "name":      "Jordan Lead",
        "role":      "supervisor",
        "picker_id": None,
        # password: "sup456"
        "pin_hash":  "b5b1e4f39b2e7e22a45ee15a3c6dc5fb6c06b0a03f48e78b7da45c8bfbf3f6ef",
    },
    # ── Pickers ───────────────────────────────────────────────────────────────
    {
        "id":        "pick-0000001-0001-0001-0001-000000000001",
        "name":      "Sam",
        "role":      "picker",
        "picker_id": "picker-sam",
        # pin: "1111"
        "pin_hash":  "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c",
    },
    {
        "id":        "pick-0000002-0002-0002-0002-000000000002",
        "name":      "Riley",
        "role":      "picker",
        "picker_id": "picker-riley",
        # pin: "2222"
        "pin_hash":  "e8d95a51f3af4a3b134bf6bb680a213a35973aaa9c1bbe70b7f0dcd68bbf91b3",
    },
    {
        "id":        "pick-0000003-0003-0003-0003-000000000003",
        "name":      "Morgan",
        "role":      "picker",
        "picker_id": "picker-morgan",
        # pin: "3333"
        "pin_hash":  "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    },
    {
        "id":        "pick-0000004-0004-0004-0004-000000000004",
        "name":      "Casey",
        "role":      "picker",
        "picker_id": "picker-casey",
        # pin: "4444"
        "pin_hash":  "35135aaa6cc23891b40cb3f378c53a17a1127210ce60e125ccf03efcfdaec458",
    },
    {
        "id":        "pick-0000005-0005-0005-0005-000000000005",
        "name":      "Dana",
        "role":      "picker",
        "picker_id": "picker-dana",
        # pin: "5555"
        "pin_hash":  "7c9e6679714da9ad1a6b73b14af9b8b7a4ed87cfeee4d16e8e8f1f60b4786f3c",
    },
    {
        "id":        "pick-0000006-0006-0006-0006-000000000006",
        "name":      "Taylor",
        "role":      "picker",
        "picker_id": "picker-taylor",
        # pin: "6666"
        "pin_hash":  "b9776d7ddf459c9ad5b0e1d6ac61e27befb5e99fd62446677600d7cacef544d0",
    },
]

# ---------------------------------------------------------------------------
# Cart Types
# ---------------------------------------------------------------------------

CART_TYPES = [
    {
        "id": "cart-0001-0001-0001-0001-000000000001",
        "name": "Hand Basket",
        "max_weight": 10.0, "weight_unit": "kg",
        "length_cm": 40.0, "width_cm": 30.0, "height_cm": 25.0, "dim_unit": "cm",
        "active": True,
    },
    {
        "id": "cart-0002-0002-0002-0002-000000000002",
        "name": "Push Cart",
        "max_weight": 50.0, "weight_unit": "kg",
        "length_cm": 90.0, "width_cm": 60.0, "height_cm": 100.0, "dim_unit": "cm",
        "active": True,
    },
    {
        "id": "cart-0003-0003-0003-0003-000000000003",
        "name": "Large Flatbed",
        "max_weight": 200.0, "weight_unit": "kg",
        "length_cm": 120.0, "width_cm": 80.0, "height_cm": 15.0, "dim_unit": "cm",
        "active": True,
    },
    {
        "id": "cart-0004-0004-0004-0004-000000000004",
        "name": "Hydraulic Jack",
        "max_weight": 500.0, "weight_unit": "kg",
        "length_cm": 120.0, "width_cm": 50.0, "height_cm": 20.0, "dim_unit": "cm",
        "active": True,
    },
]

# ---------------------------------------------------------------------------
# Products  (with shelf locations and volume/size data)
# Location format: <Aisle><Bay>-<Shelf>  e.g. A01-S2
# ---------------------------------------------------------------------------

PRODUCTS = [
    {"barcode": "WH-00001", "description": "Widget A - Small Blue",    "sku": "SKU-A001", "weight_kg": 0.2,
     "location": "A01-S1", "volume_cm3": 500.0,   "size_class": "S", "value_class": "standard"},
    {"barcode": "WH-00002", "description": "Widget B - Medium Red",    "sku": "SKU-A002", "weight_kg": 0.5,
     "location": "A01-S3", "volume_cm3": 1200.0,  "size_class": "S", "value_class": "standard"},
    {"barcode": "WH-00003", "description": "Gadget C - Large Green",   "sku": "SKU-B001", "weight_kg": 1.2,
     "location": "A02-S1", "volume_cm3": 4000.0,  "size_class": "M", "value_class": "standard"},
    {"barcode": "WH-00004", "description": "Component D - Pack of 10", "sku": "SKU-B002", "weight_kg": 0.8,
     "location": "A02-S4", "volume_cm3": 2000.0,  "size_class": "M", "value_class": "standard"},
    {"barcode": "WH-00005", "description": "Assembly E - Heavy Duty",  "sku": "SKU-C001", "weight_kg": 3.5,
     "location": "B01-S2", "volume_cm3": 12000.0, "size_class": "L", "value_class": "high"},
    {"barcode": "WH-00006", "description": "Part F - Precision",       "sku": "SKU-C002", "weight_kg": 0.1,
     "location": "B01-S1", "volume_cm3": 200.0,   "size_class": "S", "value_class": "high"},
    {"barcode": "WH-00007", "description": "Module G - Standard",      "sku": "SKU-D001", "weight_kg": 0.9,
     "location": "B02-S3", "volume_cm3": 2500.0,  "size_class": "M", "value_class": "standard"},
    {"barcode": "WH-00008", "description": "Unit H - Deluxe",          "sku": "SKU-D002", "weight_kg": 2.1,
     "location": "B02-S1", "volume_cm3": 8000.0,  "size_class": "L", "value_class": "high"},
    {"barcode": "WH-00009", "description": "Item I - Economy",         "sku": "SKU-E001", "weight_kg": 0.3,
     "location": "C01-S2", "volume_cm3": 800.0,   "size_class": "S", "value_class": "standard"},
    {"barcode": "WH-00010", "description": "Item J - Premium",         "sku": "SKU-E002", "weight_kg": 0.7,
     "location": "C01-S4", "volume_cm3": 1800.0,  "size_class": "M", "value_class": "high"},
]

STAGING_CONTAINERS = [
    {"code": "ALPH", "label": "Alpha Bay 1",    "staging_type": "area",      "qr_payload": "STAGING:ALPH", "status": "in_use"},
    {"code": "BETA", "label": "Beta Bay 2",     "staging_type": "area",      "qr_payload": "STAGING:BETA", "status": "in_use"},
    {"code": "GAMM", "label": "Gamma Tote 1",   "staging_type": "container", "qr_payload": "STAGING:GAMM", "status": "in_use"},
    {"code": "DELT", "label": "Delta Tote 2",   "staging_type": "container", "qr_payload": "STAGING:DELT", "status": "in_use"},
    {"code": "EPSN", "label": "Epsilon Tote 3", "staging_type": "container", "qr_payload": "STAGING:EPSN", "status": "in_use"},
]

_ORD1 = "a1b2c3d4-0001-0001-0001-000000000001"
_ORD2 = "a1b2c3d4-0002-0002-0002-000000000002"
_ORD3 = "a1b2c3d4-0003-0003-0003-000000000003"

ORDERS = [
    {
        "id": _ORD1, "reference": "ORD-2024-001", "customer": "Acme Corp",
        "status": "picking", "created_at": datetime(2024, 1, 15, 9, 0, 0),
        "lines": [
            {"id": "b1000001-0001-0001-0001-000000000001", "product_barcode": "WH-00001", "quantity": 2, "staging_code": "ALPH"},
            {"id": "b1000001-0001-0001-0001-000000000002", "product_barcode": "WH-00003", "quantity": 1, "staging_code": "ALPH"},
            {"id": "b1000001-0001-0001-0001-000000000003", "product_barcode": "WH-00007", "quantity": 3, "staging_code": "BETA"},
        ],
    },
    {
        "id": _ORD2, "reference": "ORD-2024-002", "customer": "Globex Ltd",
        "status": "picking", "created_at": datetime(2024, 1, 15, 10, 30, 0),
        "lines": [
            {"id": "b2000002-0002-0002-0002-000000000001", "product_barcode": "WH-00002", "quantity": 1, "staging_code": "GAMM"},
            {"id": "b2000002-0002-0002-0002-000000000002", "product_barcode": "WH-00005", "quantity": 2, "staging_code": "GAMM"},
            {"id": "b2000002-0002-0002-0002-000000000003", "product_barcode": "WH-00009", "quantity": 4, "staging_code": "DELT"},
        ],
    },
    {
        "id": _ORD3, "reference": "ORD-2024-003", "customer": "Initech Inc",
        "status": "pending", "created_at": datetime(2024, 1, 15, 11, 0, 0),
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

    for u in USERS:
        session.add(User(**u))

    for c in CART_TYPES:
        session.add(CartType(**c))

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

    # Seed singleton config rows
    session.add(AiConfig(id=1))
    session.add(WorkflowConfig(id=1))

    session.commit()
