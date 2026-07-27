# Bob's Tiny Treasures — Test Scenario Fixture

This directory contains everything needed to run the **Bob's Tiny Treasures** test
scenario on a Picker Vision instance. It is a self-contained fixture that lives on
the `feature/bobs-tiny-treasures` branch and does not affect the base seed data.

---

## What It Contains

| File | Purpose |
|------|---------|
| `seed_btt.py` | Idempotent seed script — populates the DB with the full BTT scenario |
| `generate_btt_labels.py` | Printable PDF of product QR stickers, shelf labels, delivery zone labels |
| `logo.svg` | Bob's Tiny Treasures brand logo (SVG, transparent background) |
| `README.md` | This file |

---

## The Scenario

**Bob's Tiny Treasures** is a fictional miniature-goods warehouse used to demonstrate
the Picker Vision system in a physical hands-on setting.

### Products (9 total)

Three 3D-printed size primitives, three colour variants each:

| Size | Products | Weight |
|------|----------|--------|
| 1×1 in | Glittering Goblin Gem · Shimmering Sapphire Sprite · Rosy Rascal Ruby | 8–12 g |
| 2×1 in | Peculiar Purple Prism · Tangerine Trickster Token · Cobalt Captain's Cube | 18–25 g |
| 2×2 in | Magnificent Magenta Monolith · Whimsical White Whopper · Dazzling Diamond Dynamo | 38–50 g |

### Warehouse

Default **3×3 grid** of shelf locations (`A1`–`C3`). Each shelf gets a QR label
(`SHELF:A1` etc.). The grid size is configurable at the start of each test run via the
BTT Setup wizard in the supervisor Management screen.

### Delivery Zones

Three Tiny Tote dispatch areas:

| Code | Label | QR Payload |
|------|-------|-----------|
| `TINY` | Tiny Tote Line 1 | `STAGING:TINY` |
| `WOND` | Wonderland Bay | `STAGING:WOND` |
| `CHRM` | Charm Dispatch | `STAGING:CHRM` |

### Sample Orders

| Ref | Customer | Items | Total Weight |
|-----|----------|-------|-------------|
| BTT-2024-001 | The Fairy Tale Shop | 3× Goblin Gem + 1× Purple Prism | 46 g |
| BTT-2024-002 | Wonderland Wholesale | 2× Trickster Token + 1× Sapphire Sprite | 48 g |
| BTT-2024-003 | Charm & Co. | 1× Magenta Monolith + 1× Rosy Ruby | 55 g |

All orders fit within the **100 g Tiny Tote weight cap**.

### Users

Reference file for demo login credentials: [`server/web_ui/src/demoCredentials.ts`](server/web_ui/src/demoCredentials.ts)

| Name | Role | Credential |
|------|------|-----------|
| Bob (Owner) | Supervisor | password: `btt01` |
| Sprinkle | Picker | PIN: `7777` |
| Glimmer | Picker | PIN: `8888` |

---

## Running the Seed

### Prerequisites

- Python 3.10+
- SQLAlchemy installed (`pip install sqlalchemy`)
- A running Picker Vision database (SQLite or Postgres)

### Against the local Docker Compose database

```bash
# From the picker-vision repo root:
python fixtures/bobs-tiny-treasures/seed_btt.py
# Uses default: sqlite:///./picker.db (same path as the order-service)
```

### Against a specific database

```bash
python fixtures/bobs-tiny-treasures/seed_btt.py --db sqlite:///path/to/picker.db
python fixtures/bobs-tiny-treasures/seed_btt.py --db postgresql://user:pass@host/db
```

### Reset and re-seed

The seed is idempotent — running it twice is safe. To force a full reset:

```bash
# Docker Compose: wipe the volume
docker compose down -v
docker compose up --build
# Then re-run the seed
python fixtures/bobs-tiny-treasures/seed_btt.py
```

### In Kubernetes (BTT overlay)

The K8s overlay (`k8s/overlays/bobs-tiny-treasures/`) includes a one-shot `Job` that
runs this script automatically after the order-service pod is ready. No manual step
required for K8s deployments.

---

## Generating Labels

```bash
# Default 3×3 shelf grid:
python fixtures/bobs-tiny-treasures/generate_btt_labels.py

# Custom grid (e.g. 2 rows × 4 cols):
python fixtures/bobs-tiny-treasures/generate_btt_labels.py --rows 2 --cols 4

# Custom output path:
python fixtures/bobs-tiny-treasures/generate_btt_labels.py --output ~/Desktop/btt_labels.pdf
```

**Label requirements (pip):**
```bash
pip install python-barcode qrcode[pil] reportlab svglib
```

The PDF contains:
1. **Product QR stickers** — 1×1 inch, one per product (for affixing to 3D-printed objects)
2. **Shelf location QR labels** — ~2×2 inch, one per shelf location
3. **Delivery zone QR labels** — large format (3×3 inch), one per delivery zone

---

## BTT Setup Wizard

Once the seed is loaded, navigate to **⚙ Manage → 🏪 BTT Setup** in the Picker Vision
web UI (supervisor login required). The wizard provides:

1. **Grid** — configure rows × cols and generate shelf QR containers
2. **Inventory** — scan each shelf QR then scan a product to assign starting stock
3. **Scenarios** — save the current inventory assignment as a named scenario for
   reuse across test runs

---

## Physical Setup

1. Print `btt_labels.pdf` on label stock.
2. Affix **product QR stickers** to the 3D-printed Tiny Treasures objects.
3. Place **shelf QR labels** on the physical shelf grid.
4. Place **delivery zone QR labels** at the Tiny Tote dispatch areas.
5. Log in as **Bob (Owner)** and use the BTT Setup wizard to inventory each shelf.
6. Start a test run — log in as **Sprinkle** or **Glimmer** to pick orders.
