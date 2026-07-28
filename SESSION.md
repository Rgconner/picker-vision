# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-07-28)

**Branch:** `feature/bobs-tiny-treasures`  
**Last commit:** `a16e1b6` — BTT product QR section added to test sheet  
**CI status:** All builds succeeded (`a16e1b6`, `1e949a8`, `be705bf`) — but **cluster is stuck on old bundle `index-BDmVnm_T.js`**. Pod delete/recreate did not pull new image. The floating tag `feature-bobs-tiny-treasures` was not updated in the registry for the last 3 commits. **This must be diagnosed first next session.**

---

## Immediate First Action Next Session

1. Check why CI isn't updating the floating tag in GHCR for the last 3 commits:
   ```powershell
   Invoke-WebRequest "https://api.github.com/repos/Rgconner/picker-vision/actions/runs?branch=feature/bobs-tiny-treasures&per_page=5" -UseBasicParsing | ConvertFrom-Json | Select-Object -ExpandProperty workflow_runs | ForEach-Object { Write-Host $_.id $_.conclusion $_.head_sha.Substring(0,7) }
   ```
2. Verify what digest GHCR has for tag `feature-bobs-tiny-treasures`
3. Force cluster to correct image once confirmed

---

## What We Did This Session

### Scanner engine
- **Restored `BarcodeDetector` as primary** — confirmed working on Samsung Chrome
- **ZXing canvas fallback** preserved (480px short-side cap, 250ms poll)
- **Per-value debounce map** — `Map<value, timestamp>` replaces single ref; fixes flood when two codes visible simultaneously
- **Format list:** `BarcodeDetector` constructor uses `['qr_code','code_128','ean_13','ean_8','data_matrix','code_39']` (full list — narrowing to 4 broke detection). ZXing hints use `[QR, Code128, EAN-13, EAN-8]` only.

### Data Matrix → QR migration (all on-screen codes)
All `dmSvg` calls replaced with `qrSvg` across entire app:
- `DemoPage.tsx` — product, staging, shelf labels
- `DemoControls.tsx` — next-item product code, join-demo link
- `PackWizard.tsx` — staging confirmation QR
- `SupervisorView.tsx` — supervisor next-scan prompt

Root cause: Samsung `BarcodeDetector` does not support `data_matrix`. Every scannable code in the app was Data Matrix. None of them could ever be read on Samsung.

### Join-demo QR URL fix
- `qrSvg` supports max ~32 bytes (QR v1-4 EC-M)
- Full origin URL `https://bobstinytreasures.snwbd.com/app?picker_id=Guest` = 52 chars — exceeds limit, produces malformed QR
- Fixed to `/mobile?picker_id=Guest` (23 chars)

### Test sheet
- Added BTT product QR section to `tools/generate_test_barcodes.py`
- 9 BTT products at 2-inch QR, 4-up grid, US Letter landscape
- PDF regenerated at `tools/test_barcodes.pdf`

### Tooling
- **Graphify** installed (`pip install graphifyy`) — code-only graph built: 871 nodes, 1524 edges, 51 communities. Graph at `graphify-out/graphify-out/graph.html`. Full semantic run (needs `ANTHROPIC_API_KEY` or LM Studio `gemma-4-12b-qat` at `http://192.168.1.79:1234`) deferred.
- **SESSION.md** created as permanent session handoff

---

## What's Next (ordered)

- [ ] **Fix CI/cluster deploy** — floating tag `feature-bobs-tiny-treasures` not updating in GHCR for commits `be705bf`, `1e949a8`, `a16e1b6`. Diagnose and push correct image.
- [ ] **Test QR scanning after deploy** — confirm join-demo QR, supervisor next-item QR, and BTT product labels all read on Samsung
- [ ] **Print and test BTT QR sheet** — `tools/test_barcodes.pdf` — confirm 2-inch BTT QRs scan at working distance
- [ ] **Investigate `qrSvg` 32-byte limit** — any picker_id >10 chars will overflow. Either extend `qrSvg` to QR v5+ or use a URL shortener approach. Add to BACKLOG.
- [ ] **Observability plan sub-tasks 1–5** — all still pending (see `observability-plan.md`)

---

## Open Questions

- Why does the `feature-bobs-tiny-treasures` floating tag in GHCR not update on recent CI runs even though the build+deploy jobs show `success`?
- Does `BarcodeDetector` on Samsung Chrome 150 support any QR version without issue? The join-demo QR encodes a URL — needs to stay under 32 bytes.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Expected bundle (after fix) | `index-pEcfUa22.js` (be705bf) or newer |
| Current stuck bundle | `index-BDmVnm_T.js` |
| LM Studio IP | `http://192.168.1.79:1234` |
| Best local model for Graphify | `google/gemma-4-12b-qat` (12B, fits 16GB VRAM at 32k ctx) |
| Bundle hash check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content \| Select-String "index-[A-Za-z0-9]+\.js"` |
| Remote log check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/api/debug/logs/Guest" -UseBasicParsing).Content \| python -m json.tool` |
| Debug snapshot | `Invoke-WebRequest "https://bobstinytreasures.snwbd.com/api/debug/snapshot/Guest" -UseBasicParsing -OutFile snap.jpg` (requires `?debug=1` in mobile URL) |

---

## Decisions Made (permanent)

| Decision | Rationale |
|----------|-----------|
| `BarcodeDetector` primary, ZXing canvas fallback | Native ML Kit confirmed working on Samsung; ZXing for Firefox/Safari/Vuzix |
| Full format list for `BarcodeDetector` constructor | Narrowing to 4 formats broke QR detection — do not narrow again without testing |
| All on-screen codes use `qrSvg` not `dmSvg` | Samsung `BarcodeDetector` does not support `data_matrix` |
| `qrSvg` payloads must be ≤32 bytes | QR v1-4 EC-M limit — use short relative URLs |
| ZXing hints: QR/Code128/EAN only | No data_matrix in ZXing either — no BTT use case |
| Per-value debounce Map | Two simultaneous codes (EPSN+DELT) must debounce independently |
