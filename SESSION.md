# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-07-29 — session 7)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** see git log — housekeeping + QOL batch
**Local HEAD:** Uncommitted changes pending commit.
**CI status:** Last deployed `sha-e5d5c71`. Bundle: `index-zMWDuqki.js`. Pod confirmed on `sha-e5d5c71`.
**singularity-paper repo:** Live at https://github.com/Rgconner/singularity-paper — commit `7769ee9` (init scaffold).
**BACKLOG.md STORY-001:** Trimmed to pointer — full content now in singularity-paper.

---

## Immediate First Action Next Session

1. Hit **⟳ Restart Demo** on the supervisor page to clear any stale demo orders.
2. Connect Samsung to `/mobile` and start pick flow on the first pending order.
3. Confirm `ConfirmOverlay` appears, tap Confirm, verify `quantity_picked` increments.
4. Run `python tools/generate_test_barcodes.py` to produce `nav_card.pdf` — print and laminate before next physical demo.

---

## What We Did This Session (session 7)

### Housekeeping
- Verified QOL-016 (`lastFireTimeRef` 300ms cooldown) and QOL-014 (`wrongItems` overlay) already committed and live in `sha-e5d5c71` bundle `index-zMWDuqki.js` — confirmed strings `dwell-fire` and `wrongItems` present in pod
- Amended bad commit `e40f4ae` (garbage message + `~$ACKLOG.md` lock file accidentally staged) → clean commit `78530a1`
- Pushed singularity-paper to https://github.com/Rgconner/singularity-paper — commit `7769ee9` (9 files, 889 insertions)
- Trimmed BACKLOG.md STORY-001/001A/poem (~415 lines) to a 19-line pointer to the new repo

### QOL Batch (pre-walkthrough housekeeping)
- **CI pipeline hardened** — removed `feature/mobile-web-client` from build triggers in `build-server-images.yml` and `build-pi-image.yml`; old branches now produce no images
- **QOL-012 confirmed resolved** — `strategy: type: Recreate` already in `k8s/overlays/bobs-tiny-treasures/order-service-deployment-patch.yaml`; BACKLOG updated
- **QOL-005 fixed** — scan log now persisted to Redis key `scan-ledger` (LPUSH, capped 100, 1-hour TTL); restored on pod startup via `_restore_scan_ledger()`; Redis failure non-fatal
- **QOL-013 confirmed resolved** — deployed seed ConfigMap already uses plain ` - ` separators; no em-dashes in any deployed data path; BACKLOG updated
- **QOL-009 fixed** — `build_nav_card()` added to `tools/generate_test_barcodes.py`; running the script now produces `nav_card.pdf` (A4 landscape, 2×2 grid, NAV:CONFIRM/SKIP/BACK/HELP)

---

## What's Next (ordered)

- [ ] **Test end-to-end pick flow on Samsung** — connect phone, scan items, confirm ConfirmOverlay appears after each correct scan, tap Confirm, verify `quantity_picked` increments, order reaches `complete`
- [ ] **Test ⟳ Restart Demo** — hit it on supervisor, confirm mobile shows new order immediately
- [ ] **Test scenario switching** — change to Physical Demo in supervisor, confirm overlay shows nav card instruction + 10s button fallback instead of amber Confirm button
- [ ] **Verify PackWizard auto-surfaces** after order completes (unverified in live flow — `MobilePickerView` listens for `order_complete_pending` WS event)
- [ ] **Print nav_card.pdf** — run `python tools/generate_test_barcodes.py`, print and laminate before next physical demo
- [ ] **QR size test (deferred)** — see BACKLOG QOL-008
- [ ] **Write singularity-paper prose draft** — when demo is stable and there's a real pause

---

## Open Questions

- Does `PackWizard` actually auto-surface on mobile when an order completes? Plan says done; unverified in live flow.
- singularity-paper `sessions/` directory and `synopsis-log.md` not yet created — close-out-chat skill will create them on first use.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-e5d5c71` (`index-zMWDuqki.js`) |
| LM Studio IP | `http://192.168.1.79:1234` |
| API gateway (BTT) | `http://192.168.11.213` (key: `changeme`) |
| Web UI (BTT) | `http://192.168.11.214` |
| Bundle hash check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content \| Select-String "index-[A-Za-z0-9_-]+\.js"` |
| Demo status | `(Invoke-WebRequest "http://192.168.11.213/api/demo/status" -UseBasicParsing -Headers @{"X-API-Key"="changeme"}).Content \| python -m json.tool` |
| All orders | `(Invoke-WebRequest "http://192.168.11.213/api/orders" -UseBasicParsing -Headers @{"X-API-Key"="changeme"}).Content \| python -m json.tool` |
| DB in pod | `/data/picker.db` (persistent volume) — NOT `/app/picker.db` |

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
| CI uses `no-cache: true` on all builds | GHA layer cache caused stale bundles to ship silently — never cache Docker builds on this project |
| BTT deploy uses SHA pinning not floating tag | Floating tag + rollout restart is unreliable; SHA pinning is the pattern for all three envs now |
| Phase 1 pick flow has no mid-pick tray verification | By design — blind pick is continuous. Tray verification is Phase 2 (PackWizard), not between individual scans. |
| Picks written by mobile `confirmPick` only | Pi auto-pick removed from event-processor. All picks via `PATCH /api/orders/{id}/lines/{line_id}` called from mobile confirm action. |
