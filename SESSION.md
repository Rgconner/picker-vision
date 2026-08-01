# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-08-01 — session 9)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** `03d4fca` — docs: session 9 backlog updates
**CI status:** `sha-8211e08` deployed on all pods (web-ui + order-service updated this session).
**System state:** All 4 services healthy. DB may have orphaned orders — run ⟳ Reset before starting.

---

## Immediate First Action Next Session

**→ Read this file, then execute the session 10 build plan below. Do NOT run a walkthrough first — build everything, deploy, verify, THEN walk.**

---

## What We Did This Session (session 9)

### Live Walkthrough with Russ — Real Hardware (Samsung phone + laptop)

| # | Bug / Issue | Fix | Commit |
|---|---|---|---|
| 1 | THA-003 — re-verify layer had no guard, auto-seal re-ran | Added idempotency guard to `verify_layer` PATCH | `62060e0` |
| 2 | QOL-021 — `/app` Mobile tab used auth identity, ConfirmOverlay never fired | Auto-join `useEffect` switches to demo picker ID | `7278f80` |
| 3 | QOL-017 (partial) — confirm overlay re-fired on barcode in frame | 2-second per-barcode blackout (band-aid — proper fix in session 10) | `8211e08` |
| 4 | QR Join Demo encoded relative URL — camera couldn't open it | Full `https://` URL + EC-L qrSvg for 78-byte capacity | `8211e08` |

### New Issues Found by Russ (all logged in BACKLOG.md)

| QOL | Title | Effort |
|---|---|---|
| QOL-022 | Landing page out of sync with app | S |
| QOL-023 | Mobile tab defaults to auth name not picker-style ID | S |
| QOL-024 | Multi-qty pick looks like failure — no "1 of 2" feedback | S |
| QOL-025 | No "ready for next order?" gate — order auto-assigned | M |
| QOL-026 | Pod restart drops in-memory session — phone keeps scanning | M |
| QOL-027 | Reset button styling inconsistent idle vs running | S |
| QOL-028 | Reset doesn't notify phone — picker left scanning void | S |
| QOL-029 | Phone reverts to auth identity after Reset | S |
| QOL-030 | Yellow bbox lingers after confirm — looks broken | XS |

---

## Session 10 Build Plan (approved by Russ)

Build everything below between sessions. Do NOT walk until all are deployed and verified.

### Must fix (4.5 hr)

| # | Item | File(s) | What to build |
|---|---|---|---|
| 1 | **QOL-030** XS | `MobilePickerView.tsx` | In `handleConfirm`: call `setWrongItems([])` and clear `lastScan` immediately when `setPendingConfirm(null)` fires. Yellow bbox gone instantly on confirm. |
| 2 | **QOL-029** S | `MobilePickerView.tsx` | Fix `initialId` priority: `savedPickerId()` must beat `defaultPickerId` when a non-empty saved value exists. Change line 136 from `urlPickerId \|\| defaultPickerId \|\| savedPickerId()` to `urlPickerId \|\| savedPickerId() \|\| defaultPickerId`. |
| 3 | **QOL-024** S | `ConfirmOverlay.tsx`, `MobilePickerView.tsx` | Pass `quantityPicked` and `quantity` into `ConfirmOverlay`. When `quantity > 1` and this is not the last pick, show subtitle: `"${quantityPicked + 1} of ${quantity} — scan again after confirming"`. |
| 4 | **QOL-017** M | `MobilePickerView.tsx`, `MobileControls.tsx` | After `handleConfirm`, stop the scan loop (`setScanning(false)`) and enter a new `'confirmed'` UI state. Show a brief overlay: `"✓ Picked — move item away, then tap to continue"`. Picker taps → `setScanning(true)` resumes. Remove the 2-second blackout band-aid (it's superseded by this). |
| 5 | **QOL-028** S | `order_service/main.py`, `websocket_hub`, `useMobilePickerSession.ts` | On `demo/stop` (any path), push `{"type":"demo_reset"}` WS message to all connected picker sockets. In `useMobilePickerSession.onmessage`, handle `type==="demo_reset"`: call `setPickerState(null)`. In `MobilePickerView`, detect null pickerState after scanning was active → stop scan loop, show "Demo ended by supervisor" screen. |

### Should fix (3.25 hr)

| # | Item | File(s) | What to build |
|---|---|---|---|
| 6 | **QOL-025** M | `MobilePickerView.tsx`, `order_service/main.py` | After last pick confirmed, do NOT call `demo/advance` automatically. Instead enter an `'order_complete'` UI state showing "Order DEMO-XXX complete — Ready for next order?" with ✓ Accept / ✗ Not yet. Only call `demo/advance` on Accept. Not yet → idle state, no order assigned. |
| 7 | **QOL-023** S | `App.tsx` | When `auth.user.picker_id` is null, generate default as `picker-${auth.user.name.toLowerCase().split(' ')[0]}` (e.g. `picker-bob`) instead of raw `auth.user.name`. |
| 8 | **QOL-027** S | `DemoControls.tsx` | Unify Reset/Restart button: same colour (`#f1c21b` border/text), same position (top-right of DemoControls panel), same icon (⟳) in both idle and running states. |
| 9 | **QR URL** XS | Already in `sha-8211e08` | Verify deployed — grep `window.location.origin` in running web-ui pod. If not present, redeploy. |

---

## Russ Sign-off Queue (carried from session 8 — not yet tested)

These were never reached during session 9 due to the flow issues found:

- [ ] `[Russ needed]` **PackWizard opens and pack flow completes** — tap Pack Order, verify product names (not UUIDs), tap Layer Verified per layer → Order Packed!
- [ ] `[Russ needed]` **PackWizard auto-opens via WS** — after last pick, wizard opens automatically within ~5s
- [ ] `[Russ needed]` **Tap Verify twice rapidly** — must be idempotent (THA-003 fixed, needs live confirmation)
- [ ] `[Russ needed]` **Close wizard mid-flow, reopen** — must resume from same layer
- [ ] `[Russ needed]` **⟳ Reset clears orphaned orders** — tap Reset, active orders list empties
- [ ] `[Russ needed]` **Reset twice** — idempotent, no error

---

## Open Questions

- Does `order_complete_pending` WS event reliably arrive after last pick? Never confirmed live — `order_complete_pending` depends on a scan event arriving after all lines are `picked`. With QOL-025 in place (explicit "ready?" gate), this becomes less critical — PackWizard can be triggered by the gate screen instead of the WS event.
- QOL-025 and QOL-028 share a design: the picker explicitly controls readiness. Consider building them as one coherent "session control flow" pass rather than two separate fixes.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-8211e08` |
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
| `qrSvg` now uses EC-L (not EC-M) | EC-L gives 78-byte capacity at v4 — needed for full `https://` Join Demo URL |
| `qrSvg` payloads must be ≤78 bytes | QR v4 EC-L limit |
| ZXing hints: QR/Code128/EAN only | No data_matrix in ZXing either — no BTT use case |
| Per-value debounce Map | Two simultaneous codes (EPSN+DELT) must debounce independently |
| CI uses `no-cache: true` on all builds | GHA layer cache caused stale bundles to ship silently — never cache Docker builds on this project |
| BTT deploy uses SHA pinning not floating tag | Floating tag + rollout restart is unreliable; SHA pinning is the pattern for all three envs now |
| Phase 1 pick flow has no mid-pick tray verification | By design — blind pick is continuous. Tray verification is Phase 2 (PackWizard), not between individual scans. |
| Picks written by mobile `confirmPick` only | Pi auto-pick removed from event-processor. All picks via `PATCH /api/orders/{id}/lines/{line_id}` called from mobile confirm action. |
| `PackWizard` ORDER_API base is `/api` | Paths start with `/orders/…` — final URL is `/api/orders/…` matching gateway routes. |
| `demo/stop {}` also cancels orphaned DB orders | Prevents stale `picking` orders surviving pod restarts. Safe because only cancels `Demo (%` customers. |
| Do NOT push to CI during a live walkthrough | Pod restart destroys in-memory demo session (QOL-026). All code changes must be batched and deployed before the walkthrough begins. |
