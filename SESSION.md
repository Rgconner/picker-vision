# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> **Bob's debug rule #3:** If you've patched the same thing three times and it still fails, the thing you're patching is not the problem. Replace the layer, don't fix it again.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-08-11 — session 19/20)

**Branch:** `feature/bobs-tiny-treasures`
**Last local commit:** `228d492` — feat(#140,#141,#142): confirm crop, exit-scan button, auto-reload banner
**Last pushed commit:** `a217790` — session 18 handoff
**CI status:** Runner up and healthy
**System state:** 3 new features committed locally, not yet pushed. 2 dirty files still pending from session 18.

## Immediate First Action Next Session

**→ Read this file. Commit dirty files below. Then push all + verify deploy.**

### Two locally dirty files — NOT yet committed or pushed

| File | Card | What changed | Status |
|---|---|---|---|
| `server/web_ui/src/App.tsx` | #139 | Supervisor loses Management tab — Management is owner-only | Dirty, not committed |
| `server/web_ui/src/DemoPage.tsx` | #137 | `tryScanning()` unique Guest suffix — same fix as `useAuth.ts`, catches hardcoded `id: 'guest'` | Dirty, not committed |

**Before pushing:**
1. Commit `App.tsx` + `DemoPage.tsx` together against cards #139 + #137
2. Push all commits — `228d492` + dirty file commit
3. Verify deploy (check runner, bundle hash, demo status)

---

## What Shipped This Session (session 19/20)

| Commit | Card | What |
|---|---|---|
| `372323d` | #134 #133 | Owner role (login, routing) + Load Gen noise sliders |
| `3381f40` | #135 | QOL-040: scanFiredRef — stop scan immediately on fire |
| `38ae389` | #134 | Owner role in Management dropdowns |
| `795577b` | #132 | 2-second Ma Window on move-away gate with countdown |
| `9e71302` | #136 | Load Gen noise defaults: miscan=0.01, multi-scan=0.02 |
| `0647e38` | #137 | Guest unique suffix in `useAuth.ts` (Guest-XXXX) |
| `228d492` | #140 #141 #142 #138 | Confirm crop, exit-scan button, auto-reload banner, simulator rolling window |

### Role hierarchy (current)
`picker` → `guest` → `owner` → `supervisor`

| Role | Tabs visible |
|---|---|
| supervisor | Operator, Supervisor, Mobile, System, Load Gen, Stores |
| owner | Operator, Supervisor, Mobile, System, Manage |
| guest | Operator, Supervisor, Mobile, System |
| picker | Mobile only |

**Note:** Management tab was still visible to supervisor as of this session — `App.tsx` fix is local but not pushed (#139).

### Demo observations (OMS technical seller walkthrough)
- Two-phone Guest test: unique IDs confirmed working after `0647e38`
- Owner role: create user `Owner` / role `owner` / PIN `btt01` via Management before next demo
- Load Gen noise 0.01/0.02 felt right — brings color without overwhelming the supervisor view
- Ma Window (2s countdown) worked well — no premature resume

---

## Open Cards (picker-vision board)

### Immediately relevant (next session)
| # | Title | State |
|---|---|---|
| #139 | Supervisor loses Management tab | Code local, not pushed |
| #137 | THA-002-CONFIRMED dual-device picker_id collision | DemoPage.tsx local, not pushed |
| #140 | Confirm overlay scan crop | Committed `228d492`, not pushed — **test in physical-demo mode** |
| #141 | Exit scan corner button | Committed `228d492`, not pushed — **test portrait mode** |
| #142 | Auto-reload banner | Committed `228d492`, not pushed — **test fires automatically after next deploy** |
| #138 | Regional simulation rolling window max 6 | Committed `228d492`, not pushed — rolled_off_id UI banner still needs wiring in `RegionalSimView.tsx` |

### Parked (not critical for next demo)
| # | Title |
|---|---|
| #125 | Glove-first mobile UI |
| #130 | Move CI runner to cluster pod |
| #42 | ARCH-002: THA Protocol |
| #41 | ARCH-001: PV_LOG_LEVEL harness |
| #17 | THA: Stop/Start rapid tap race |
| #16 | THA: Restart with no session |
| #15 | THA-002: Two phones same picker_id (original — closed by #137 fix) |
| #14 | THA-001: Stale demo session |
| #13 | QOL-031: Action instructions too muted |
| #12 | QOL-022: Landing page out of sync |
| #11 | QOL-007: Debug snapshot |

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| API gateway (BTT) | `http://192.168.11.213` (key: `changeme`) |
| Web UI (BTT) | `http://192.168.11.214` |
| Self-hosted runner | CMD window at `C:\Users\RussConner\actions-runner\run.cmd` — goes stale when CMD closes, needs manual restart |
| Bundle hash check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content \| Select-String "index-[A-Za-z0-9_-]+\.js"` |
| Demo status | `(Invoke-WebRequest "http://192.168.11.213/api/demo/status" -UseBasicParsing -Headers @{"X-API-Key"="changeme"}).Content \| python -m json.tool` |
| All orders | `(Invoke-WebRequest "http://192.168.11.213/api/orders" -UseBasicParsing -Headers @{"X-API-Key"="changeme"}).Content \| python -m json.tool` |
| DB in pod | `/data/picker.db` (persistent volume) — NOT `/app/picker.db` |
| LM Studio IP | `http://192.168.1.79:1234` |

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
| Guest picker_id must be unique per device | THA-002-CONFIRMED: two phones sharing `id: 'guest'` subscribed to the same Redis channel and crossed streams. Fixed with `Guest-XXXX` random suffix in both `useAuth.ts` and `DemoPage.tsx`. |
