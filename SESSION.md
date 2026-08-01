# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-08-01 — session 8)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** `833cc53` — fix: refresh full orders list after demo/advance
**CI status:** `sha-833cc53` deployed on all pods. Bundle: `index-BWrQB54f.js`.
**System state:** All 4 services healthy. DB clean (no orphaned orders, no sessions).

---

## Immediate First Action Next Session

1. Hit supervisor at `/app`, log in as Bob (Owner) / btt01.
2. In DemoControls: click **⟳ Reset** (clears any orphaned orders from prior sessions).
3. Select a picker (e.g. Sprinkle) in the picker dropdown, click **▶ Personal**.
4. Scan the "Join Demo" QR code from the supervisor screen on the Samsung phone.
5. Tap **▶ Scan Items** on the phone and scan product labels from the DemoControls "next item" QR.
6. Verify ConfirmOverlay appears after each correct scan, tap Confirm.
7. After last item: verify new order DEMO-...-002 appears in the mobile pick list immediately.
8. After last order: verify PackWizard opens automatically (from order_complete_pending WS event).
9. Step through PackWizard — verify product names show (not UUID fragments).
10. Tap ✅ Layer Verified for each layer — verify wizard reaches "Order Packed!" screen.

---

## What We Did This Session (session 8)

### Demo Walkthrough — 7 Bugs Found and Fixed

All bugs were found by methodically simulating the demo flow via API calls and reading source code.

| # | Bug | Fix | Commit |
|---|-----|-----|--------|
| 1 | `PackWizard` `ORDER_API` base path was `/api/order` — calls generated `/api/order/orders/{id}/pack` (404) | Changed to `/api` so paths become `/api/orders/{id}/pack` | `05a6102` |
| 2 | Gateway had no proxy routes for `POST /api/orders/{id}/pack` or `PATCH /api/orders/{id}/totes/{tote_id}/layers/{layer_id}` | Added two gateway routes | `05a6102` |
| 3 | `PackWizard` layer items showed truncated UUID (`Line item (a8e13f88…)`) instead of product names | Parallel-fetch order on init, build `lineNames` Map, use in display | `8d657a2` |
| 4 | `MobilePickList` Pack Order button was dead code — `GET /api/orders` only returns `pending`/`picking` so complete orders are never in the list | Auto-open PackWizard via `order_complete_pending` WS event + `useEffect` | `8d657a2` |
| 5 | `POST /api/demo/stop {}` didn't cancel orphaned demo orders whose session was lost on pod restart | Extended `demo/stop` to cancel all `Demo (%` `picking` orders in DB when `session_id` is omitted | `9f088ed` |
| 6 | No Reset button in idle DemoControls — supervisor couldn't clean stale orders without a running session | Added **⟳ Reset** button to idle state panel (calls `demo/stop {}`) | `9f088ed` |
| 7 | After `demo/advance` created a new order, mobile pick list didn't refresh to show it (only refreshed on `pickerState` changes) | After `demo/advance` succeeds, immediately fetch `/api/orders` and call `setOrders` | `833cc53` |

---

## What's Next (ordered)

### THA Sign-off Queue (session 8 bugs — not closed until tested on real hardware)

- [ ] `[THA needed]` **Bug #1+2 — PackWizard opens and pack flow completes**
  - Open `/app`, log in as Bob, start demo for Sprinkle, pick all items on phone
  - Tap **📦 Pack Order** (or let it auto-open) — wizard must show product names, not UUIDs
  - Tap ✅ Layer Verified for every layer — wizard must reach "Order Packed!" screen
  - **Break it:** tap Verify twice rapidly — must not create duplicate layer records
  - **Break it:** close the wizard mid-flow and reopen — must resume from where it left off (idempotent `POST /pack`)

- [ ] `[THA needed]` **Bug #4 — PackWizard auto-opens via WS order_complete_pending**
  - Pick all items on phone; after last Confirm tap, PackWizard must open automatically within ~5 s
  - No manual "Pack Order" tap required
  - **Break it:** close wizard, re-confirm same order (already packed) — wizard must show "done" state, not an error

- [ ] `[THA needed]` **Bug #5+6 — ⟳ Reset clears orphaned orders**
  - Start a demo, kill the tab (simulating pod restart / lost session)
  - Reopen supervisor, confirm stale order visible in active orders list
  - Tap **⟳ Reset** — active orders list must be empty immediately
  - **Break it:** tap Reset twice — must be idempotent, no error on second call

- [ ] `[THA needed]` **Bug #7 — New order appears immediately after last pick**
  - Confirm last item on phone — pick list must update to show `DEMO-...-002` within 1–2 s
  - **Break it:** confirm last item while phone is on a slow connection (throttle to 3G) — order must still appear within a few seconds of reconnect, not hang forever

### Ongoing walkthrough items

- [ ] **Test Presentation mode** — Start Presentation, verify demo-presenter picker ID flow
- [ ] **Physical demo scenario** — switch to Physical Demo, scan NAV:CONFIRM nav card
- [ ] **Print nav_card.pdf** — run `python tools/generate_test_barcodes.py`, print and laminate
- [ ] **QR size test (deferred)** — see BACKLOG QOL-008

---

## Open Questions

- Does `order_complete_pending` WS event reliably arrive at the mobile client? The event fires from `event-processor` when it reads a picking order with all lines `picked`. The mobile client needs to have sent at least one scan event after the last pick for the event-processor to re-evaluate. If `pickerState` never updates post-last-pick, the `order_complete_pending` may not arrive. **Fallback:** the Pack Order button still works if the order happens to appear in the list (e.g. status=packing/complete). Worth testing live.
- singularity-paper `sessions/` directory and `synopsis-log.md` not yet created.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-833cc53` (`index-BWrQB54f.js`) |
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
| `PackWizard` ORDER_API base is `/api` | Paths start with `/orders/…` — final URL is `/api/orders/…` matching gateway routes. |
| `demo/stop {}` also cancels orphaned DB orders | Prevents stale `picking` orders surviving pod restarts. Safe because only cancels `Demo (%` customers. |
