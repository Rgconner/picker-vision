"""Validate BTT seed constants — no DB or SQLAlchemy required."""
import sys, pathlib, types, importlib.util

# Stub out sqlalchemy before the module loads
for mod_name in ["sqlalchemy", "sqlalchemy.orm"]:
    m = types.ModuleType(mod_name)
    m.create_engine = lambda *a, **kw: None
    m.Column = m.String = m.Integer = m.Float = m.Boolean = m.DateTime = m.ForeignKey = lambda *a, **kw: None
    m.sessionmaker = lambda **kw: None
    sys.modules[mod_name] = m

# Stub out models
fake_models = types.ModuleType("models")
for cls in ["Base","CartType","Order","OrderLine","Product","StagingContainer","User","WorkflowConfig"]:
    setattr(fake_models, cls, type(cls, (), {"__tablename__": cls.lower()}))
sys.modules["models"] = fake_models

# Load seed_btt
_repo = pathlib.Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location(
    "seed_btt",
    str(_repo / "fixtures" / "bobs-tiny-treasures" / "seed_btt.py")
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

errors = []

# 1. Product count
if len(mod.PRODUCTS) != 9:
    errors.append(f"Expected 9 products, got {len(mod.PRODUCTS)}")
else:
    print(f"  PASS  products: {len(mod.PRODUCTS)}")

# 2. Grid generation 3x3
shelves = mod._make_shelf_locations(3, 3)
if len(shelves) != 9:
    errors.append(f"Expected 9 shelves for 3x3, got {len(shelves)}")
elif shelves[0]["code"] != "A1" or shelves[8]["code"] != "C3":
    errors.append(f"Grid codes wrong: first={shelves[0]['code']} last={shelves[8]['code']}")
elif shelves[0]["qr_payload"] != "SHELF:A1":
    errors.append(f"QR payload wrong: {shelves[0]['qr_payload']}")
else:
    print(f"  PASS  3x3 grid: {[s['code'] for s in shelves]}")

# 3. Delivery zone codes <= 4 chars
bad = [z["code"] for z in mod.DELIVERY_ZONES if len(z["code"]) > 4]
if bad:
    errors.append(f"Delivery zone codes too long: {bad}")
else:
    print(f"  PASS  delivery zones: {[z['code'] for z in mod.DELIVERY_ZONES]}")

# 4. All order weights <= tote cap
for order in mod.ORDERS:
    total = sum(
        next(p["weight_kg"] for p in mod.PRODUCTS if p["barcode"] == l["product_barcode"]) * l["quantity"]
        for l in order["lines"]
    )
    ref = order["reference"]
    if total > mod.TOTE_WEIGHT_CAP_KG:
        errors.append(f"{ref} exceeds tote cap: {total*1000:.0f}g > {mod.TOTE_WEIGHT_CAP_KG*1000:.0f}g")
    else:
        print(f"  PASS  {ref}: {total*1000:.0f}g / {mod.TOTE_WEIGHT_CAP_KG*1000:.0f}g cap")

# 5. All BTT- barcode prefixes
bad = [p["barcode"] for p in mod.PRODUCTS if not p["barcode"].startswith("BTT-")]
if bad:
    errors.append(f"Non-BTT barcodes: {bad}")
else:
    print(f"  PASS  all barcodes prefixed BTT-")

# 6. size_inches on all products
missing = [p["barcode"] for p in mod.PRODUCTS if not p.get("size_inches")]
if missing:
    errors.append(f"Missing size_inches: {missing}")
else:
    sizes = sorted(set(p["size_inches"] for p in mod.PRODUCTS))
    print(f"  PASS  size_inches values: {sizes}")

# 7. Unique barcodes
barcodes = [p["barcode"] for p in mod.PRODUCTS]
if len(barcodes) != len(set(barcodes)):
    errors.append(f"Duplicate barcodes: {barcodes}")
else:
    print(f"  PASS  all barcodes unique")

# 8. Unique order IDs
ids = [o["id"] for o in mod.ORDERS]
if len(ids) != len(set(ids)):
    errors.append(f"Duplicate order IDs")
else:
    print(f"  PASS  all order IDs unique")

if errors:
    print("\nFAILURES:")
    for e in errors:
        print(f"  FAIL  {e}")
    sys.exit(1)
else:
    print("\nAll validations passed.")
