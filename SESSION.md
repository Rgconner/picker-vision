# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-08-01 — session 10)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** `00d2e6a` — fix: session 10 — QOL-017/023/024/025/027/028/029/030 (all groups)
**CI status:** `sha-00d2e6a` deployed on all pods (web-ui 1.4.0, api-gateway 1.3.1).
**System state:** All 4 services healthy. Run ⟳ Reset before walkthrough to clear any orphaned orders.

---

## 🏁 MILESTONE — 2026-08-01 (session 10)

**3 full orders. 3 mechanically flawless end-to-end picks. Wrong scans handled correctly.**

This is the first time the complete pick flow has run without a single mechanical failure on real hardware:
- Correct scan → ConfirmOverlay → Picked! gate → resume scanning
- Wrong scan → yellow bbox rejection, scan loop continues, no false confirm
- Last pick → Order complete gate → Accept → next order assigned
- All 3 orders completed in sequence

The core demo loop — scan, confirm, gate, advance — is stable. This is the foundation everything else builds on.

**Signed off by:** Russ Conner, 2026-08-01

---

## Immediate First Action Next Session

**→ Read this file. Core pick flow is stable. Next focus: PackWizard sign-off queue (carry items below).**

---

## What We Did This Session (session 10)

All 8 QOL items from the session 10 build plan — built, committed `00d2e6a`, deployed and verified.

### GROUP A — Must fix (all deployed)

| # | Item | What shipped |
|---|---|---|
| QOL-030 | XS | `setWrongItems([])` in `handleConfirm` — yellow bbox clears instantly on confirm |
| QOL-029 | S | `savedPickerId()` beats `defaultPickerId` in `initialId` priority |
| QOL-024 | S | `ConfirmOverlay` shows `"N of M — scan again after confirming"` / `"M of M — last one!"` |
| QOL-017 | M | Stop scan loop after confirm; show "Move item away — tap to continue" overlay; 2s blackout removed |

### GROUP B — Session control flow (all deployed)

| # | Item | What shipped |
|---|---|---|
| QOL-028 | S | `api/demo/stop` publishes `{type:"demo_reset"}` to all picker Redis channels; mobile shows "Demo ended by supervisor" overlay |
| QOL-025 | M | After last pick: "Order X complete — Ready for next order?" gate; only calls `demo/advance` on Accept tap |

### GROUP C — Polish (all deployed)

| # | Item | What shipped |
|---|---|---|
| QOL-023 | S | `defaultPickerId` derives `picker-{firstname}` when `auth.user.picker_id` is null |
| QOL-027 | S | Idle Reset button now has `hover:bg-[#f1c21b]/10` + `ml-auto` to match running Restart button |

---

## Russ Sign-off Queue (carried + session 9 items not yet tested)

These were never reached during session 9 due to the flow issues found:

- [ ] `[Russ needed]` **PackWizard opens and pack flow completes** — tap Pack Order, verify product names (not UUIDs), tap Layer Verified per layer → Order Packed!
- [ ] `[Russ needed]` **PackWizard auto-opens via WS** — after last pick, wizard opens automatically within ~5s
- [ ] `[Russ needed]` **Tap Verify twice rapidly** — must be idempotent (THA-003 fixed, needs live confirmation)
- [ ] `[Russ needed]` **Close wizard mid-flow, reopen** — must resume from same layer
- [ ] `[Russ needed]` **⟳ Reset clears orphaned orders** — tap Reset, active orders list empties
- [ ] `[Russ needed]` **Reset twice** — idempotent, no error

### New flow checks (session 10 builds — verify during walkthrough)

- [ ] `[Russ needed]` **QOL-017** — confirm a pick, "Move item away" screen appears, tap to resume scanning
- [ ] `[Russ needed]` **QOL-024** — multi-qty order: confirm shows "1 of 2 — scan again" on first confirm, "2 of 2 — last one!" on second
- [ ] `[Russ needed]` **QOL-025** — confirm last pick: "Order X complete — Ready for next?" gate appears; Accept advances; Not yet stays idle
- [ ] `[Russ needed]` **QOL-028** — tap Stop Demo from supervisor; phone shows "Demo ended by supervisor" overlay
- [ ] `[Russ needed]` **QOL-029** — after Reset, phone retains `picker-{name}` ID (not auth name)
- [ ] `[Russ needed]` **QOL-030** — confirm a pick; yellow bbox clears instantly
- [ ] `[Russ needed]` **QOL-023** — open Mobile tab on fresh login; picker ID shows `picker-{firstname}` not raw auth name

---

## Open Questions

- `order_complete_pending` WS event: never confirmed live — with QOL-025 gate in place, PackWizard can be triggered by the order-complete gate screen instead. Lower priority.
- QOL-026 (pod restart mid-demo) still open: QOL-025 gate partially helps (phone pauses at order-complete), but scanner stays registered after pod restart. Still needs proper fix.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-00d2e6a` |
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
| `demo/stop` publishes `demo_reset` to all picker channels | QOL-028: supervisor stop notifies all phones immediately via Redis pub/sub → WS. |
| After last pick: order-complete gate before `demo/advance` | QOL-025: picker controls readiness. PackWizard timing can follow from this gate. |
| Do NOT push to CI during a live walkthrough | Pod restart destroys in-memory demo session (QOL-026). All code changes must be batched and deployed before the walkthrough begins. |
