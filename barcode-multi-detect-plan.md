# Barcode Multi-Detection & Print Size Plan

## Top-Level Overview

Two independent improvements to the Picker Vision system:

1. **Multi-code detection** — The system currently marks only the single closest barcode
   as "active" and the business logic treats detection as a one-at-a-time operation.
   The new requirement is to verify that *all expected products* appear within the
   camera's view (inside the staging bounding box), which requires every visible
   barcode to be reported and compared simultaneously.

2. **Larger test codes** — The PDF test sheet sizes are too small for camera detection
   at working distance. Code 128 product barcodes need to be 150% of the current
   height, and QR staging codes need to be 3×3 inches (≈76 mm) to be readable by
   a camera mounted at shelf/bay height.

Scope is limited to:
- `picker-vision/pi-node/vision_service.py` (active-scoring logic)
- `picker-vision/pi-node/barcode_detector.py` (no changes required — already multi)
- `picker-vision/tools/generate_test_barcodes.py` (print dimensions)

**Confirmed decisions:**
- Paper size: US Letter landscape
- `distance_to_centre`: drop entirely (not computed, not published)
- All visible product codes report `active=True` simultaneously

---

## Sub-Tasks

---

### Sub-Task 1 — Replace single-active-product scoring with all-products-in-view reporting

**Status:** [x] done

**Intent**

The capture loop in `vision_service._run_capture()` currently scores detections by
distance to frame centre and marks exactly one as `active=True`. This served a
"point camera at one item" workflow. The new workflow is "point camera at the staging
area and confirm every required product is present in frame". The concept of a single
active item is replaced by a set of all simultaneously visible products.

**Expected Outcomes**

- Every product barcode detected in a frame is included in the published event with
  `active=True` (all visible codes are "active" simultaneously).
- The `distance_to_centre` field and its computation are removed entirely.
- The event publish condition is unchanged (only publish when there is something to
  report).
- No changes to the event schema — downstream consumers (event_processor, web_ui)
  already handle lists of detections and only look at `active` per-item.

**Todo List**

1. In `vision_service._run_capture()`, remove the entire active-scoring block
   (lines 175–181: the `distance_to_centre` computation, `active=False` reset,
   and `closest` winner logic).
2. Replace with a single loop that sets `active=True` on every entry in
   `product_detections_only`.
3. Verify that the downstream publish payload still serialises correctly (no schema
   change needed).

**Relevant Context**

- `picker-vision/pi-node/vision_service.py` lines 174–181 — the scoring block to replace
- `picker-vision/pi-node/barcode_detector.py` `detect()` — already returns all codes via
  `detectAndDecodeMulti` / `detectAndDecodeWithType`; no changes needed here
- `picker-vision/server/event_processor/main.py` — consumes `detections[]`; handles
  any-length list already
- `picker-vision/server/web_ui/src/types.ts` `Detection.active` — boolean field,
  compatible with all-true

---

### Sub-Task 2 — Increase Code 128 barcode height to 150% in the test PDF

**Status:** [x] done

**Intent**

The current barcode cell height is `bc_h = 22 mm`. A standard Code 128 barcode is
typically printed at about 15–25 mm tall; doubling (200%) is the max allowed by the
spec. 150% of the current 22 mm = 33 mm, which gives comfortable scanning margin
without blowing out the 2-column grid layout. The cell width is derived from the
A4 page width minus margins divided by 2, so it accommodates any height automatically.

**Expected Outcomes**

- Code 128 barcode graphic height in the PDF increases from 22 mm to 33 mm.
- The 2-column product grid still fits on one A4 page (10 products = 5 rows × ~33 mm
  each ≈ 165 mm of grid height, well within the ~200 mm usable height after the title
  and QR section).
- PDF regenerates without error.

**Todo List**

1. In `generate_test_barcodes.py`, change `bc_h = 22 * mm` to `bc_h = 33 * mm`.
2. Regenerate and visually confirm the barcodes are larger and the layout is not clipped.

**Relevant Context**

- `picker-vision/tools/generate_test_barcodes.py` line 188 — `bc_h = 22 * mm`
- Page usable height = A4 842pt − 2×18mm margins − title/section/spacer ≈ 200 mm
  available for the product grid

---

### Sub-Task 3 — Increase QR code size to 3×3 inches in the test PDF

**Status:** [x] done

**Intent**

The current QR cell size is `qr_size = 28 mm` (≈1.1 inch). At 3×3 inches (76.2 mm)
each, 5 QR codes side-by-side would require 5 × 76.2 mm = 381 mm of width, which
exceeds A4 usable width. The layout needs to change.

**Chosen approach:** Switch to **US Letter landscape** (279 × 216 mm).
Usable width = 279 mm − 2×18 mm margins = 243 mm.
243 mm / 3 cols = 81 mm per col — comfortably fits 76.2 mm QR codes.
Product grid stays 2-column (each col = 243/2 ≈ 121 mm — barcodes get wider, fine).
QR grid becomes a 3-column table with 2 rows (row 1: codes 1–3, row 2: codes 4–5
padded with one empty cell).

**Expected Outcomes**

- Page is US Letter landscape.
- Each QR code is 76.2 mm × 76.2 mm (3×3 inches) in the output PDF.
- All 5 staging QR codes appear across 2 rows of 3 columns each (last cell empty).
- Product barcodes remain readable (wider columns, 33 mm height from Sub-Task 2).
- PDF regenerates without error.

**Todo List**

1. Change `from reportlab.lib.pagesizes import A4` to import `letter` and `landscape`
   instead; remove `A4`.
2. Update `PAGE_W, PAGE_H = A4` to `PAGE_W, PAGE_H = landscape(letter)`.
3. Change `doc = SimpleDocTemplate(... pagesize=A4 ...)` to `pagesize=landscape(letter)`.
4. Change `qr_size = 28 * mm` to `qr_size = 76.2 * mm`.
5. Change the QR table from a single 5-column row to a 3-column / 2-row table:
   - Build `qr_cells` as before (list of 5 cell lists).
   - Chunk into rows of 3; pad the last row with empty strings to fill 3 columns.
   - Pass as `Table(rows, colWidths=[usable_w/3]*3)`.
6. Regenerate and confirm all 5 QR codes are large, fully printed, not clipped.

**Relevant Context**

- `picker-vision/tools/generate_test_barcodes.py` lines 60, 167–174, 220–244
- `reportlab.lib.pagesizes.landscape(letter)` returns `(792, 612)` points
- `letter` = 8.5 × 11 inches = 612 × 792 pt; landscape swaps to 792 × 612
- 76.2 mm = `76.2 * mm` using reportlab's `mm` unit constant

---

## Decisions

- **All products active:** all visible product codes report `active=True` simultaneously; `distance_to_centre` dropped entirely.
- **Code 128 height:** 33 mm (150% of 22 mm).
- **QR size:** 76.2 mm (3 inches square).
- **Paper:** US Letter landscape; QR grid 3 cols × 2 rows.
- **No schema changes** to event payloads or TypeScript types.
- **No changes** to `barcode_detector.py` — multi-detection already works.
