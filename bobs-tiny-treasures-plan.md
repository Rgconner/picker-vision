# Bob's Tiny Treasures — Test Scenario Plan

## Overview

Create a fully self-contained, real-world test scenario for Picker Vision called
**"Bob's Tiny Treasures"** — a fictional miniature-goods warehouse that fills orders
into Tiny Totes (max 100 g net weight per tote).

The scenario is deployed into its own Kubernetes namespace (`picker-vision-btt`) and is
activated by a feature flag (`INSTANCE_PROFILE=bobs-tiny-treasures`) so that all
Bob's Tiny Treasures-specific UI elements remain hidden on vanilla deployments.

### Workflow Overview

The picking and packing process has two distinct phases:

**Phase 1 — Blind Picking**
The picker grabs the required number of labelled totes from the packing area, then
walks the warehouse scanning shelves and placing picked items loosely into any tote.
The existing pick workflow handles this entirely. Totes are not assigned to specific
items yet.

**Phase 2 — Pack & Verify**
Once all lines are picked, the system enters pack mode. A fallback packer (pure Python
heuristic) — or the AI if enabled — divides the order lines across totes respecting
the 100 g weight cap per tote. It then instructs the picker to pack the tote
layer-by-layer (max 2 items per layer), verifying each layer verbally or by camera
before proceeding to the next. This handles the reality that stacked Tiny Treasures
cannot be verified in a single camera pass. Each tote is sealed independently; the
order only moves to `packed` when all totes are verified and sealed.

### Sub-Task Summary

| # | Name | Depends On |
|---|------|-----------|
| 1 | Data Model Extensions | — |
| 2 | BTT Fixture & Seed | 1 |
| 3a | Warehouse Setup Wizard | 1 |
| 3b | Pack & Verify Wizard | 1, 2 |
| 4 | Label Sheet Generator | 2 (shared constants) |
| 5 | K8s Namespace & Overlay | 2 |

Sub-Tasks 3a, 4, and 5 can proceed in parallel once Sub-Tasks 1 and 2 are done.
Sub-Task 3b depends on 3a being complete (it lives in the same management panel).

---

## Sub-Task 1 — Data Model Extensions

### Intent

The existing schema covers most needs but requires five additions before BTT-specific
features can be built:

1. `Product.size_inches` — physical footprint of each 3D-printed Treasure.
2. `WorkflowConfig.instance_profile` — runtime gate for BTT-only features.
3. `OrderTote` — a tote assigned to an order at pack time, with its own weight budget.
4. `ToteLayer` — one verifiable horizontal layer of items inside a tote.
5. `ToteLineAssignment` — maps an `OrderLine` (and a specific quantity) to a tote and
   layer, created by the fallback packer when Phase 2 begins.

`OrderLine.staging_code` stays as a pre-pack hint (which delivery zone the line is
*expected* to end up in); the actual tote assignment lives in `ToteLineAssignment`.
`staging_code` is made nullable so base-seed orders that don't use the tote system
are unaffected.

### Data Model

```
Order ──< OrderTote >── StagingContainer
OrderTote ──< ToteLayer
OrderTote ──< ToteLineAssignment >── OrderLine
```

**`OrderTote`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String PK | UUID |
| `order_id` | String FK → orders | |
| `staging_code` | String FK → staging_containers | delivery zone assigned to this tote |
| `tote_seq` | Integer | 1-based sequence within the order |
| `max_weight_kg` | Float | always 0.1 for BTT |
| `assigned_weight_kg` | Float | sum of all ToteLineAssignment weights, computed at pack time |
| `status` | String | `pending` · `packing` · `verified` · `sealed` |

**`ToteLayer`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String PK | UUID |
| `tote_id` | String FK → order_totes | |
| `layer_seq` | Integer | 1-based, max 2 items per layer |
| `status` | String | `pending` · `verified` · `skipped` |
| `verification_method` | String | `voice` · `camera` · `none` |
| `verification_result` | String | raw result / transcript / null |

**`ToteLineAssignment`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String PK | UUID |
| `tote_id` | String FK → order_totes | |
| `line_id` | String FK → order_lines | |
| `quantity_in_tote` | Integer | may be < line quantity if line spans totes |
| `layer_seq` | Integer | which layer within this tote this item goes in |

### Expected Outcomes
- All five additions are present in `models.py` and picked up by `create_all` on next
  startup.
- `OrderLine.staging_code` is nullable (SQLite `ALTER COLUMN` is not needed — the
  column already has no `NOT NULL` constraint in the ORM, confirm by reading the model).
- New models are imported in `main.py` so `create_all` sees them.

### Todo List
1. Add `size_inches = Column(String, nullable=True)` to `Product` in
   [`server/order_service/models.py`](server/order_service/models.py).
2. Add `instance_profile = Column(String, nullable=False, default="")` to
   `WorkflowConfig`.
3. Add `OrderTote` model (columns as above).
4. Add `ToteLayer` model.
5. Add `ToteLineAssignment` model.
6. Confirm `OrderLine.staging_code` FK already allows null (it does — no `nullable=False`
   in the current definition). No change needed.
7. Import all three new models in `main.py` so `create_all` creates their tables.

### Relevant Context
- [`server/order_service/models.py`](server/order_service/models.py) — all ORM models.
- [`server/order_service/main.py`](server/order_service/main.py:45) — `_init_db()`
  calls `create_all`; new models need to be imported here.

### Status
[x] done

---

## Sub-Task 2 — BTT Fixture & Seed

### Intent
Create `fixtures/bobs-tiny-treasures/seed_btt.py` — a standalone, idempotent seed
script that populates the DB with all Bob's Tiny Treasures data. It must not touch the
base seed data. Run it with `python seed_btt.py --db sqlite:///path/to/picker.db`.

Totes are **not** pre-assigned in the seed — they are created at pack time by the
fallback packer. Sample orders are designed so that each fits within a single tote
(total weight ≤ 100 g), keeping the first demo run simple. Multi-tote orders can be
added manually later via the management screen once the workflow is proven.

### Bob's Tiny Treasures Product Catalog

**1×1 inch (`size_inches="1x1"`, `size_class="S"`)**
| Barcode | Name | SKU | Weight |
|---------|------|-----|--------|
| BTT-00101 | Glittering Goblin Gem | BTT-S-001 | 0.008 kg (8 g) |
| BTT-00102 | Shimmering Sapphire Sprite | BTT-S-002 | 0.012 kg (12 g) |
| BTT-00103 | Rosy Rascal Ruby | BTT-S-003 | 0.010 kg (10 g) |

**2×1 inch (`size_inches="2x1"`, `size_class="M"`)**
| Barcode | Name | SKU | Weight |
|---------|------|-----|--------|
| BTT-00201 | Peculiar Purple Prism | BTT-M-001 | 0.022 kg (22 g) |
| BTT-00202 | Tangerine Trickster Token | BTT-M-002 | 0.018 kg (18 g) |
| BTT-00203 | Cobalt Captain's Cube | BTT-M-003 | 0.025 kg (25 g) |

**2×2 inch (`size_inches="2x2"`, `size_class="L"`)**
| Barcode | Name | SKU | Weight |
|---------|------|-----|--------|
| BTT-00301 | Magnificent Magenta Monolith | BTT-L-001 | 0.045 kg (45 g) |
| BTT-00302 | Whimsical White Whopper | BTT-L-002 | 0.038 kg (38 g) |
| BTT-00303 | Dazzling Diamond Dynamo | BTT-L-003 | 0.050 kg (50 g) |

**Delivery Zones (`staging_type="delivery"`)**
| Code | Label | QR Payload |
|------|-------|-----------|
| TINY | Tiny Tote Line 1 | STAGING:TINY |
| WOND | Wonderland Bay | STAGING:WOND |
| CHRM | Charm Dispatch | STAGING:CHRM |

**Default Shelf Locations (`staging_type="area"`, 3×3 grid)**
Generated programmatically: rows A–C × cols 1–3 → `A1`…`C3`.
QR payload: `SHELF:A1` etc. Shelf code is 2-char (row letter + col digit).

**Sample Orders (all ≤ 100 g, single-tote)**
| Ref | Customer | Lines | Total Weight | Zone |
|-----|----------|-------|-------------|------|
| BTT-2024-001 | The Fairy Tale Shop | 3× BTT-00101 + 1× BTT-00201 | 46 g | TINY |
| BTT-2024-002 | Wonderland Wholesale | 2× BTT-00202 + 1× BTT-00102 | 48 g | WOND |
| BTT-2024-003 | Charm & Co. | 1× BTT-00301 + 1× BTT-00103 | 55 g | CHRM |

**BTT Users**
| Name | Role | PIN |
|------|------|-----|
| Bob (Owner) | supervisor | btt01 |
| Sprinkle | picker | 7777 |
| Glimmer | picker | 8888 |

**Tiny Tray Cart Type**
`name="Tiny Tray"`, dimensions in cm equivalent of 6×4×2 in, `max_weight=0.15 kg`
(slightly over the tote cap to allow the tray to hold multiple loose items while
picking before they are split into totes).

### Expected Outcomes
- Running `python seed_btt.py` twice is safe (idempotent — guards on
  `Product.barcode.like("BTT-%")`).
- All 9 products, 3 delivery zones, 9 shelf locations (as StagingContainers), 3 orders,
  3 users, 1 cart type are present.
- `WorkflowConfig.instance_profile` is set to `"bobs-tiny-treasures"`.
- No base-seed data is touched.

### Todo List
1. Create `fixtures/bobs-tiny-treasures/` directory.
2. Write `fixtures/bobs-tiny-treasures/seed_btt.py` following the structure of
   [`server/order_service/seed_data.py`](server/order_service/seed_data.py):
   - `argparse` for `--db` (default `sqlite:///./picker.db`).
   - Shelf locations generated from `GRID_ROWS=3, GRID_COLS=3` constants.
   - `run_btt_seed(session)` — idempotent, guards on BTT product presence.
   - `__main__` block wires argparse → engine → session → `run_btt_seed`.
3. Write `fixtures/bobs-tiny-treasures/README.md` with setup instructions.

### Relevant Context
- [`server/order_service/seed_data.py`](server/order_service/seed_data.py) — mirror
  this structure exactly.
- [`server/order_service/models.py`](server/order_service/models.py) — models to import;
  use `sys.path.insert` to reach the service root.
- `StagingContainer.code` is `String(4)` — shelf codes `A1`…`C3` are 2 chars, which
  fits. Delivery zone codes (`TINY`, `WOND`, `CHRM`) are 4 chars. Both fine.

### Status
[x] done

---

## Sub-Task 3a — Warehouse Setup Wizard

### Intent
Add a **"BTT Setup"** tab to the existing
[`ManagementView`](server/web_ui/src/ManagementView.tsx) that is **only visible** when
`WorkflowConfig.instance_profile === "bobs-tiny-treasures"`. The tab provides a
three-section panel:

1. **Grid Configurator** — supervisor enters rows × cols and clicks "Generate Grid" to
   create or replace the shelf staging containers via the API.
2. **Inventory Scanner** — supervisor scans a shelf QR (`SHELF:A1`), then scans a
   product barcode (`BTT-00101`) and enters quantity, to assign starting stock levels
   to that location. Stored in a "scratch" `WarehouseScenario` row.
3. **Scenario Manager** — save the current scratch inventory as a named scenario, load
   a saved scenario (restores stock assignments to DB), or delete one.

### New API Endpoints (Order Service)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/instance-profile` | Returns `{profile: string}` from WorkflowConfig row 1 |
| POST | `/warehouse/grid` | Body: `{rows, cols}`. Creates shelf StagingContainers. |
| POST | `/warehouse/inventory` | Body: `{location_code, product_barcode, qty}`. Upserts scratch scenario. |
| GET | `/warehouse/scenarios` | List all saved WarehouseScenario rows. |
| POST | `/warehouse/scenarios` | Body: `{name}`. Saves scratch as named scenario. |
| GET | `/warehouse/scenarios/{id}` | Load scenario payload. |
| DELETE | `/warehouse/scenarios/{id}` | Delete scenario. |

The `WarehouseScenario` model stores a JSON payload of
`[{location_code, product_barcode, qty_on_hand}]` records. A special row with
`id="scratch"` is always upserted during live inventory scanning; named saves copy
from it.

### Expected Outcomes
- On a vanilla instance the Management screen is unchanged.
- On a BTT instance the "BTT Setup" tab appears and all three sections work end-to-end.
- Generating a 3×3 grid creates/replaces 9 `SHELF:A1`…`SHELF:C3` staging containers.
- Scanning assigns stock; saving creates a persistent `WarehouseScenario`.
- Loading a scenario resets the scratch record to match.

### Todo List
1. Add `WarehouseScenario` model to `models.py`:
   - `id` (String PK), `name` (String unique), `grid_rows` (Integer),
     `grid_cols` (Integer), `payload` (String / JSON text), `created_at` (DateTime).
2. Add `GET /instance-profile` to `main.py`.
3. Add `POST /warehouse/grid` — generates shelf StagingContainers, deletes old ones
   first if they exist.
4. Add `POST /warehouse/inventory`, `GET|POST|DELETE /warehouse/scenarios` endpoints.
5. Create `server/web_ui/src/BttSetupPanel.tsx` with three inner sub-tabs:
   Grid / Inventory / Scenarios.
6. Update `ManagementView.tsx`: fetch `/instance-profile` once on mount; if BTT,
   append `{ id: 'btt-setup', label: '🏪 BTT Setup' }` to the TABS array.
7. Wire "Generate Grid" → `POST /warehouse/grid`.
8. Wire inventory scanner to `POST /warehouse/inventory` using the existing
   `useBarcodeScanner` hook (two-step: shelf scan → product scan + qty input).
9. Wire scenario list / load / save / delete to the scenario endpoints.

### Relevant Context
- [`server/web_ui/src/ManagementView.tsx`](server/web_ui/src/ManagementView.tsx:558) —
  `TABS` array and tab render switch to extend.
- [`server/web_ui/src/useBarcodeScanner.ts`](server/web_ui/src/useBarcodeScanner.ts) —
  existing camera barcode hook to reuse.
- [`server/order_service/main.py`](server/order_service/main.py) — append routes;
  reuse `_get_session()` pattern.

### Status
[x] done

---

## Sub-Task 3b — Pack & Verify Wizard

### Intent
Add a **"Pack Order"** flow that activates when an order transitions to `complete`
(all lines picked). It is accessible from the supervisor's order list and, on mobile,
is surfaced automatically to the picker who just finished.

The flow has two engine options:
- **Fallback packer (always available)** — pure Python heuristic; no AI required.
- **AI packer (optional)** — invoked when `AiConfig` is enabled; uses the configured
  LLM to reason about packing strategy. Falls back gracefully if AI call fails.

### Fallback Packer Algorithm (`server/order_service/packer.py`)

```
Input:  list of (OrderLine, Product) pairs for a completed order
        tote_weight_cap = 0.1 kg
        max_items_per_layer = 2

1. Sort lines by weight descending (heaviest first — stable base layers).
2. Expand lines into individual item units
   e.g. qty=3 of BTT-00101 → [item, item, item]
3. Bin-pack items into totes greedily:
   - Start tote_1, weight=0
   - For each item: if item.weight + tote.weight <= cap → add to tote
                    else → start new tote
4. Within each tote, assign items to layers in pairs (max 2 per layer):
   layer_1 = items[0:2], layer_2 = items[2:4], ...
5. Return list of OrderTote + ToteLayer + ToteLineAssignment records (unsaved).
```

The packer is a **pure function** — it returns data structures, the caller commits
them. This makes it testable without a DB.

### Pack & Verify UI Flow

```
Order complete
    │
    ▼
[Pack Wizard — step 1]
"This order needs N tote(s). Place N labelled totes in the packing area."
Supervisor/picker taps "Ready"
    │
    ▼
[Pack Wizard — step 2]  (per tote)
"Tote 1 of N — Delivery zone: TINY"
Show item list for this tote
    │
    ▼
[Pack Wizard — step 3]  (per layer within tote)
"Layer 1: Place these items:"
  • Glittering Goblin Gem × 1
  • Rosy Rascal Ruby × 1
[Verify] button → triggers voice prompt or camera scan
    │    ▲
    │    └── if verify fails: "Try again" (re-prompt same layer)
    ▼
Layer verified → move to next layer (or next tote)
    │
    ▼
All totes verified → "Seal and dispatch" → order status = packed
```

### New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/orders/{order_id}/pack` | Runs fallback packer (or AI if enabled). Creates OrderTote, ToteLayer, ToteLineAssignment rows. Returns full pack plan. |
| GET | `/orders/{order_id}/pack-plan` | Returns existing pack plan (totes + layers + assignments). |
| PATCH | `/orders/{order_id}/totes/{tote_id}/layers/{layer_id}` | Body: `{status, verification_method, verification_result}`. Marks a layer verified. Auto-seals tote when all layers done. Auto-packs order when all totes sealed. |

### Frontend Components

- `PackWizard.tsx` — step-based modal/overlay component. Receives `order_id`, fetches
  pack plan, drives the layer-by-layer flow.
- Integrated into `MobilePickerView` — shown automatically when the picker's active
  order transitions to `complete`.
- Also accessible from the supervisor order list with a "Pack" action button.

### Expected Outcomes
- `POST /orders/{order_id}/pack` on a `complete` order creates the full tote/layer plan.
- Calling it twice is idempotent (returns existing plan if already created).
- The mobile picker sees the pack wizard immediately after the last pick confirmation.
- Each layer can be verified; failures re-prompt.
- Order reaches `packed` only after every layer of every tote is verified.
- With AI disabled, the fallback packer runs silently and the flow is identical.

### Todo List
1. Write `server/order_service/packer.py` with the `plan_packing()` pure function.
2. Add `POST /orders/{order_id}/pack` endpoint — calls `plan_packing()`, writes results,
   idempotent.
3. Add `GET /orders/{order_id}/pack-plan` endpoint.
4. Add `PATCH /orders/{order_id}/totes/{tote_id}/layers/{layer_id}` endpoint.
5. Create `server/web_ui/src/PackWizard.tsx`.
6. In `MobilePickerView`, listen for order status `complete` and surface the
   PackWizard automatically.
7. In the supervisor order list (within `ManagementView` or `SupervisorView`), add a
   "Pack" button for orders with status `complete`.
8. Write unit tests for `packer.py` covering: single-tote, multi-tote split, layer
   assignment, weight-cap boundary.

### Relevant Context
- [`server/web_ui/src/MobilePickerView.tsx`](server/web_ui/src/MobilePickerView.tsx) —
  entry point for mobile picker; listen for `complete` status here.
- [`server/web_ui/src/types.ts`](server/web_ui/src/types.ts) — add `OrderTote`,
  `ToteLayer`, `PackPlan` interfaces.
- `AiConfig` (id=1) — check `provider != "none"` to decide whether to attempt AI
  packing. Always fall back to `plan_packing()` on any AI error.
- `packer.py` is a pure function — import it from the endpoint handler only; no
  circular dependencies.

### Status
[x] done

---

## Sub-Task 4 — BTT Label Sheet Generator

### Intent
A **Labels** sub-tab inside the existing `BttSetupPanel` (Management → BTT Setup)
that lets a supervisor configure and download a print-ready PDF label sheet — no
CLI, no file system access required. The PDF is generated server-side
(`POST /labels/generate`) and streamed straight to the browser as a download.

Three label sections, each independently configurable:

1. **Product stickers** — one label per BTT product (9 total).
2. **Shelf location labels** — one label per shelf in the current grid (rows × cols).
3. **Delivery zone labels** — one label per delivery zone (TINY / WOND / CHRM).

### Label Designer UI (`BttLabelsPanel.tsx`)

One card per section. Each card exposes:

| Control | Options |
|---------|---------|
| **Include** | Toggle — include this section in the PDF |
| **Barcode type** | QR Code · Code 128 · UPC-A |
| **Detail level** | Minimal (name/code only) · Detailed (name + SKU + weight + barcode value) |
| **Colour band** | *(Zone labels only)* — None · Colour-coded top band (TINY=amber, WOND=blue, CHRM=green) |

Global controls (top of panel):

| Control | Options |
|---------|---------|
| **Print mode** | Cut-yourself (clean grid, any paper) · Avery-matched (precise margins per template) |
| **Avery template** | Products: 22807 (1×1 in, 40/sheet) · Shelves: 5164 (3.33×4 in, 6/sheet) · Zones: 8165 (full sheet, 1/sheet) — shown only when Avery mode selected, pre-filled, editable |
| **Shelf grid** | Rows × Cols — defaults to current WorkflowConfig grid; overrideable here |

A single **Download Labels PDF** button posts the config JSON to
`POST /labels/generate` and triggers a browser file download.

### New API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/labels/generate` | Body: `LabelConfig` JSON. Returns `application/pdf` blob. |
| GET  | `/labels/products` | Returns list of BTT products (barcode, description, sku, weight_kg). |

### Backend PDF Generator (`server/order_service/label_generator.py`)

Pure function `generate_label_pdf(config: dict) -> bytes` using **ReportLab**.
No DB access — product/shelf/zone data passed in via `config`.

**Label content per section:**

*Product stickers:*
- Minimal: barcode symbol (QR/Code128/UPC) + product name (truncated)
- Detailed: barcode symbol + name + SKU + weight + barcode value in monospace

*Shelf labels:*
- Barcode symbol (QR/Code128) + large shelf code + "Shelf A1" sub-label
- No UPC for shelves (not a product barcode — UPC silently falls back to Code128)

*Zone labels:*
- Optional colour band across the top
- Large barcode symbol + zone code in bold + full zone label + BTT wordmark footer
- Full page (Avery 8165) or proportional in cut-yourself mode

**Print modes:**
- *Cut-yourself*: fixed grid of cells per page, even margins, dashed cut lines between cells
- *Avery-matched*: cell positions computed from template spec (top/left margin,
  cell width/height, h-gap, v-gap, cols-per-row)

**Wordmark** (until ST-6 logo is wired in):
`"Bob's Tiny Treasures"` in amber `#f59e0b` bold, sans-serif — with a
`# TODO ST-6: replace with svglib.svg2rlg(logo.svg)` comment.

**Dependencies added to Dockerfile:**
`reportlab`, `qrcode[pil]`, `python-barcode[images]`, `Pillow`

### Expected Outcomes
- Supervisor opens Management → BTT Setup → Labels tab.
- Configures sections, barcode type, detail level, print mode.
- Clicks "Download Labels PDF" → browser downloads `btt_labels.pdf`.
- PDF renders correctly in any PDF viewer and prints cleanly.
- All three sections, both barcode types, both detail levels, both print modes work.
- Avery mode cells align within ±0.5 mm of template spec.

### Todo List
1. Update this spec in `bobs-tiny-treasures-plan.md`.
2. Add `reportlab`, `qrcode[pil]`, `python-barcode[images]`, `Pillow` to `Dockerfile`.
3. Write `server/order_service/label_generator.py` — pure `generate_label_pdf(config)`.
4. Add `POST /labels/generate` and `GET /labels/products` to `main.py`.
5. Create `server/web_ui/src/BttLabelsPanel.tsx` — designer UI with all controls.
6. Add `{ id: 'labels', label: '🏷️ Labels' }` sub-tab to `BttSetupPanel.tsx`.
7. Update `SubTab` type and panel render switch in `BttSetupPanel.tsx`.

### Relevant Context
- [`server/order_service/label_generator.py`](server/order_service/label_generator.py) — to create.
- [`server/order_service/main.py`](server/order_service/main.py) — append routes after pack endpoints.
- [`server/web_ui/src/BttSetupPanel.tsx`](server/web_ui/src/BttSetupPanel.tsx) — add Labels sub-tab.
- [`server/order_service/Dockerfile`](server/order_service/Dockerfile) — add pip deps.
- Product/zone data comes from the DB via `GET /labels/products` + existing
  `/instance-profile` + `/warehouse/grid`; the frontend passes it all in the
  `POST /labels/generate` body so the generator stays DB-free.

### Status
[x] done

---

## Sub-Task 5 — K8s Namespace & Kustomize Overlay

### Intent
New Kustomize overlay at `k8s/overlays/bobs-tiny-treasures/` deploying the full stack
into namespace `picker-vision-btt` with `INSTANCE_PROFILE=bobs-tiny-treasures` set on
the order-service. A one-shot Kubernetes `Job` runs `seed_btt.py` after the
order-service is ready. The existing `test` overlay is completely unaffected.

### Expected Outcomes
- `kubectl apply -k k8s/overlays/bobs-tiny-treasures/` deploys the full BTT stack.
- Order-service pod has `INSTANCE_PROFILE=bobs-tiny-treasures` in its environment.
- Seed Job runs once and populates all BTT data.
- `kubectl kustomize k8s/overlays/bobs-tiny-treasures/` renders cleanly (dry-run).

### Todo List
1. Create `k8s/overlays/bobs-tiny-treasures/namespace.yaml`
   (namespace: `picker-vision-btt`).
2. Create `k8s/overlays/bobs-tiny-treasures/kustomization.yaml` based on the `test`
   overlay; update namespace, namePrefix (`btt-`), and resource list.
3. Write `k8s/overlays/bobs-tiny-treasures/configmap-patch.yaml` adding
   `INSTANCE_PROFILE=bobs-tiny-treasures` to the order-service env.
4. Write `k8s/overlays/bobs-tiny-treasures/seed-job.yaml` — `batch/v1 Job` using the
   order-service image, runs `python fixtures/bobs-tiny-treasures/seed_btt.py --db
   $DATABASE_URL`.
5. Add seed Job to the overlay `kustomization.yaml` resources list.
6. Validate: `kubectl kustomize k8s/overlays/bobs-tiny-treasures/` dry-run renders with
   no errors.

### Relevant Context
- [`k8s/overlays/test/`](k8s/overlays/test/) — existing overlay to mirror.
- [`k8s/overlays/test/namespace.yaml`](k8s/overlays/test/namespace.yaml) — namespace
  pattern.
- [`k8s/overlays/test/configmap-patch.yaml`](k8s/overlays/test/configmap-patch.yaml) —
  env-var patch pattern.
- `seed_btt.py` (Sub-Task 2) accepts `--db` for in-cluster DB URL.

### Status
[x] done

---

## Sub-Task 6 — Brand Logo

### Intent
Design and generate a **Bob's Tiny Treasures** logo as a production-ready SVG file.
The logo represents Bob (as a friendly robot character — because that's what Bob is)
alongside a visual motif for the Tiny Treasures product line (small sparkling gems /
3D-printed coloured cubes). The logo is used in:

- The label sheet PDF header (Sub-Task 4).
- The BTT Setup management panel header in the web UI (Sub-Task 3a).
- Any future TechZone demo materials.

### Design Specification

**Composition:** Horizontal lockup — icon on the left, wordmark on the right.

**Icon elements:**
- A friendly robot face (Bob) — rounded square head, two circular eyes (one winking),
  a subtle antenna, warm amber/gold colour (`#f59e0b`) for the body.
- Three tiny gem/cube shapes tumbling out of or being held by the robot — one green
  (`#22c55e`), one blue (`#3b82f6`), one red (`#ef4444`) — representing the three
  1×1 Treasure colour families.
- The gems should feel small and sparkly, consistent with "Tiny Treasures."

**Wordmark:**
- Line 1: **"Bob's Tiny"** — bold, warm white (`#f8fafc`), clean sans-serif geometry.
- Line 2: **"Treasures"** — slightly larger, amber gold (`#f59e0b`), same weight.
- Optional tagline below in small text: *"Warehouse Edition"* in muted slate (`#94a3b8`).

**Background:** Transparent (SVG native). Dark-mode friendly.

**Output:** `fixtures/bobs-tiny-treasures/logo.svg` — clean, self-contained SVG with
no external font dependencies (use SVG `<text>` with system sans-serif stack or embed
a minimal subset). Target viewBox `0 0 400 120`.

### Expected Outcomes
- `fixtures/bobs-tiny-treasures/logo.svg` exists and renders correctly in a browser.
- The robot + gems read clearly at both full size and when scaled down to ~60 px height.
- Colours are consistent with the amber brand palette used throughout BTT UI.
- The SVG is self-contained — no external image, font, or script dependencies.
- The label generator (Sub-Task 4) imports and embeds the logo in the PDF header.
- The management panel (Sub-Task 3a) displays the logo at the top of the BTT Setup tab.

### Todo List
1. Write `fixtures/bobs-tiny-treasures/logo.svg`:
   - Robot head: rounded-rect body, two circle eyes (right eye winking = arc), antenna
     (line + small circle), amber fill with a slightly darker stroke.
   - Three gem cubes: small rotated squares or diamond shapes, green / blue / red,
     positioned as if tumbling from the robot's hands.
   - Wordmark: SVG `<text>` elements, font-family generic sans-serif, bold weight.
   - Tagline: smaller `<text>` in slate.
   - All within `viewBox="0 0 400 120"`, no hardcoded pixel sizes in external CSS.
2. Verify the SVG renders in a browser at full size and at 60 px height (scale test).
3. Update `generate_btt_labels.py` (Sub-Task 4) to embed the logo in the PDF header
   using `svglib.svg2rlg()` (already a dependency of the barcode generator).
4. Update `BttSetupPanel.tsx` (Sub-Task 3a) to display the logo as an `<img>` tag
   sourced from a static asset path, or inline the SVG directly as a React component.

### Relevant Context
- `fixtures/bobs-tiny-treasures/generate_btt_labels.py` (Sub-Task 4) — logo goes in
  the PDF title section; use `svglib.svg2rlg()` then scale to fit the header row.
- `server/web_ui/src/BttSetupPanel.tsx` (Sub-Task 3a) — inline SVG as a React
  component is the cleanest approach (no static asset serving config needed).
- Brand colours already established: amber `#f59e0b`, green `#22c55e`, blue `#3b82f6`,
  red `#ef4444`, dark background `#0f1117`, white text `#f8fafc`, muted `#94a3b8`.
- The existing app header uses `#1a1d27` background — the logo must look good on this.

### Status
[x] done

---

## Implementation Order

```
Sub-Task 1 (models)
    │
    ▼
Sub-Task 2 (seed) ──────────────────────┬──► Sub-Task 4 (labels + logo embed)
    │                                   │
    ▼                                   ▼
Sub-Task 3a (setup wizard)         Sub-Task 5 (k8s)
    │                                   │
    ▼                                   ▼
Sub-Task 3b (pack wizard)          Sub-Task 6 (logo) ──► feeds back into 3a + 4
```

Process one sub-task at a time. After each, update its status to `[x] done` and note
any context needed by the next sub-task in its Relevant Context section before
proceeding.
