# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> **Bob's debug rule #2:** Native camera reads it = code problem, not physical. Full stop.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-07-28 — session 4)

**Branch:** `feature/bobs-tiny-treasures`
**Last commit:** `25bae1d` — TS fix: navAction + Detection type annotation
**CI status:** Build triggered for `25bae1d` — runner had not yet picked it up at end of session. Watch for it.
**Cluster:** All pods on `sha-26c882a`. Once `25bae1d` CI completes, pods will move to `sha-25bae1d`.

---

## Immediate First Action Next Session

1. Confirm `25bae1d` CI completed and cluster moved:
   ```powershell
   & "C:\Users\RussConner\kubectl.exe" get pods -n picker-vision-btt -o json | python -c "
   import sys,json; pods=json.load(sys.stdin)['items']
   [print(p['metadata']['name'], p['status']['containerStatuses'][0]['image'].split(':')[-1]) for p in pods if p['status'].get('containerStatuses')]
   "
   # Bundle should be NEW hash (not index-Z_9LpMAG.js or index-D3Mz4UNV.js)
   (Invoke-WebRequest 'https://bobstinytreasures.snwbd.com/mobile' -UseBasicParsing).Content | Select-String 'index-[A-Za-z0-9_-]+\.js'
   ```
2. If runner still hasn't picked up the job, restart it:
   ```powershell
   Stop-Process -Name "Runner.Listener" -Force
   Start-Process "C:\Users\RussConner\actions-runner\run.cmd"
   ```
3. Once deployed, hit **⟳ Restart Demo** on the supervisor page, then test end-to-end on Samsung.

---

## What We Did This Session (session 4)

### Deploy investigation
- Cluster was already on `sha-26c882a` at session start — `index-BDmVnm_T.js` was already gone (fixed last session)
- Commit `a28a24f` (confirm overlay + demo advance) was committed and pushed but CI never ran for it — runner had a broker connection error at 19:51 UTC and the push at ~15:46 local was missed
- Pushed empty commit `fe75bf5` to re-trigger CI

### TypeScript build errors fixed (`25bae1d`)
Two errors in the Docker build:
1. **`MobileLiteView.tsx:74`** — literal `ScanResult` object missing `navAction: null` (field was added to interface but not to this manual-entry code path)
2. **`MobilePickerView.tsx:249`** — inline type annotation on `.find()` callback used `status: string` but `Detection.status` is `'correct' | 'unexpected' | null` — mismatch. Fixed by dropping the redundant inline annotation and letting TS infer from the `Detection` type.

---

## What's Next (ordered)

- [ ] **Confirm `25bae1d` deployed** — new bundle hash in pod + `sha-25bae1d` image
- [ ] **Test end-to-end pick flow on Samsung** — connect phone, scan items on order 2 (`DEMO-E92FD1-002`), confirm ConfirmOverlay appears after each correct scan, tap Confirm, verify `quantity_picked` increments, order reaches `complete`
- [ ] **Test ⟳ Restart Demo** — hit it on supervisor, confirm mobile shows new order immediately
- [ ] **Test scenario switching** — change to Physical Demo in supervisor, confirm overlay shows nav card instruction + 10s button fallback instead of amber Confirm button
- [ ] **Verify PackWizard auto-surfaces** after order completes (unverified in live flow — `MobilePickerView` listens for `order_complete_pending` WS event)
- [ ] **QR size test (deferred)** — see BACKLOG QOL-008

---

## Open Questions

- Does `PackWizard` actually auto-surface on mobile when an order completes? Plan says done; unverified in live flow.
- Runner broker reconnect: is it reliably picking up jobs after the 19:51 UTC drop? May need to restart runner service if it misses jobs again.

---

## Key Facts (never re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision-btt` |
| Active branch | `feature/bobs-tiny-treasures` |
| Last known-good web-ui image | `sha-26c882a` (`index-Z_9LpMAG.js` + `index-D3Mz4UNV.js`) |
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
