# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-07-28 — session 3)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** `ced635c` — Restart Demo button added to supervisor
**CI:** `ced635c` build in progress (started ~19:42 UTC). The deploy job now uses SHA pinning (not floating tag) — no more cache-poisoning.
**Cluster:** All pods on `sha-be705bf` except web-ui which was manually pinned mid-session. Once `ced635c` CI completes, all pods will be on `sha-ced635c`.

---

## Immediate First Action Next Session

1. Confirm `ced635c` CI completed successfully and cluster is on `sha-ced635c`:
   ```powershell
   & "C:\Users\RussConner\kubectl.exe" get pods -n picker-vision-btt -o wide
   (Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content | Select-String "index-[A-Za-z0-9_-]+\.js"
   ```
2. Hard-reload the supervisor page on the demo device, hit **⟳ Restart Demo** to re-sync session
3. Test end-to-end: scan items → order completes → PackWizard surfaces on mobile

---

## What We Did This Session (session 3)

### CI / deploy fix (root cause: Docker GHA layer cache poisoning)
- `sha-1e949a8` and later builds reused a stale GHA layer cache → produced `index-BDmVnm_T.js` (pre-QR-fix bundle) instead of the correct one
- **Fix 1 (`76833fc`):** Added `no-cache: true` to `build-push-action` in CI — every build is now clean
- **Fix 2 (`76833fc`):** BTT deploy now uses SHA pinning (`kubectl set image`) instead of floating branch tag + `rollout restart` — guarantees each push deploys exactly what was built
- Manually pinned cluster to `sha-be705bf` (last known-good image) while CI rebuilt

### Event-processor: workflow never advanced (3 bugs fixed in `f9f292b`)
1. **Pick never written** — event-processor validated barcodes as `correct` but never called `PATCH /orders/{id}/lines/{line_id}`. `quantity_picked` stayed 0 forever.
2. **Stale cache** — completion check ran against cached order data from before the PATCH. Added `_cache.pop("orders")` after each PATCH + re-fetch before completion check.
3. **Mobile completion gated on camera frame** — Pi-camera flow requires all barcodes visible simultaneously + staging QR in frame. Mobile scans one at a time with no staging regions. Fixed: when `staging_regions` is empty, completion driven by `all_picked` (DB state) only.

### Supervisor: Restart Demo button (`ced635c`)
- Added `⟳ Restart Demo` (amber) next to `■ Stop Demo` in the running-session bar
- Stops current session and immediately starts a fresh one with same mode/picker_id
- Fixes out-of-sync state after pod restarts wipe in-memory `_demo_sessions`
- Supervisor-only (guests see it disabled)

### Design clarification: per-scan tray verification
- Reviewed `bobs-tiny-treasures-plan.md` and `btt-pick-verify.html` prototype
- **Phase 1 (blind pick):** continuous scan → `correct` → advance. No mid-pick tray verification. This is correct per design.
- **Phase 2 (Pack & Verify):** triggers after all lines picked. Layer-by-layer verification in `PackWizard.tsx`. This is the designed verification step.
- Gap identified: `MobilePickerView` may not be surfacing `PackWizard` after order completes — needs verification next session.

---

## What's Next (ordered)

- [ ] **Verify `ced635c` deploy** — confirm CI succeeded and cluster is on correct SHA
- [ ] **Test end-to-end pick flow** — scan all items on demo order, confirm order reaches `complete`, confirm `PackWizard` surfaces on mobile automatically
- [ ] **Test `⟳ Restart Demo`** — hit it on supervisor, confirm mobile immediately shows new order
- [ ] **PackWizard auto-trigger** — check `MobilePickerView` listens for `order_complete_pending` and renders `PackWizard`. Plan says done but unverified in live flow.
- [ ] **QR size test (deferred)** — see BACKLOG QOL-008. Print smaller QR labels (1-inch, 0.75-inch) and test scan distance/reliability on Samsung. Do not change `qrSvg` sizing without this data first.
- [ ] **Investigate `qrSvg` 32-byte limit** — picker_id >10 chars will overflow join-demo QR. Extend `qrSvg` to QR v5+ or use relative URL shortening. Add to BACKLOG when ready to fix.
- [ ] **Observability plan sub-tasks 1–5** — still pending (see `observability-plan.md`)

---

## Open Questions

- Does `PackWizard` actually auto-surface on mobile when an order completes in the live flow? Plan says done; unverified in today's session.
- What is the minimum scannable QR size on Samsung Chrome at comfortable working distance? (see BACKLOG QOL-008)

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-be705bf` (`index-pEcfUa22.js` + `index-D3Mz4UNV.js`) |
| LM Studio IP | `http://192.168.1.79:1234` |
| Best local model for Graphify | `google/gemma-4-12b-qat` (12B, fits 16GB VRAM at 32k ctx) |
| Bundle hash check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content \| Select-String "index-[A-Za-z0-9_-]+\.js"` |
| Remote log check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/api/debug/logs/Guest" -UseBasicParsing).Content \| python -m json.tool` |
| Debug snapshot | `Invoke-WebRequest "https://bobstinytreasures.snwbd.com/api/debug/snapshot/Guest" -UseBasicParsing -OutFile snap.jpg` (requires `?debug=1` in mobile URL) |
| Demo status | `(Invoke-WebRequest "http://192.168.11.213/api/demo/status" -UseBasicParsing -Headers @{"X-API-Key"="changeme"}).Content \| python -m json.tool` |

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
