"""Bob's Tiny Treasures â€” BTT fixture seed script.

Populates the database with the full Bob's Tiny Treasures test scenario:
  - 9 products (3 size classes Ã— 3 colourful names)
  - 9 shelf locations (default 3Ã—3 grid, configurable via GRID_ROWS / GRID_COLS)
  - 3 Tiny Tote delivery zones
  - 3 sample orders (each â‰¤ 100 g â€” fits in a single tote)
  - 3 BTT users (Bob the owner/supervisor + 2 pickers)
  - 1 "Tiny Tray" cart type
  - WorkflowConfig.instance_profile set to "bobs-tiny-treasures"

Safe to run multiple times â€” idempotent (guards on BTT product presence).
Does NOT touch the base picker-vision seed data.

Usage:
    python seed_btt.py                            # default: sqlite:///./picker.db
    python seed_btt.py --db sqlite:///path/to/picker.db
    python seed_btt.py --db $DATABASE_URL         # any SQLAlchemy URL

PIN hashes are SHA-256 of the plain-text value shown in the comment.
Generate with:
    python3 -c "import hashlib; print(hashlib.sha256(b'btt01').hexdigest())"
"""

import argparse
import hashlib
import sys
import pathlib
from datetime import datetime

# â”€â”€ Resolve the order-service root so models.py is importable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_SERVICE_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent / "server" / "order_service"
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import (
    Base, CartType, Order, OrderLine,
    Product, StagingContainer, User, WorkflowConfig,
)

# ---------------------------------------------------------------------------
# Grid constants â€” change here to alter the default warehouse layout
# ---------------------------------------------------------------------------

GRID_ROWS = 3   # A, B, C
GRID_COLS = 3   # 1, 2, 3
TOTE_WEIGHT_CAP_KG = 0.1   # 100 g per Tiny Tote

# ---------------------------------------------------------------------------
# Users
# PIN hash = SHA-256 hex of the value shown in the comment
# ---------------------------------------------------------------------------

USERS = [
    {
        "id":        "btt-sup-0001-0001-0001-0001-000000000001",
        "name":      "Bob (Owner)",
        "role":      "supervisor",
        "picker_id": None,
        # password: "btt01"
        "pin_hash":  hashlib.sha256(b"btt01").hexdigest(),
    },
    {
        "id":        "btt-pick-0001-0001-0001-0001-000000000001",
        "name":      "Sprinkle",
        "role":      "picker",
        "picker_id": "picker-sprinkle",
        # pin: "7777"
        "pin_hash":  hashlib.sha256(b"7777").hexdigest(),
    },
    {
        "id":        "btt-pick-0002-0002-0002-0002-000000000002",
        "name":      "Glimmer",
        "role":      "picker",
        "picker_id": "picker-glimmer",
        # pin: "8888"
        "pin_hash":  hashlib.sha256(b"8888").hexdigest(),
    },
    {
        "id":        "btt-pick-0003-0003-0003-0003-000000000003",
        "name":      "Twinkle",
        "role":      "picker",
        "picker_id": "picker-twinkle",
        # pin: "1111"
        "pin_hash":  hashlib.sha256(b"1111").hexdigest(),
    },
    {
        "id":        "btt-pick-0004-0004-0004-0004-000000000004",
        "name":      "Dazzle",
        "role":      "picker",
        "picker_id": "picker-dazzle",
        # pin: "2222"
        "pin_hash":  hashlib.sha256(b"2222").hexdigest(),
    },
    {
        "id":        "btt-pick-0005-0005-0005-0005-000000000005",
        "name":      "Pebble",
        "role":      "picker",
        "picker_id": "picker-pebble",
        # pin: "3333"
        "pin_hash":  hashlib.sha256(b"3333").hexdigest(),
    },
    {
        "id":        "btt-pick-0006-0006-0006-0006-000000000006",
        "name":      "Fizz",
        "role":      "picker",
        "picker_id": "picker-fizz",
        # pin: "4444"
        "pin_hash":  hashlib.sha256(b"4444").hexdigest(),
    },
    {
        "id":        "btt-pick-0007-0007-0007-0007-000000000007",
        "name":      "Cosmo",
        "role":      "picker",
        "picker_id": "picker-cosmo",
        # pin: "5555"
        "pin_hash":  hashlib.sha256(b"5555").hexdigest(),
    },
    {
        "id":        "btt-pick-0008-0008-0008-0008-000000000008",
        "name":      "Blaze",
        "role":      "picker",
        "picker_id": "picker-blaze",
        # pin: "6666"
        "pin_hash":  hashlib.sha256(b"6666").hexdigest(),
    },
]

# ---------------------------------------------------------------------------
# Cart Types
# "Tiny Tray" â€” a small picking tray sized for Tiny Treasures
# Dimensions: 6Ã—4Ã—2 inches converted to cm (1 in = 2.54 cm)
# max_weight slightly over the tote cap so the tray can hold a full order
# before items are split into individual totes at pack time.
# ---------------------------------------------------------------------------

CART_TYPES = [
    {
        "id":          "btt-cart-0001-0001-0001-0001-000000000001",
        "name":        "Tiny Tray",
        "max_weight":  0.15,            # 150 g â€” a tray can hold more than one tote's worth
        "weight_unit": "kg",
        "length_cm":   15.24,           # 6 in
        "width_cm":    10.16,           # 4 in
        "height_cm":   5.08,            # 2 in
        "dim_unit":    "cm",
        "active":      True,
    },
]

# ---------------------------------------------------------------------------
# Products â€” Bob's Tiny Treasures catalogue
#
# Three 3D-printed size primitives, three fun names each.
# Weights are intentionally light (grams) to respect the 100 g tote cap.
# volume_cm3 is approximate (footprint area Ã— ~2.5 cm height for 1Ã—1,
# proportionally scaled for larger sizes).
#
# Barcode prefix: BTT-  (clearly distinct from base WH- barcodes)
# Location:       set to None â€” assigned at run-time via the inventory scanner
# ---------------------------------------------------------------------------

PRODUCTS = [
    # â”€â”€ 1Ã—1 inch (â‰ˆ 2.54 Ã— 2.54 cm footprint) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        "barcode":     "BTT-00101",
        "description": "Glittering Goblin Gem Â· Tiny Green Cube",
        "sku":         "BTT-S-001",
        "weight_kg":   0.008,           # 8 g
        "location":    None,            # assigned at inventory scan
        "volume_cm3":  16.1,            # 2.54 x 2.54 x 2.5 cm
        "size_class":  "S",
        "value_class": "standard",
        "size_inches": "1x1",
    },
    {
        "barcode":     "BTT-00102",
        "description": "Shimmering Sapphire Sprite Â· Tiny Blue Cube",
        "sku":         "BTT-S-002",
        "weight_kg":   0.012,           # 12 g
        "location":    None,
        "volume_cm3":  16.1,
        "size_class":  "S",
        "value_class": "standard",
        "size_inches": "1x1",
    },
    {
        "barcode":     "BTT-00103",
        "description": "Rosy Rascal Ruby Â· Tiny Red Cube",
        "sku":         "BTT-S-003",
        "weight_kg":   0.010,           # 10 g
        "location":    None,
        "volume_cm3":  16.1,
        "size_class":  "S",
        "value_class": "standard",
        "size_inches": "1x1",
    },

    # â”€â”€ 2x1 inch (approx 5.08 x 2.54 cm footprint) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        "barcode":     "BTT-00201",
        "description": "Peculiar Purple Prism Â· Oblong Mystery Block",
        "sku":         "BTT-M-001",
        "weight_kg":   0.022,           # 22 g
        "location":    None,
        "volume_cm3":  32.3,            # 5.08 x 2.54 x 2.5 cm
        "size_class":  "M",
        "value_class": "standard",
        "size_inches": "2x1",
    },
    {
        "barcode":     "BTT-00202",
        "description": "Tangerine Trickster Token Â· Orange Oblong",
        "sku":         "BTT-M-002",
        "weight_kg":   0.018,           # 18 g
        "location":    None,
        "volume_cm3":  32.3,
        "size_class":  "M",
        "value_class": "standard",
        "size_inches": "2x1",
    },
    {
        "barcode":     "BTT-00203",
        "description": "Cobalt Captain's Cube Â· Rectangular Blue Brick",
        "sku":         "BTT-M-003",
        "weight_kg":   0.025,           # 25 g
        "location":    None,
        "volume_cm3":  32.3,
        "size_class":  "M",
        "value_class": "high",
        "size_inches": "2x1",
    },

    # â”€â”€ 2x2 inch (approx 5.08 x 5.08 cm footprint) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
        "barcode":     "BTT-00301",
        "description": "Magnificent Magenta Monolith Â· Big Pink Slab",
        "sku":         "BTT-L-001",
        "weight_kg":   0.045,           # 45 g
        "location":    None,
        "volume_cm3":  64.5,            # 5.08 x 5.08 x 2.5 cm
        "size_class":  "L",
        "value_class": "high",
        "size_inches": "2x2",
    },
    {
        "barcode":     "BTT-00302",
        "description": "Whimsical White Whopper Â· Giant Pale Cube",
        "sku":         "BTT-L-002",
        "weight_kg":   0.038,           # 38 g
        "location":    None,
        "volume_cm3":  64.5,
        "size_class":  "L",
        "value_class": "standard",
        "size_inches": "2x2",
    },
    {
        "barcode":     "BTT-00303",
        "description": "Dazzling Diamond Dynamo Â· Heavyweight Black Block",
        "sku":         "BTT-L-003",
        "weight_kg":   0.050,           # 50 g
        "location":    None,
        "volume_cm3":  64.5,
        "size_class":  "L",
        "value_class": "high",
        "size_inches": "2x2",
    },
]


# ---------------------------------------------------------------------------
# Shelf locations â€” generated from the grid constants above
#
# staging_type = "area"    (a shelf location the picker checks into)
# QR payload   = "SHELF:A1" etc.
# Code         = 2-char row+col, e.g. "A1" â€” fits the String(4) constraint
# ---------------------------------------------------------------------------

def _make_shelf_locations(rows: int = GRID_ROWS, cols: int = GRID_COLS) -> list[dict]:
    row_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    locations = []
    for r in range(rows):
        for c in range(1, cols + 1):
            code = f"{row_letters[r]}{c}"
            locations.append({
                "code":         code,
                "label":        f"Shelf {row_letters[r]}{c}",
                "staging_type": "area",
                "qr_payload":   f"SHELF:{code}",
                "status":       "available",
            })
    return locations


SHELF_LOCATIONS = _make_shelf_locations()


# ---------------------------------------------------------------------------
# Delivery zones â€” the Tiny Totes go here when an order is packed
# staging_type = "delivery"
# ---------------------------------------------------------------------------

DELIVERY_ZONES = [
    {
        "code":         "TINY",
        "label":        "Tiny Tote Line 1",
        "staging_type": "delivery",
        "qr_payload":   "STAGING:TINY",
        "status":       "available",
    },
    {
        "code":         "WOND",
        "label":        "Wonderland Bay",
        "staging_type": "delivery",
        "qr_payload":   "STAGING:WOND",
        "status":       "available",
    },
    {
        "code":         "CHRM",
        "label":        "Charm Dispatch",
        "staging_type": "delivery",
        "qr_payload":   "STAGING:CHRM",
        "status":       "available",
    },
]

# ---------------------------------------------------------------------------
# Sample orders
#
# Each order is designed to fit comfortably within one 100 g Tiny Tote.
# Tote assignment is NOT pre-set here â€” it is computed at pack time by
# packer.py when the order transitions complete â†’ packing.
#
# staging_code on OrderLines is set to the expected delivery zone as a
# pre-pack hint; the actual tote assignment lives in ToteLineAssignment.
#
# Total weights:
#   BTT-2024-001:  3 Ã— 8 g + 1 Ã— 22 g = 46 g  âœ“
#   BTT-2024-002:  2 Ã— 18 g + 1 Ã— 12 g = 48 g  âœ“
#   BTT-2024-003:  1 Ã— 45 g + 1 Ã— 10 g = 55 g  âœ“
# ---------------------------------------------------------------------------

_O1 = "btt-ord-0001-0001-0001-0001-000000000001"
_O2 = "btt-ord-0002-0002-0002-0002-000000000002"
_O3 = "btt-ord-0003-0003-0003-0003-000000000003"

ORDERS = [
    {
        "id":         _O1,
        "reference":  "BTT-2024-001",
        "customer":   "The Fairy Tale Shop",
        "status":     "pending",
        "created_at": datetime(2024, 6, 1, 9, 0, 0),
        "lines": [
            # 3 Ã— Glittering Goblin Gem (8 g each = 24 g) â†’ Tiny Tote Line 1
            {"id": "btt-ln-0101-0001-0001-0001-000000000001",
             "product_barcode": "BTT-00101", "quantity": 3, "staging_code": "TINY"},
            # 1 Ã— Peculiar Purple Prism (22 g) â†’ Tiny Tote Line 1
            {"id": "btt-ln-0101-0001-0001-0001-000000000002",
             "product_barcode": "BTT-00201", "quantity": 1, "staging_code": "TINY"},
        ],
    },
    {
        "id":         _O2,
        "reference":  "BTT-2024-002",
        "customer":   "Wonderland Wholesale",
        "status":     "pending",
        "created_at": datetime(2024, 6, 1, 10, 30, 0),
        "lines": [
            # 2 Ã— Tangerine Trickster Token (18 g each = 36 g) â†’ Wonderland Bay
            {"id": "btt-ln-0202-0002-0002-0002-000000000001",
             "product_barcode": "BTT-00202", "quantity": 2, "staging_code": "WOND"},
            # 1 Ã— Shimmering Sapphire Sprite (12 g) â†’ Wonderland Bay
            {"id": "btt-ln-0202-0002-0002-0002-000000000002",
             "product_barcode": "BTT-00102", "quantity": 1, "staging_code": "WOND"},
        ],
    },
    {
        "id":         _O3,
        "reference":  "BTT-2024-003",
        "customer":   "Charm & Co.",
        "status":     "pending",
        "created_at": datetime(2024, 6, 1, 11, 0, 0),
        "lines": [
            # 1 Ã— Magnificent Magenta Monolith (45 g) â†’ Charm Dispatch
            {"id": "btt-ln-0303-0003-0003-0003-000000000001",
             "product_barcode": "BTT-00301", "quantity": 1, "staging_code": "CHRM"},
            # 1 Ã— Rosy Rascal Ruby (10 g) â†’ Charm Dispatch
            {"id": "btt-ln-0303-0003-0003-0003-000000000002",
             "product_barcode": "BTT-00103", "quantity": 1, "staging_code": "CHRM"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Seed function
# ---------------------------------------------------------------------------

def run_btt_seed(session) -> None:
    """Populate the database with Bob's Tiny Treasures data.

    Idempotent â€” checks for existing BTT products before inserting.
    Never touches the base picker-vision seed data.
    """
    # Guard: if any BTT product already exists, skip entirely
    existing = session.query(Product).filter(
        Product.barcode.like("BTT-%")
    ).first()
    if existing is not None:
        print("BTT seed already present â€” skipping.")
        return

    print("Seeding Bob's Tiny Treasures dataâ€¦")

    # Users
    for u in USERS:
        session.add(User(**u))

    # Cart types
    for c in CART_TYPES:
        session.add(CartType(**c))

    # Products (size_inches is a new column â€” pass as kwarg)
    for p in PRODUCTS:
        session.add(Product(**p))

    # Shelf locations
    for s in SHELF_LOCATIONS:
        # Skip if a staging container with this code already exists
        # (e.g. from a previous partial seed or manual setup)
        if session.get(StagingContainer, s["code"]) is None:
            session.add(StagingContainer(**s))

    # Delivery zones
    for d in DELIVERY_ZONES:
        if session.get(StagingContainer, d["code"]) is None:
            session.add(StagingContainer(**d))

    # Orders + lines
    for order_data in ORDERS:
        lines_data = order_data.pop("lines")
        order = Order(**order_data)
        session.add(order)
        for line_data in lines_data:
            session.add(OrderLine(order_id=order.id, **line_data))
        order_data["lines"] = lines_data  # restore for repeatability

    # Set instance profile on WorkflowConfig (create row if absent)
    wc = session.get(WorkflowConfig, 1)
    if wc is None:
        wc = WorkflowConfig(id=1, instance_profile="bobs-tiny-treasures")
        session.add(wc)
    else:
        wc.instance_profile = "bobs-tiny-treasures"

    session.commit()
    print("âœ“ Bob's Tiny Treasures data seeded successfully.")
    print(f"  Products  : {len(PRODUCTS)} ({GRID_ROWS}Ã—{GRID_COLS} default grid)")
    print(f"  Shelves   : {len(SHELF_LOCATIONS)}")
    print(f"  Zones     : {len(DELIVERY_ZONES)}")
    print(f"  Orders    : {len(ORDERS)}")
    print(f"  Users     : {len(USERS)}")
    print(f"  Cart types: {len(CART_TYPES)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Seed Bob's Tiny Treasures test scenario into a Picker Vision database."
    )
    p.add_argument(
        "--db",
        default="sqlite:///./picker.db",
        metavar="URL",
        help="SQLAlchemy database URL (default: sqlite:///./picker.db)",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    engine = create_engine(args.db, connect_args={"check_same_thread": False}
                           if args.db.startswith("sqlite") else {})
    # Create any missing tables (including new BTT tables) before seeding
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        run_btt_seed(session)
    finally:
        session.close()

