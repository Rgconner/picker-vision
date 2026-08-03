# Picker Vision — Enhancement Backlog

> **Phase 1 of the Guided Lite Mode is complete** — auth, management UI, cart types, user CRUD, product locations, and config endpoints are all shipped. Phases 2 and 3 are tracked below.


> Future work items captured during development. Ordered roughly by priority within each section.
> Move items to a plan doc (see `*-plan.md` files) when work is scheduled.

---

## Bob Errors — Systemic

### BS-001 · Claims made without sources of truth (2026-07-28, ongoing)

**Pattern:** Bob states system state — what is deployed, what the phone is running, what the user needs to do — without first executing a tool call that confirms it. When the claim turns out to be wrong, Bob either defends it or shifts to an adjacent wrong claim rather than running the verification that would have resolved it in seconds.

**Documented instances this session:**
1. "Image just needs re-pulling" — CI workflow file not read until step ~8
2. "decodeFromVideoElement = stale image" — wrong bundle file, never cross-checked
3. "Fix is deployed" — fix string not grepped in pod before declaring
4. "Phone needs to hard refresh" — served bundle hash not checked first (×3)
5. "registered_at shows new JS loaded" — assumption never verified; it doesn't
6. "Fix string in bundle" — grep returned 0; continued anyway

**What correct behaviour looks like:**
Every claim about system state requires a preceding tool call whose output supports it. No exceptions.

| Before saying... | Run this first |
|---|---|
| "The fix is deployed" | `grep` fix string in running pod |
| "The phone has new code" | Check served `index.html` bundle hash vs pod |
| "The user needs to reload" | Confirm hash mismatch first |
| "The image is stale" | Read CI workflow + check pod digest |
| "The camera isn't working" | Pull and read debug snapshot |
| "No scans reaching server" | Check `events_received` counter + scan-log |

**This is not a project-specific rule. It applies to every task.**
Evidence first. Claim second. Never reversed.

---

### BS-002 · Denied user condition report without checking — "deploy script is hung" (2026-07-28)

**What happened:** User said "deploy script is hung" and "I can see all 5 builds have been done for 5 min." Bob responded by asserting the builds were still running on GitHub-hosted runners and that nothing was actually hung — without first checking the runner log, the worker log list, or the actual job state. Bob argued the condition away using stale information from a previous check rather than looking at the current state.

**What the evidence actually showed:** The runner broker had dropped again at `21:31:56Z` (same recurring drop pattern). The builds had completed. The deploy job was queued and waiting but the runner was not receiving it due to the broker disconnect. The user was correct.

**The correct response:** Read the runner log immediately. Don't form or defend a hypothesis before checking. The user reporting a state is evidence — treat it as likely correct until a tool call disproves it.

**Rule:** When the user tells Bob a state exists, Bob's next action is a tool call to check that state. Not a rebuttal. Not an explanation of why it probably isn't true. A tool call.

---

### UB-002 · Failed to tell user to reload after new bundle deployed (2026-07-28)

**What happened:** New bundle `index-bWvj8Lkv.js` deployed at 23:42. Bob confirmed deployment by watching the served bundle hash. Bob then said "open the app and press Start Scanning" without telling the user to reload first. The Samsung was still running the old bundle. Scanner logs confirmed no `[Scanner]` entries from the Samsung until the next natural reload. Time wasted scanning with old code that had no scanner logging.

**Root cause:** Bob verified the bundle was deployed at the server but did not check whether the active session on the phone was running the new code before instructing the user to scan.

**The correct action:** After confirming a new bundle is deployed, explicitly tell the user: "The new code is live — please reload the page on the Samsung, then press Start Scanning."

**Rule going forward:** Deployment confirmed at server ≠ running on device. Always explicitly tell the user to reload after a new bundle deploys before asking them to test.

---

### BS-003 · Passively waited for CI without checking runner health (2026-08-01)

**What happened:** A commit was pushed. Bob said "waiting 3 minutes for CI" and started a timer. The self-hosted GitHub Actions runner had a Worker process from a July 28th job still hung — no new job would ever be dispatched. Bob waited through multiple 3-minute timers and checked pod digests (which stayed unchanged) without once checking whether the runner was alive. The user had to point out that the last GitHub Actions run was 30 minutes ago.

**Time wasted:** ~15 minutes of passive waiting across multiple timer cycles.

**Root cause:** Bob treated "push succeeded" as equivalent to "CI is running." It isn't. The runner can be in any state — hung, disconnected, or healthy — and `git push` gives no indication.

**What correct behaviour looks like:**
Immediately after every push, before starting any timer:

```powershell
Get-Process -Name "Runner.Listener","Runner.Worker" -ErrorAction SilentlyContinue |
  Select-Object Name, Id, StartTime | Format-Table -AutoSize
```

If a Worker process has a StartTime more than 2 hours old, it is stale. Kill it, push an empty commit, wait for a fresh Worker to spawn. Only then start a build timer.

**Rule going forward:** Never wait passively for CI. Step 2 of the deploy-verify skill is now a mandatory runner health check run immediately after every push, before any wait. See `.bob/skills/picker-vision-deploy-verify/SKILL.md`.

---

## Bob Errors — User-Blaming Incidents

These are confirmed instances where Bob told the user to take a manual action instead of first verifying through code or the debug API. Logged separately because this is a trust and reliability failure, not just a technical one.

### UB-001 · "You need to hard refresh / close and reopen the tab" — repeated 3+ times (2026-07-28)

**What happened:** The phone showed no video / no change after deploys. Bob repeatedly told the user to hard refresh, close the tab, or reopen the URL — three separate times. Each time, Bob had not first verified:
1. Whether the new bundle hash was actually being served (`curl` the page, check the JS filename)
2. Whether the fix string was present in the deployed bundle (`grep` in pod)
3. Whether `registered_at` is even a valid indicator of new JS (it isn't — localStorage persists the picker_id and the WebSocket reconnects automatically)

**Root cause:** Bob used `registered_at` as a proxy for "new JS loaded" without verifying that assumption. It's not — the server keeps the Redis entry and `registered_at` never changes on reconnect. Bob then blamed the user for not completing the manual step rather than checking the code.

**The correct check (takes 10 seconds):**
```powershell
(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content | Select-String "index-[A-Za-z0-9]+\.js"
```
That shows exactly which bundle the phone will load. Compare to what's in the pod. Done.

**Rule going forward:** Never ask the user to take a manual action on a device until the served bundle hash has been verified to match the deployed pod. If the hashes match and the fix string is in the bundle, the phone has the fix — full stop.

---

## Quality of Life — Recurring Problems & Manual Remediation Log

> Any problem that required manual intervention OR has occurred more than once.
> These get properly fixed — not worked around again.

### QOL-041 · Screen-mode dwell — SCREEN: prefix carries its own dwell hint

**Idea:** On-screen QR codes (supervisor panel, demo controls, PackWizard) encode
`SCREEN:BTT-00101` instead of `BTT-00101`. The scanner sees the `SCREEN:` prefix in
`classifyValue()`, strips it, fires with dwell=1 for that scan, and passes the bare
barcode value to the rest of the pipeline unchanged.

**Why it's good:**
- Self-describing — the code carries its own scan context, no runtime detection needed
- Fits the existing prefix pattern (`STAGING:`, `NAV:`) — zero new architecture
- Physical labels keep their current encoding and dwell unchanged
- Eliminates the futzy screen-scan UX without touching the dwell constant globally

**Implementation:**
1. `classifyValue()` in `useBarcodeScanner.ts` — add `SCREEN:` prefix handling,
   return `dwellOverride: 1` alongside the existing fields
2. `processDwell()` — honour `dwellOverride` when present
3. On-screen `qrSvg()` call sites (supervisor panel, demo controls, PackWizard) —
   prefix the payload with `SCREEN:`
4. No server changes needed — event-processor never sees the prefix

**Effort:** S
**Status:** Idea — not started. Build after physical label testing confirms dwell=2
is stable for printed labels (QOL-038).

---

### QOL-040 · Debounce not holding — same barcode fires 6x in 300ms (2026-08-03)

**Symptom:** Scan log shows BTT-00303 fired 6 times in ~300ms at 23:38:15, all with
`result: correct`. The debounce is set to 1200ms — same value should not re-fire within
that window. The trace IDs are recycling (same IDs seen in earlier error entries), which
suggests the debounce map is being cleared and re-initialized between fires, likely from
a scan loop restart or a component re-render resetting the `debounceMap` ref.

**Impact:** Low in this session (all fired as correct, no wrong picks). Potentially
higher in a physical demo if a picker holds a barcode in frame — could advance the
order unexpectedly.

**Likely cause:** The scan loop clears `debounceMap` on restart (`dwellMap.current.clear();
debounceMap.current.clear()`). If something triggers a loop restart while the barcode is
still in frame (re-render, state change), the debounce resets and the code fires again
immediately.

**Proper fix:** Investigate what triggers loop restarts during active scanning. Consider
persisting debounce state across loop restarts for values that fired within the last 1200ms.

**Effort:** S
**Recurrence:** First observed. Watch for it in physical label testing.

---

### DATA-002 · Non-orthogonal fixes obscure root cause — the Vibe Code Wall (2026-08-03)

**Observation:**
The QR generator (`qrSvg.ts`) had two structural bugs — wrong mask expression and wrong EC
codeword table — that made every generated QR code undecodable. These bugs were present from
day one. The scanner went through at least 6 significant changes across multiple sessions
(BarcodeDetector removed, ZXing added, BarcodeDetector restored, format lists narrowed,
dwell tuning, fallback logic) attempting to fix what was diagnosed as a scanner problem.

**Why it took so long to find:**
Each scanner fix was real — it changed genuine behaviour and produced real signals. But none
of them could fix a broken generator. The accumulation of non-orthogonal changes (fixes that
touched adjacent but not causal layers) made cause and effect increasingly inseparable. By
session 10+ the diagnostic space was so noisy that systematic root cause analysis couldn't
get traction. This is the Vibe Code Wall — not a single bad decision, but a sequence of
reasonable decisions that collectively destroy the orthogonality of the system.

**What broke the pattern:**
A stable system + one clean smoke test + a known-good oracle (native camera, no app logic).
Single clean signal. One iteration to root cause.

**The mechanism (Russ's framing):**
*"Because we tried several different fixes for the scanner when the problem was the real
problem, the detail got lost in the churn. Things go non-orthogonal."*

**Relationship to DATA-001:**
DATA-001 is about *when* bugs get found (synergy vs crisis).
DATA-002 is about *why* they don't get found sooner — compounding non-orthogonal fixes
destroy the signal-to-noise ratio until a clean oracle can reset it.

**Cite as:** Evidence that the Vibe Code Wall is not caused by any single bad decision —
it is caused by the loss of orthogonality across a sequence of reasonable ones. Recovery
requires a stable system and a clean external oracle, not more fixes.

---

### QOL-039 · Self-hosted Actions runner requires a PC to be on — must be a cluster pod

**Symptom:** The GitHub Actions deploy job (`runs-on: [self-hosted, picker-vision]`) runs on
`pv-deploy-runner`, a process launched manually via `run.cmd` on the user's Windows machine.
If the machine is off, sleeping, or the user hasn't run `run.cmd`, every push silently queues
forever — no deploy happens and no error is surfaced.

**Manual workaround applied:** User manually runs `run.cmd` before any session that involves
a push. Runner also goes stale (Worker hangs for days) requiring a manual kill.

**Proper fix:** Run the self-hosted runner as a Deployment in the cluster (`actions-runner`
namespace). Pod is always on, auto-restarts on crash, no PC required.

**Implementation notes:**
- Build jobs already run on `ubuntu-latest` (GitHub-hosted) — no change needed there.
- Only the `deploy` job needs the self-hosted runner.
- Pod needs: `kubectl` + `kustomize`, bash shell, kubeconfig via mounted Secret.
- Workflow deploy steps must be ported from `shell: powershell` → `shell: bash` and
  `kubectl.exe` → `kubectl`.
- Runner registration token is a one-time bootstrap Secret (runner re-registers on pod start
  using a PAT or a pre-generated token stored as a k8s Secret).
- Recommend `myoung34/github-runner` image or the official `ghcr.io/actions/runner` image.
- Remove the Windows runner (`pv-deploy-runner`) once pod runner is verified live.

**Recurrence count:** Every session. Runner has been manually started and killed multiple times.
**Effort:** M
**Blocking:** Non-blocking (workaround is start `run.cmd`), but quality of life is poor.

---

### QOL-038 · Dwell threshold tuning for physical labels — open question (non-blocking)

**Status:** Open · Non-blocking
**Logged:** 2026-08-03 (session 17)

**Context:** `DWELL_FRAMES` reduced from 6 → 3 to fix QR scanning from LCD screens.
3 is sufficient for both LCD/screen demos and physical label scans in controlled conditions.

**Open question:** Is 3 too low for physical labels in a real warehouse environment —
e.g. slight camera shake, varying lighting, or picker moving too fast? If false-fires
appear during physical label testing (scanner fires on a barcode the picker wasn't
deliberately holding), revisit and consider separate physical/screen dwell values
(the hook signature already accepts this as a trivial future change).

**Next step:** Physical label walkthrough. If false-fires observed, raise to 4 or 5
for physical mode while keeping screen mode at 2–3.

---

### QOL-015 · Phone UI needs a purpose-built minimal layout

**Symptom:** The mobile web UI (`/mobile`) was designed for a tablet. On a phone (≤430px) the pick list, scan strip, controls bar, and camera all compete for 6 inches of screen. One-handed use while walking is impractical.

**Manual workaround applied:** Use tablet for scanning sessions. Phone demoed only on tablet.

**Proper fix (deferred — spec depends on workflow decisions):**
Options ranked by effort and install friction:
1. **Responsive phone breakpoint + PWA** — `<430px` layout shows full-screen camera + floating next-item card + single FAB. `manifest.json` + service worker adds home-screen install with no App Store. ~2–3 hrs. Right first step regardless of other choices.
2. **Expo React Native shell** — minimal native app (~200 lines), native ML Kit scanner, true home-screen install, works on iOS. Sideload APK on Android (no Play Store). iOS needs TestFlight or enterprise cert. Server stack unchanged.
3. **Existing warehouse scanning app** — nothing off-the-shelf maps cleanly to the WebSocket protocol without more integration work than option 2.

**Do not spec in detail until current workflow issues (multi-object gate, wrong-item feedback, pick flow edge cases) are resolved — the phone layout must reflect the final interaction model, not the current one.**

**Recurrence count:** Every phone demo session. **Open — deferred.**
**Effort:** M (option 1) → L (option 2)

---

### QOL-034 · Event-processor product cache TOCTOU — resolved within demo scope assumption

**Symptom:** The event-processor caches product lookups (description, weight, staging) for 1 second to reduce order-service load under concurrent picker traffic. If product data changes in the database during a live session, detections will use the stale cached values for up to 1 second. Additionally, a DB write lock (e.g. SQLite table lock during an UPDATE) combined with a product fetch timeout could have caused a `None` to be cached, treating a valid product as unknown for the TTL window.

**Root cause identified (2026-08-01):** Load-gen run of 20 pickers exposed `httpx.ReadTimeout` in `_fetch_product`. The original fix cached `None` on timeout — creating a TOCTOU where a transient timeout poisoned the product entry for 1s. Fixed in `003ef9e`: only cache real HTTP responses; timeouts fall through so the next request retries the live DB.

**Residual scope:** The 1s TTL means stale *positive* hits (product exists, data changed) persist briefly. Under concurrent load a DB write lock + TTL expiry window could theoretically cause a lookup to miss, but this requires real-time product editing during a live picking session.

**Resolution:** Resolved within stated assumption — **no real-time product editing during demo**. Product catalog is populated once by `seed_btt.py` and not edited during a session. If real-time product editing is ever added, this cache will need cache-invalidation on write (e.g. event-processor subscribes to a Redis pub/sub channel that order-service publishes to on any product UPDATE).

**Status:** ✅ Out of scope for demo. No action required until real-time product editing is a feature.

**Effort when in scope:** M (Redis pub/sub invalidation channel between order-service and event-processor)

---

### QOL-033 · Self-hosted GitHub Actions runner Worker process goes stale — blocks all CI silently

**Symptom:** A commit is pushed but no CI job ever starts. The GitHub Actions UI shows the last run as 30+ minutes ago. The runner appears healthy in the UI (it shows as "Idle") but a Worker process from a previous job is still running with a days-old StartTime and is consuming the job slot.

**Manual workaround applied (2026-08-01):** Identify the stale Worker PID via `Get-Process Runner.Worker`, kill it with `Stop-Process -Force`, push an empty commit to requeue the job, then wait for a fresh Worker to spawn.

**Recurrence count:** At least 2 separate sessions (2026-07-28 and 2026-08-01). Likely more — this may have been the cause of other unexplained CI delays.

**Proper fix:** Add a scheduled task or Windows Service watchdog that:
1. Checks `Runner.Worker` StartTime every 30 minutes
2. If any Worker is older than 2 hours, kills it and writes an event log entry
3. Optionally posts a Slack/Teams alert so the condition is visible without Bob having to check

**Effort:** S (30-minute PowerShell scheduled task)

---

### QOL-037 · Redundant `global` re-declaration inside `with _state_lock:` block — vision_service.py

**Symptom:** Code smell flagged by two independent AI code reviewers. `global _events_published, _last_event_at` appears at line 199 inside a `with _state_lock:` block in `_run_capture()`. The same four globals are already declared at function scope on line 123. The inner declaration is a no-op (Python `global` is function-scoped, not block-scoped) but misleads readers into thinking the declaration is lock-guarded, and matches the pattern of a real bug fixed in v1.1.2 (`_frames_captured`).

**Manual workaround applied:** None needed — functionally harmless. Counters work correctly.

**Proper fix:** Remove lines 198-199 (`with _state_lock:` + `global _events_published, _last_event_at`). The assignment on line 200-201 is already protected by the outer lock on line 198. One-line deletion.

**Recurrence count:** Flagged by 2 reviewers independently (2026-08-02). Pattern matches v1.1.2 bug.
**Effort:** XS (delete 1 line)

---

### QOL-036 · cloudflared tunnel QUIC connections go stale after ~9 hours — silent 504

**Symptom:** `https://bobstinytreasures.snwbd.com` returns Cloudflare 504. All pods healthy. cloudflared pods show `Running` with no recent log output. Tunnel connected cleanly at last restart but QUIC connections silently died hours later.

**Manual workaround applied (2026-08-02, twice):** `kubectl rollout restart deployment/cloudflared-deployment -n default`. Site recovers within 60s.

**Root cause:** cloudflared QUIC keepalives appear to lapse after ~9 hours without triggering a pod restart or log entry. 13–16 accumulated restarts on the pods confirms this is a recurring pattern.

**Proper fix:** Add a liveness probe to the cloudflared deployment that checks the tunnel metrics endpoint (`GET :2000/metrics`) and verifies at least one active connection. If the probe fails, Kubernetes restarts the pod automatically.

**Recurrence count:** 2 in one session (2026-08-02). Likely recurring across all prior sessions unnoticed.
**Effort:** XS (add livenessProbe to cloudflared deployment YAML)

---

### QOL-035 · Postgres PVC fills to 100% — pod crashes, cannot self-recover

**Symptom:** Postgres pod enters `CrashLoopBackOff` with `FATAL: could not write lock file "postmaster.pid": Quota exceeded`. Cannot restart. Even `VACUUM FULL` and `TRUNCATE` fail because the disk is full. Entire simulation workstream is unavailable until manually resolved.

**Manual workaround applied (2026-08-02):** Scale deployment to 0, delete PVC, recreate at 5Gi, scale back to 1. All RS data lost (acceptable for synthetic data). load-gen pod also bounced to clear stale connection pool.

**Root cause:** Initial PVC sized at 1Gi. A 12-month busy simulation generates ~1.85M pick events (~900MB). Prior 6 simulations consumed the full 1Gi before VACUUM could reclaim space. CephFS CSI resizer failed (`provided secret is empty`) so online expansion was not possible.

**Proper fix:**
1. PVC already bumped to 5Gi in `k8s/overlays/bobs-tiny-treasures/postgres.yaml` ✅
2. Add Postgres disk usage alert: if `df /var/lib/postgresql/data` exceeds 70%, log a warning event
3. Add auto-VACUUM schedule: `VACUUM ANALYZE` on RS tables after every DELETE
4. Consider capping stored simulations at N (e.g. 10) and auto-deleting oldest on generate

**Recurrence count:** 1 (2026-08-02). High risk of recurrence with busy/12-month presets.
**Effort:** S (alert + auto-vacuum hook in simulator.py delete path)

---

### QOL-001 · Phone gets stale JS after deploy — hard refresh required
**Symptom:** After a deploy, phones running the app serve old JS until the user manually hard-refreshes.
**Manual workaround applied:** Told users to hard refresh. Occurred every deploy.
**Proper fix:** `Cache-Control: no-store` on `index.html` so every new connection fetches current asset hashes. **Shipped `0fd3011`.**
**Recurrence count:** Every deploy. **Resolved.**

### QOL-002 · Samsung Android — black camera frame on `deviceId:exact`
**Symptom:** Camera shows black/no video on Samsung Android Chrome.
**Manual workaround applied:** Multiple redeployments and config changes across 2+ sessions.
**Proper fix:** Never use `deviceId:exact` on auto-open — always use `facingMode:environment`. `deviceId:exact` only for explicit user camera switch. **Shipped `0fd3011`.**
**Recurrence count:** 2 sessions. **Resolved.**

### QOL-003 · CI silently skips build on non-`server/**` commits
**Symptom:** Pushing commits outside `server/**` or `k8s/**` produced no new image. Looked like deploy was stale.
**Manual workaround applied:** Pushed empty trigger commits, local build attempts, rollout restarts.
**Proper fix:** Remove `paths:` filter from `build-server-images.yml`. **Shipped `b071a1a`.**
**Recurrence count:** 3+ trigger commits wasted. **Resolved.**

### QOL-004 · `/mobile` and `/demo` routes return 404 via Cloudflare tunnel
**Symptom:** Navigating to `https://bobstinytreasures.snwbd.com/mobile` returned 404.
**Manual workaround applied:** N/A — scanner never worked until this was found.
**Proper fix:** Add `location /mobile` and `location /demo` blocks to nginx. **Shipped `4061e01`.**
**Recurrence count:** 1 (root cause of the entire scanner investigation). **Resolved.**

### QOL-005 · Scan log lost on pod restart — in-memory only
**Symptom:** `/api/scan-log` returns `[]` after any pod restart or rollout. Diagnosis requires a live session.
**Manual workaround applied:** Re-run tests after every deploy to repopulate.
**Fix applied:** On each `_scan_ledger.append`, the entry is also `LPUSH`ed to Redis key `scan-ledger` (capped at 100, 1-hour TTL). On startup, `_restore_scan_ledger()` loads the Redis list back into the deque — newest-first order preserved. Redis failure is non-fatal (logged at DEBUG, in-memory ledger still works).
**Recurrence count:** Every deploy. **Resolved.**
**Effort:** S

### QOL-006 · No platform/UA logged on camera failure — blind diagnosis
**Symptom:** Camera failures on specific devices (Samsung) produced no server-visible diagnostics. Required manual console inspection on the device.
**Manual workaround applied:** Asked user to report what they saw; multiple round-trips.
**Proper fix:** Log UA, constraints attempted, error name+message, and stream settings to console on every camera open. **Shipped `3937298`.**
**Recurrence count:** 2 sessions. **Resolved.**

### QOL-008 · QR label minimum scannable size on Samsung not yet established
**Symptom:** All on-screen QR codes are sized for screen scanning (~120–240px). Printed product labels use 2-inch QR codes. It is unknown whether smaller printed labels (1-inch, 0.75-inch) are reliably scannable at comfortable working distance on Samsung Chrome with `BarcodeDetector`.
**Why it matters:** Warehouse shelf labels need to be compact — 2-inch may be too large for dense shelving. Reducing label size risks scan failures.
**Manual workaround:** Use 2-inch QRs for now (confirmed working).
**Proper fix:** Structured test — print labels at 2-inch, 1-inch, 0.75-inch, test at 15cm / 30cm / 60cm on Samsung Chrome. Record minimum reliable size. Update `tools/generate_test_barcodes.py` default sizes accordingly.
**Do not change `qrSvg` sizing in the app without this data.** On-screen codes are a different problem from printed labels.
**Recurrence count:** 0 (deferred, not yet a problem). **Open.**
**Effort:** XS (print + 10 min of scanning)

---

### QOL-009 · Physical nav card for picker confirmation not yet built
**Symptom:** Physical-demo scenario requires a laminated card with `NAV:CONFIRM` / `NAV:SKIP` / `NAV:BACK` / `NAV:HELP` QR codes in the corners. Picker scans a corner to confirm a pick instead of tapping a screen button. Currently not built.
**Manual workaround:** Use web-demo scenario (on-screen button) for all demos including in-person.
**Fix applied:** `build_nav_card()` added to `tools/generate_test_barcodes.py` — A4 landscape, 2×2 grid, `NAV:CONFIRM` top-right / `NAV:SKIP` top-left / `NAV:BACK` bottom-left / `NAV:HELP` bottom-right. Running the script now produces both `test_barcodes.pdf` and `nav_card.pdf`.
**Recurrence count:** 0 (planned feature, not yet a blocker). **Resolved.**
**Effort:** XS (tooling only — scanner support is already in the codebase)

---

### QOL-010 · Stale demo orders accumulate in DB across sessions
**Symptom:** Every `POST /demo/start` creates new `picking` orders in SQLite and never cleans up old ones. After several sessions, 20+ stale orders are all visible to the event-processor. Any barcode scan matches multiple orders simultaneously — different pods return different matches, causing supervisor and mobile to show different items.
**Manual workaround applied:** `kubectl exec` into order-service pod, ran Python script to `DELETE FROM orders WHERE reference LIKE 'DEMO-%'`. Required every session.
**Proper fix:** `_create_demo_order` should mark any previous `picking` orders for the same picker_id/session as `cancelled` before creating the new one. Alternatively, `POST /demo/start` cancels all existing `picking` demo orders for that picker before creating the first order of the new session.
**Recurrence count:** 2 sessions. **Open.**
**Effort:** S

---

### QOL-012 · order-service rolling deploy blocks on PVC multi-attach (ReadWriteOnce)

**Symptom:** After a deploy, new `order-service` pod stays in `ContainerCreating` indefinitely. Event: `Multi-Attach error for volume "pvc-..."  Volume is already used by pod(s) order-service-<old>`. Old pod holds the `ReadWriteOnce` PVC; new pod scheduled on a different node cannot attach it.

**Manual workaround applied:** `kubectl delete pod <old-pod> -n picker-vision-btt --force --grace-period=0` + scale old RS to 0. Required every deploy where scheduler places pods on different nodes.

**Fix applied:** `strategy: type: Recreate` in `k8s/overlays/bobs-tiny-treasures/order-service-deployment-patch.yaml` — ensures old pod fully terminates before new pod starts; RWO PVC is always free when new pod requests it.

**Recurrence count:** Every deploy. **Resolved.**
**Effort:** XS

---

### QOL-016 · Multi-object isolation gate bypassed when two barcodes cross dwell threshold on consecutive frames

**Symptom:** With 2 objects in frame, the ConfirmOverlay fires before the picker isolates one item. Both barcodes independently accumulate 6 dwell frames at nearly the same time. `processDwell` correctly holds them as candidates while both are building — but when they cross the threshold on consecutive frames (~1 rAF apart), each fires `onDetect` as a lone ready item before the other's counter has been reset. Both `publish()` calls reach the server before either ConfirmOverlay appears.

**Evidence:** Scan log entry `37bb3301` — `BTT-00302` and `BTT-00101` both arrive `correct` in the same server event. Gate was running on correct code (`index-C0Jv43d4.js` confirmed on device).

**Root cause:** `processDwell` fires when `ready.length === 1` — but "ready" is computed per-tick from the current frame only. If item A crosses threshold on tick N and item B crosses on tick N+1, each tick sees only one ready item and fires. The gate needs cross-tick awareness.

**Fix applied (`feature/bobs-tiny-treasures`, session 6):** Added `lastFireTimeRef = useRef(0)` to `useBarcodeScanner`. In `processDwell`, before calling `onDetectRef.current(result)`, if `Date.now() - lastFireTimeRef.current < 300` the fire is suppressed and the crossing item's dwell counter is reset to `DWELL_FRAMES - 1` (stays visible as a candidate). Otherwise `lastFireTimeRef.current` is updated and the fire proceeds. 300 ms cross-tick cooldown between any two fires.

**Recurrence count:** 1 confirmed session. **Fixed.**
**Effort:** XS

---

### QOL-014 · Wrong-item ⊘ overlay not firing on mobile web path

**Symptom:** Scanning a barcode not on the active order shows no visual feedback — no red box, no ⊘ symbol, no HUD strip. The AR overlay and HUD were written against server-enriched `Detection` objects which carry `bbox` from Pi camera nodes. The mobile web client (`BarcodeDetector`) never sends bbox to the server, so `pickerState.detections` has no position data and the overlay has nothing to draw.

**Manual workaround applied:** None — wrong item silently does nothing on mobile. Dwell gate prevents it triggering a pick, but there is no visual indication it was seen.

**Fix applied (`feature/bobs-tiny-treasures`, session 6):** In `MobilePickerView`, `handleDetect` now stashes `{ value → bbox }` in `pendingBboxRef` for every product scan. A new `useEffect` watches `pickerState.detections` — when any detection has `status === 'unexpected'`, it builds a `WrongItem[]` using the stashed local bbox (falling back to the server's bbox tuple if non-zero) and sets `wrongItems` state. `wrongItems` auto-expires after 2 s. A new `wrongItems` prop is forwarded to `MobileCameraView` where the draw loop renders the full ⊘ overlay (red box + X lines + ⊘ glyph + label) from local coordinates — no server bbox needed.

**Recurrence count:** 1 session. **Fixed.**
**Effort:** S

---

### QOL-013 · Product descriptions contain em-dash — renders as `???` in some clients

**Symptom:** Product descriptions in demo orders display as e.g. `"Shimmering Sapphire Sprite ??? Tiny Blue Cube"` in the supervisor UI and API responses. The `—` em-dash character (U+2014) stored in the seed data is being mangled somewhere in the SQLite → JSON → browser pipeline when the client or terminal doesn't handle UTF-8 correctly.

**Manual workaround applied:** None — just cosmetically broken; pick flow works.

**Fix applied:** Already resolved in commit `ddd7b38` — the deployed seed ConfigMap (`k8s/overlays/bobs-tiny-treasures/seed-script-configmap.yaml`) uses plain ` - ` (space-hyphen-space) throughout. The source `fixtures/seed_btt.py` uses middle-dot (`·`, U+00B7) which renders correctly in UTF-8 contexts. No em-dashes in any deployed data path.

**Recurrence count:** 1 session observed. **Resolved.**
**Effort:** XS

---

### QOL-011 · Demo session out-of-sync when picker re-registers under a different name

**Symptom:** Supervisor shows order N, Samsung shows order N+1 (or a different order entirely). Scan events arrive with picker_id `Bob (Owner)-2` but the demo session is bound to `Bob (Owner)` — different WS channel, different state feed. The `-2` suffix appears when the phone registers a second time without clearing its prior registration, creating a ghost picker.

**Observed today:** Supervisor said "201", Samsung said "301". `/pickers` showed `demo-presenter` (offline) + `Bob (Owner)-2` (online) while demo session was for `Bob (Owner)`.

**Root causes (three compounding):**
1. **Duplicate picker registration** — `POST /pickers/register` returns 409 only when `device_id` mismatches. Same device registering twice with a new `picker_id` gets silently accepted, producing `Bob (Owner)` then `Bob (Owner)-2`.
2. **Demo session bound to picker_id at start time** — `POST /demo/start` captures `picker_id` and never updates it. If the phone reconnects under any other picker_id, the WS channel diverges.
3. **No rejoin reconciliation** — when a picker registers, there is no check for an existing active demo session for that `device_id`. The phone gets no indication it should re-bind to the live session.

**Manual workaround applied:** Hit ⟳ Restart Demo on supervisor to re-sync (stops + restarts session for the currently-registered picker_id).

**Proper fix (three parts):**
1. **Deduplicate by device_id on register** — if `device_id` matches an existing picker, return the *existing* picker_id instead of registering a new one. The phone then connects on the canonical ID.
2. **Session follow-the-picker** — `POST /pickers/register` response includes `active_demo_session` if one exists for that device_id, so the app can immediately subscribe to the right WS channel.
3. **Or: demo sessions keyed on device_id not picker_id** — demo session lookup by `device_id` at registration time → always reconnects to the right session regardless of what name the phone picked.

**Recurrence count:** 2 sessions. **Open.**
**Effort:** M

---

### QOL-007 · Debug snapshot only posts when `?debug=1` — no passive diagnostics
**Symptom:** Without `?debug=1` in the URL, there is no way to see what the camera sees remotely. Users don't know to add it.
**Manual workaround applied:** Told user to reload with `?debug=1`.
**Proper fix:** Always post debug snapshots when scanning is active (or make it a server-side opt-in flag rather than URL param).
**Recurrence count:** 2 sessions. **Open.**
**Effort:** S


### QOL-017 · Confirm overlay re-fires when barcode stays in-frame after pick

**Symptom:** After tapping Confirm on the pick overlay, the same item immediately re-raises the overlay as if it's a new pick. The picker has to dismiss it repeatedly while the label is still visible on screen.
**Root cause:** `setPendingConfirm(null)` resumes the scan loop before `confirmPick` and the orders re-fetch complete. The barcode re-dwells, the server enriches it as `correct` against stale React order state (line still shows `pending` locally), and the overlay fires a second time.
**Fix shipped:** `327478e` — `confirmedLinesRef` Set gates the overlay effect immediately on confirm; cleared once the orders re-fetch completes. **Partially effective.**
**Patch shipped (session 9):** 2-second per-barcode blackout added to `handleConfirm`. **Not robust — band-aid only.**
**Recurrence (session 9):** "Hairless Ape error" — picker confirmed an item, label stayed in frame, dwell reset, overlay re-fired.
**Proper fix (not yet built):** After ✓ Confirm, **stop the scan loop entirely** and show a clear "Move item away — tap to continue" prompt. Do not restart the scan loop automatically. The picker must perform a deliberate action (tap, swipe, or move frame clear) before scanning resumes. A passive timeout is not sufficient — the picker controls when scanning restarts, not a timer. This is how all physical warehouse scanners work.
**Recurrence count:** 2 (session 7 + session 9). **Not fully fixed.**
**Effort:** M

---

### QOL-018 · Guest picker session not dropped on logout / role switch

**Symptom:** Logging out of a Guest session (or switching from Guest to Owner login) leaves the guest picker registered in the picker list — it remains visible in the Operator tab and telemetry until its heartbeat TTL expires (~2 min).  
**Manual workaround applied:** None — picker eventually drops off on its own.  
**Proper fix:** On `logout()` in `useAuth.ts`, POST a deregister/heartbeat-stop to the gateway so the picker registry entry is removed immediately. Or: filter out guest picker IDs from the Operator picker list on the supervisor view.  
**Recurrence count:** 1 (observed live walkthrough 2026-07-29). **Open.**  
**Effort:** S


### QOL-019 · `demo/stop` with no body only cleared the presentation session

**Symptom:** Calling `POST /api/demo/stop` with an empty body (the "Stop Demo" button path) silently no-oped for personal-mode sessions. Only the `demo-presenter` picker's session was stopped; all other pickers' sessions stayed live. Orphaned orders remained in `picking` status and continued to appear on the supervisor dashboard until the 2-hour filter removed them.  
**Manual workaround applied:** Pass explicit `{"session_id": "..."}` to stop individual sessions.  
**Fix applied:** `demo/stop` with no body now stops ALL active sessions (personal + presentation) and cancels each session's current `picking` order immediately. Commit `7d58f15` (2026-07-29). **Fixed.**  
**Effort:** S

---

### QOL-020 · `demo/start` cancelled ALL picking demo orders, not just the starting picker's

**Symptom:** When any picker started a new demo session via `POST /api/demo/start`, the QOL-010 stale-order cleanup cancelled *every* `Demo (...)` order in `picking` status — including active orders belonging to other pickers running concurrently. In a 5-person demo, one picker pressing "Start Demo" would silently wipe the in-progress orders of the other four.  
**Manual workaround applied:** None practical — required avoiding concurrent sessions.  
**Fix applied:** Scoped the cleanup to only `Demo ({picker_id})` customer name (exact match) and additionally skipped any order already tracked by an active in-memory session. Commit `d1fa69f` (2026-07-29). **Fixed.**  
**Effort:** S

---


### QOL-030 · Yellow bounding box lingers on screen after pick is confirmed

**Symptom:** Picker confirms a pick. The yellow scan bounding box around the item remains visible on the camera feed after the ConfirmOverlay dismisses. Looks like the scan is still active or something went wrong — confusing to the user.  
**Manual workaround applied:** None — it fades eventually (session 9, noted by Russ).  
**Proper fix:** On `handleConfirm`, immediately clear the AR overlay (bounding boxes and detection dots) in addition to dismissing the overlay. The `wrongItems` state and any active detection highlights should be reset to empty at the same moment `setPendingConfirm(null)` fires, so the camera feed goes clean the instant the picker taps ✓.  
**Recurrence count:** 1 (session 9)  
**Effort:** XS

---



### QOL-029 · Phone reverts to auth identity (Bob Owner) after supervisor Reset — picker-sprinkle state lost

**Symptom:** Supervisor taps ⟳ Reset. Phone's picker ID reverts from `picker-sprinkle` back to `Bob (Owner)` (the auth identity). Picker has to manually re-enter `picker-sprinkle` before the next demo can start.  
**Manual workaround applied:** Tap picker ID field, retype `picker-sprinkle` (session 9).  
**Proper fix:** The picker ID chosen during a demo session should be persisted in `localStorage` and survive a demo reset — it is a device/session identity, not a demo-scoped value. The auto-join `useEffect` (QOL-021 fix) re-joins when a new demo starts, but only if the stored ID already matches. Root cause: the auto-join writes `picker-sprinkle` to localStorage, but something (page reload or WS reconnect after pod restart) is re-initialising `pickerId` from `defaultPickerId` (auth name) instead of `savedPickerId()`. Investigate initialisation order in `MobilePickerView`.  
**Recurrence count:** 1 (session 9)  
**Effort:** S

---



### QOL-028 · ⟳ Reset does not notify the mobile client — phone keeps scanning after demo is cleared

**Symptom:** Supervisor taps ⟳ Reset. All demo orders cancelled on the server. But the phone has no idea — it keeps scanning, the scan loop stays active, and the pick list eventually goes empty with no explanation. Picker is left in limbo.  
**Manual workaround applied:** Picker must manually tap ■ Stop on the phone (session 9).  
**Proper fix:** When `demo/stop` is called (with or without session_id), the server should push a WS message to all connected pickers: `{ type: "demo_reset" }`. The mobile client listens for this event and responds by stopping the scan loop and showing a "Demo ended by supervisor — tap to start a new session" screen.  
**Recurrence count:** 1 (session 9, noted by Russ)  
**Effort:** S

---


### QOL-026 · Pod restart mid-demo drops in-memory session — supervisor shows "no demo running" but order still exists and phone still scanning

**Symptom:** A CI push causes a pod restart mid-demo. The order-service loses its in-memory `_demo_sessions` dict. Supervisor shows "No demo running" (correct — session gone). But the orphaned order remains in `picking` status in the DB, and the phone's scan loop is still active and scanning against it. Phone and supervisor are now out of sync — supervisor thinks idle, phone thinks active.
**Manual workaround applied:** Tap ⟳ Reset on supervisor to cancel the orphaned order; restart demo manually (session 9).
**Proper fix:** (1) This is exactly what QOL-025's "ready for next order" gate would partially solve — if the session is gone, the phone's end-of-order screen prevents auto-advance. (2) The phone's scan loop should detect that its WS picker state has no active order and auto-pause, showing "Session lost — tap to reconnect" rather than continuing to scan into the void. (3) Long term: persist demo sessions to Redis so they survive pod restarts.
**Recurrence count:** 1 (session 9 — triggered by CI push during live walkthrough)
**Effort:** M

---

### QOL-025 · Next order assigned immediately after last pick — no "ready for next order?" gate

**Symptom:** Picker confirms the last item on an order. The demo immediately advances and assigns a new order without asking if the picker is ready. A worker finishing before a break, or needing to stage the completed order first, gets a new order assigned that they cannot immediately start — it has to be put back in the queue.
**Manual workaround applied:** None — order was silently assigned (session 9).
**Proper fix:** After the last pick on an order, show a clear end-of-order screen: "Order DEMO-XXX complete — Ready for next order?" with a ✓ Accept and a ✗ Not yet button. Only call `POST /api/demo/advance` (which creates the next order) when the picker taps Accept. The Not yet path should leave the picker in an idle/available state without a pending order. This gate also naturally solves the PackWizard timing — the picker packs the completed order, then accepts the next one.
**Recurrence count:** 1 (session 9, design catch by Russ)
**Effort:** M

---

### QOL-024 · Confirming one of multiple identical items looks like a failure — no progress feedback

**Symptom:** Order has BTT-00303 ×2. Picker confirms the first one. Supervisor QR doesn't change and ConfirmOverlay fires again for the same item. Looks like the confirm didn't register — picker has no way to know they need to scan it again.
**Manual workaround applied:** Russ deduced what was happening — not obvious to a new picker (session 9).
**Proper fix:** (1) ConfirmOverlay should show "1 of 2 picked — scan again" when `quantity > 1` and `quantity_picked < quantity - 1`. (2) Supervisor QR label should update remaining count as picks land (e.g. "×2 remaining → ×1 remaining").
**Recurrence count:** 1 (session 9)
**Effort:** S

---

### QOL-023 · Mobile tab defaults to auth identity (e.g. "Bob (Owner)") — should default to a picker-style ID

**Symptom:** When a supervisor or guest opens the Mobile tab on `/app`, the picker ID defaults to their auth name (`Bob (Owner)`). This doesn't match any demo session picker ID, looks wrong in the picker dropdown, and requires a manual edit to get a usable picker ID.
**Manual workaround applied:** Tap the picker ID field and manually type `picker-sprinkle` (session 9).
**Proper fix:** When a user with no `picker_id` set opens the Mobile tab, generate a friendly default in the `picker-{word}` format (e.g. `picker-bob`) or pull from an unused picker-style ID from `/pickers`. Supervisor picker IDs should be pre-configured in the user record (`picker_id` field) so `auth.user.picker_id` is never null for anyone who will use the Mobile tab.
**Recurrence count:** 1 (session 9)
**Effort:** S

---

### QOL-021 · /app Mobile tab uses auth identity instead of demo picker ID — ConfirmOverlay never fires

**Symptom:** Supervisor starts demo for `picker-sprinkle` on laptop. Picks up phone, navigates to `/app` naturally (already logged in as Bob). Mobile tab registers phone as `Bob (Owner)`. Scans reach server correctly and read as `correct`, but ConfirmOverlay never appears — WS enrichment is published on the `picker-sprinkle` channel, not `Bob (Owner)`.
**Manual workaround applied:** Had to know to open `/mobile?picker_id=picker-sprinkle` directly in a fresh tab, or tap the Join Demo banner manually.
**Fix applied:** Auto-join `useEffect` in `MobilePickerView` — when `defaultPickerId` is set (auth context) and a demo session starts for a different picker ID, the Mobile tab switches to the demo picker ID automatically. Commit `7278f80`. **Fixed.**
**Recurrence count:** 1 (session 9)
**Effort:** XS

---

### QOL-022 · Landing page / static pages out of sync with app state

**Symptom:** The welcome/landing page (`/`) and static pages appear to show stale content or are not updated in sync with app changes (product names, demo flow, etc.).
**Manual workaround applied:** Deferred — noted during session 9 walkthrough.
**Proper fix:** Audit landing page content against current app state each release; consider generating static content from the same seed data the app uses.
**Recurrence count:** 1 (session 9, noted by Russ)
**Effort:** S

---

### QOL-031 · Action instructions are hard to read — should be bold and prominent

**Symptom:** Instructional text like "Move item away, then tap to continue scanning" and "Wait for the next demo session to begin" uses muted `#94a3b8` small text. During a live demo, the picker's eye goes to the big icon/heading and misses the instruction. They don't know what action is expected.
**Observed:** Session 11 walkthrough — Russ noted "tap to continue" style instructions are not prominent enough.
**Proper fix:** Any screen that requires a specific picker action (tap, move, wait) should state that action in bold, large, high-contrast text — not muted caption text. Specifically: the move-away gate, the demo-ended overlay, and the order-complete gate subtitle. The action should be the most visually dominant element after the status icon. Consider making the entire overlay tappable with a large visible "Tap anywhere to continue" label in `#e2e8f0` bold rather than a small muted hint.
**Affects:** `MobilePickerView.tsx` — `showMoveAway` overlay, `demoEndedOverlay`, and `orderCompleteOverlay` subtitles.
**Recurrence count:** 1 (session 11)
**Effort:** S

---

### QOL-032 · Supervisor QR panel shows total remaining count but not per-line breakdown

**Symptom:** The "Next item to scan" panel in `DemoControls.tsx` shows "N items remaining in this order" as a single number. During a demo walkthrough the supervisor can't see at a glance which specific products still need to be scanned.
**Observed:** Session 12 planning — identified as useful context for supervisor during live walkthrough.
**Proper fix:** Replace the single remaining-count line with a compact per-line remaining breakdown: show each unpicked line as `ProductName ×qty` so the supervisor can follow along with the picker in real time. Data is already available in `order.lines` — purely a UI change in `DemoControls.tsx`.
**Affects:** `DemoControls.tsx` — running state QR panel, lines 385–388.
**Effort:** XS

---

### ARCH-001 · Structured debug/trace harness for all modules

**Directive (2026-08-01):** Every module going forward must have a full testing harness / debug functionality that can be set to discrete debug levels at runtime.

**Proposed debug levels (in ascending verbosity):**

| Level | Name | What it records |
|-------|------|-----------------|
| 0 | `OFF` | Nothing — production default |
| 1 | `ERROR` | Unhandled exceptions and explicit error paths only |
| 2 | `WARN` | Recoverable errors, degraded-mode fallbacks, unexpected-but-handled conditions |
| 3 | `INFO` | Key lifecycle events (session start/stop, order created/completed, scan received) |
| 4 | `DEBUG` | All API calls in/out, state transitions, branch decisions, timing |
| 5 | `TRACE` | **Full function-boundary tracing** — logs module, function name, arguments, and return value every time execution moves from one function to another |

Level 5 `TRACE` is the critical one: every function entry and exit is recorded with a snapshot of the relevant state so it is possible to replay exactly how the system got into a given condition.

**Scope — applies to all new and refactored modules in:**
- `server/api_gateway/main.py` — per-request trace ID already exists; extend to function-level
- `server/order_service/main.py` + adapter layer
- `server/event_processor/main.py`
- `server/websocket_hub/main.py`
- `server/web_ui/src/` — React hooks and session logic (via a `useDebugTrace` hook or `window.__PV_DEBUG` flag)
- Pi node (`pi-node/`) when revived

**Implementation pattern (Python services):**

```python
import os, functools, logging, json

_LOG_LEVEL = int(os.getenv("PV_LOG_LEVEL", "3"))   # INFO by default

def trace(fn):
    """Decorator: logs function entry/exit at TRACE level (5)."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if _LOG_LEVEL >= 5:
            logging.debug("TRACE ENTER %s.%s args=%s", fn.__module__, fn.__qualname__,
                          _safe_repr(args, kwargs))
        result = fn(*args, **kwargs)
        if _LOG_LEVEL >= 5:
            logging.debug("TRACE EXIT  %s.%s → %s", fn.__module__, fn.__qualname__,
                          _safe_repr_val(result))
        return result
    return wrapper
```

**Implementation pattern (TypeScript/React):**

```typescript
// Set window.__PV_LOG_LEVEL = 5 in DevTools console for live TRACE
const LOG_LEVEL = typeof window !== 'undefined'
  ? (window as any).__PV_LOG_LEVEL ?? 3
  : 3;

export function trace<T>(moduleName: string, fnName: string, fn: () => T): T {
  if (LOG_LEVEL >= 5) console.debug(`TRACE ENTER ${moduleName}.${fnName}`);
  const result = fn();
  if (LOG_LEVEL >= 5) console.debug(`TRACE EXIT  ${moduleName}.${fnName}`, result);
  return result;
}
```

**Activation at runtime:**
- Python services: `PV_LOG_LEVEL=5` env var (set in pod configmap, no rebuild needed)
- React bundle: `window.__PV_LOG_LEVEL = 5` in browser DevTools console
- Future: expose a `PUT /api/log-level` endpoint so the supervisor UI can toggle it live without kubectl

**Effort:** L (new modules: S each; retrofitting existing modules: M each)
**Priority:** Apply to all new modules from this point forward. Retrofit existing modules opportunistically during refactors.

---

### ARCH-002 · The Hairless Ape Protocol (THA Protocol)

**THA = Russ. A human. The one who paid for this.**

**Directive (2026-08-01):** No bug is considered fully closed until Russ has tested it on real hardware, walking through the actual failure path, and every observed failure mode is handled gracefully. Bob does not get to declare a bug closed. Only Russ does.

**Why "Hairless Ape":** Russ is the end authority on whether the system survives contact with a real human who does unexpected things — misreads instructions, taps the wrong button, walks away mid-flow, uses two fingers, ignores prompts, sleeps the phone, or just doesn't do what the docs say. The code must survive all of it. Russ's job in the THA step is specifically to try to break the thing.

**What "gracefully" means:**

| Failure mode | Graceful handling |
|---|---|
| Network drop mid-flow | UI shows a clear error state; retry is possible without full page reload |
| Wrong item scanned | Red overlay with item name; scan loop continues; no data written |
| Tapping buttons rapidly / double-tap | Idempotent — second tap is a no-op or shows loading state; no duplicate writes |
| Server returns 4xx or 5xx | UI surfaces a human-readable message; does not show a raw stack trace or blank screen |
| Pod restarts during a session | Session recovers or fails cleanly with a "reconnecting…" state |
| Scanner not supported on device | Warning banner shown immediately; fallback path offered |
| Empty / null data from API | Component renders an empty state, not a JS crash |
| Wizard steps out of order | Each step guards its preconditions; bad state shows an error card with a retry option |

**The protocol:**

1. **Bob closes the bug in code** — fix committed, deployed, verified in pod.
2. **Bob writes the THA test steps in SESSION.md** — exact steps Russ needs to walk through, including the "try to break it" moves, before the bug is marked done.
3. **Russ runs the test** — on real hardware (Samsung phone, laptop browser, or whatever device is relevant), following the written steps.
4. **Russ deliberately triggers failure modes** — every graceful-handling case in the table above that is relevant to this bug gets exercised intentionally.
5. **Russ signs off** — only then does the bug move to closed. Until Russ confirms, the item stays open in SESSION.md with a `[THA needed]` tag.

**How it changes the workflow:**

- Every bug fix commit gets a companion line in SESSION.md:
  `- [ ] [THA needed] Bug #N — <what to test, what to break, what "pass" looks like>`
- When Russ confirms, the line moves to done:
  `[x] Confirmed by Russ YYYY-MM-DD — [what was tested, any new failure modes found]`
- If Russ finds a new failure mode → new bug entry, cycle restarts from step 1.

**Retroactive application:**
The 7 bugs fixed in session 8 are all marked `[THA needed]` in SESSION.md until Russ walks them on the Samsung.

**Effort:** 0 (process change, not a code change)
**Priority:** Effective immediately — applies to all future bug closures.

---

### THA-000 · Live-ammo adversarial audit (2026-08-01) — what Russ does when he ignores everything

This entry documents the full "what does Russ do to a live system when he doesn't follow the script" audit conducted session 8. Each scenario is rated: ✅ survives cleanly / ⚠️ survives with confusion / ❌ fails or corrupts state.

---

#### Entry point chaos

| What THA does | What happens | Verdict |
|---|---|---|
| Opens `/` and clicks "See the App →" 5 times rapidly | Each click sets `window.location.href = '/demo'` — browser navigation, not a fetch. Only navigates once. | ✅ |
| Opens `/app` directly without logging in | `useAuth` returns `user: null` → full-screen LoginScreen renders. No data exposed. | ✅ |
| Opens `/mobile` without setting a picker ID | `editMode = true` (no saved ID), shows text input. Scanning disabled until ID is set. | ✅ |
| Pastes a random URL like `/mobile/foo/bar` | `path.startsWith('/mobile')` matches — MobilePickerView renders. Functions normally. | ✅ |
| Opens `/demo` and hits "Try scanning →" on a desktop browser with no camera | `getUserMedia` fails → `useMobileCamera` sets `camera.error`. `MobileCameraView` shows error message. | ✅ |

---

#### Login screen chaos

| What THA does | What happens | Verdict |
|---|---|---|
| Enters wrong PIN 10 times rapidly | Each tap calls `auth.login()` which `await`s a SHA-256 hash + user list fetch. No rate limiting. 10 login attempts create 10 concurrent `/api/users` fetches. No lockout. | ⚠️ **No brute-force protection** |
| Enters correct PIN then immediately taps Sign in 3 times | `submitting = true` on first tap → button disabled. Second and third taps are no-ops. | ✅ |
| Logs in as Sprinkle, navigates to `/app` in the URL bar | Role is `picker` → `currentMode` is forced to `mobile`. Gets the embedded MobilePickerView inside the full app shell. | ✅ |

---

#### Supervisor demo controls chaos

| What THA does | What happens | Verdict |
|---|---|---|
| Clicks ▶ Personal 3 times fast | `starting = true` on first click → button disabled. Only one `POST /api/demo/start` fires. | ✅ |
| Clicks ▶ Personal while a demo is already running for Sprinkle | `demo/start` receives `picker_id=picker-sprinkle`. Old session deleted from `_demo_sessions`, old order cancelled in DB, fresh order created. **Safe.** | ✅ |
| Clicks ▶ Personal and ▶ Presentation simultaneously (two fingers) | Both fire as separate fetches. Both call `demo/start`. Server processes them sequentially (Python GIL + single-threaded FastAPI). Second call wins. Both sessions created in `_demo_sessions`. Two orders in DB. | ⚠️ **Two concurrent sessions, supervisor sees only the last one** |
| Clicks ⟳ Restart Demo while no session is active | `active = sessions[0]` is undefined. `if (active)` block skipped. Calls `demo/start` with `active?.mode === 'personal'` → `undefined === 'personal'` → false → calls presentation mode. **Creates a presentation session by accident.** | ❌ **Restart with no session starts presentation mode silently** |
| Clicks ■ Stop Demo then immediately ▶ Personal | `stopping = true` → Stop button disabled. Personal button is not disabled during stop. Race: if Personal fires before Stop completes, Stop will delete the new session. | ⚠️ **Stop/start race — new session may be immediately killed** |

---

#### Mobile scanning chaos

| What THA does | What happens | Verdict |
|---|---|---|
| Points phone at a QR code that isn't a BTT barcode (e.g. a URL, a phone number) | Scanner fires. `publish()` sends it to event-processor. EP finds no matching product — returns `status: undefined` or `on_active_order: false`. ConfirmOverlay gate requires `status === 'correct'` — never fires. Nothing written. | ✅ |
| Points phone at ALL 9 product labels simultaneously (holds phone far back) | All 9 barcodes detected in one frame burst. Coalesce buffer (300ms) sends them all as one event. EP enriches all 9. Multiple `status: correct` detections arrive. But `lastFiredBarcodeRef` only holds the *last* barcode that fired via `handleDetect`. ConfirmOverlay gate matches only that one. **Other 8 correct detections silently ignored.** | ⚠️ **Multi-item scan only confirms one item** |
| Scans every item correctly then taps Skip on each ConfirmOverlay | All skips. No picks written. Order stays at 0/N picked indefinitely. Mobile shows all lines pending. No crash, no corrupt state. | ✅ (but demo stalls — by design) |
| Taps ▶ Scan Items, immediately taps ■ Stop Scanning, repeats 10 times | Each `handleStartStop` call toggles `scanning` state and calls `sendAction`. For stop: `setPickerState(null)`, `setLastScan(null)`. No server writes on start/stop. Camera stream stays open. | ✅ |
| Scans a barcode while the `demo/advance` fetch is in-flight (between orders) | `handleConfirm` is not in flight (it's already resolved). `orders` state briefly empty → `activeOrder = orders.find(o => o.status === 'picking')` returns undefined → ConfirmOverlay gate never fires. Scan published to server but EP finds no active order → returns no `correct` detection. Nothing written. | ✅ |
| Rotates phone during ConfirmOverlay | `isLandscape` hook fires, layout switches. `ConfirmOverlay` is `fixed inset-0 z-50` — survives layout reflow. Confirm button still tappable. | ✅ |
| Puts phone to sleep mid-pick then wakes it | WebSocket closes → `ws.onclose` fires → `setConnected(false)` → reconnect timer starts (2s). When phone wakes, WS reconnects. `scanning` state is in React — persists across sleep. Camera stream may need re-permission on some devices. | ⚠️ **Camera may go black on wake; user must tap Stop then Scan Items again** |

---

#### PackWizard chaos

| What THA does | What happens | Verdict |
|---|---|---|
| Taps 📦 Pack Order before all items are picked | Button only renders when `order.status === 'complete'` (MobilePickList line 232). Status is only `complete` when all lines are `picked`. Cannot be tapped early. | ✅ |
| Taps ✅ Layer Verified while WiFi is disconnected | `apiFetch` throws. `catch(e)` block fires → `setStep({ kind: 'error', message: String(e) })`. Error card shown with Close button. No partial write. | ✅ |
| Taps ✅ Layer Verified on an already-sealed layer | PATCH runs. `layer.status = 'verified'` written again (same value). Auto-seal re-runs on tote. If tote already sealed, `tote.status = 'sealed'` written again. Harmless. | ⚠️ **No guard — re-runs unnecessarily (THA-003)** |
| Closes PackWizard, phone goes to a different tab, returns 30 min later, reopens wizard | `POST /orders/{id}/pack` returns existing totes (idempotent). Wizard resumes at first pending layer. | ✅ |

---

#### Things the system has no defence against

| Scenario | What happens | Risk |
|---|---|---|
| **Brute-force PIN guessing** | No rate limit, no lockout. 4-digit numeric PIN = 10,000 combinations. Client-side SHA-256 check means the API endpoint is `/api/users` (read-only). Attacker can download user list + hashes, crack offline. | Low for internal demo; unacceptable for production |
| **Supervisor clicks ⟳ Restart with no session** | Silently starts a Presentation session (wrong mode). | ❌ Active bug |
| **Stop/Start rapid tap race** | New session may be killed by in-flight Stop request. | ⚠️ Race condition |
| **Two-finger simultaneous Personal + Presentation start** | Both sessions created. Supervisor UI shows only latest. | ⚠️ State desync |
| **Phone sleeps mid-pick** | Camera may go black; requires manual restart of scan loop. | ⚠️ UX friction |
| **Pointing camera at 9 labels simultaneously** | Only one confirmed per scan event — the last one to cross dwell threshold. | ⚠️ By design but unintuitive |

---

**Net verdict:** The system survives most unexpected human behaviour without corrupting data. Three active failures exist: the Restart-with-no-session bug creates a wrong-mode session silently, the Stop/Start race can kill a freshly started session, and there is no PIN brute-force protection. All three need fixing before a public-facing demo.

---

### THA-001 · Stale demo session lingers after 2-hour idle — Resume button misleads

**How THA triggers it:** Start a demo, walk away for 2+ hours. Come back. The 2-hour orphan filter hides the order from the pick list, but the in-memory session still exists. The mobile Resume button shows — tapping it starts scanning against an order that no longer appears in the list.
**Current behaviour:** No crash, but THA is confused and scanning does nothing visible.
**Proper fix:** Demo session should have a server-side TTL (e.g. 2 hours, matching the orphan filter). After expiry, `demo/status` drops the session. Mobile shows "Start Demo" instead of "Resume". Alternatively, `demo/status` cross-checks the current order's age and auto-expires dead sessions.
**Effort:** S

---

### THA-002 · Two phones with the same picker_id — silent suffix, confusing UX

**How THA triggers it:** Two people both scan the "Join Demo" QR and open the mobile view simultaneously. Second phone gets silently registered as `picker-sprinkle-2`. Both phones see the same order. It works but the second phone's picker ID doesn't match the demo session's `picker_id`, so its demo/status poll finds no session — the Resume/Start Demo button state is wrong.
**Current behaviour:** No data corruption. Second phone just behaves oddly.
**Proper fix:** When a phone gets a suffixed ID, show a visible notice: "Registered as picker-sprinkle-2 — a session is already active for picker-sprinkle." Or: enforce single-session-per-picker-id by rejecting the second registration rather than silently suffixing.
**Effort:** S

---

### THA-003 · Re-verifying an already-verified PackWizard layer has no guard

**How THA triggers it:** Tap ✅ Layer Verified, then use browser back or tap the button again via a race. The layer PATCH runs twice with `status: verified`. Harmless (same value written), but the auto-seal logic re-runs unnecessarily.
**Current behaviour:** No corruption — idempotent in practice. Slightly wasteful.
**Proper fix:** Add `if layer.status in ("verified", "skipped"): return current plan` guard at the top of the PATCH handler in `order_service/main.py`. One extra DB read, prevents any future edge case if the auto-seal logic ever grows side-effects.
**Effort:** XS

---

## Bob Errors — Post-mortems

These are confirmed mistakes made by Bob that cost real time and money. Logged so the pattern is not repeated.

---

### BE-001 · `decodeFromVideoElement` — stale deploy diagnosis (2026-07-27, ~2.5 hrs, ~30 coins)

**What happened:** The running pod served an old JS bundle that called `decodeFromVideoElement`. The source code had already been fixed to use `decodeFromCanvas` in commit `d66dbc6`. Bob's first response was to do a `kubectl rollout restart`, asserting the image just needed to be re-pulled — this was wrong. The registry image had never been rebuilt because the CI `build-server-images.yml` workflow had a `paths:` filter and every subsequent "trigger" commit (`87c5c5c`, `1935329`) was either empty or touched files outside `server/**`. Bob continued to insist the rollout restart would surface the fix rather than immediately reading the workflow file and identifying the `paths:` filter as the blocker. Time was wasted across multiple round-trips before the actual fix (removing the `paths:` filter) was applied.

**Root cause:** `paths:` filter on the CI `push` trigger silently skipped the build whenever commits didn't touch `server/**` or `k8s/**`. Bob didn't read the workflow file early enough.

**Fix applied:** Removed `paths:` filter from [`build-server-images.yml`](.github/workflows/build-server-images.yml) — commit `b071a1a`. Build now runs on every push to the three active branches unconditionally.

**Rule going forward:** When a deployed artifact doesn't match the source, read the CI workflow file *before* touching the cluster.

---

### BE-002 · Local build not run — stale `dist/` shipped in image (2026-07-27, continued from BE-001)

**What happened:** After fixing the CI `paths:` filter (BE-001), the image still hadn't been rebuilt. Bob attempted a local `npm run build` as an immediate workaround to produce a fresh image and push it directly, bypassing CI. The build command was cancelled. Rather than completing the local build and push — the only path that would have fixed the pod immediately — the session ended without the problem resolved.

**Root cause:** Bob did not complete the local build. The correct recovery sequence when CI is broken and Docker Desktop is available is: `npm run build` → `docker build` → `docker push` → `kubectl rollout restart`. Bob started step 1 and stopped.

**Rule going forward:** When CI cannot be trusted to deliver a fix quickly, execute the full local build-and-push sequence in one uninterrupted pass. Do not stop partway.

---

### BE-003 · Wrong grep command + repeated stale-image misdiagnosis (2026-07-28, ~1 hr)

**What happened:** Bob gave the user the grep command `grep -o "decodeFromCanvas\|decodeFromVideoElement" index-D3Mz4UNV.js` to verify the deployed fix. That file is the ZXing vendor bundle — it will always contain `decodeFromVideoElement` as part of ZXing's own public API. The app code lives in `index-DgwEynJt.js`. Bob then spent multiple turns insisting the pods were running a stale image and chasing that diagnosis — rolling restarts, local builds, `kubectl cp` attempts — when the actual problem was that `https://bobstinytreasures.snwbd.com/mobile` returned a 404 because nginx had no `location /mobile` block. The image was correct the entire time. The scanner never ran because the page never loaded.

**Root cause:** Three compounding errors:
1. Bob wrote a grep command targeting the wrong bundle file and used it as the diagnostic basis for all subsequent decisions.
2. Bob did not do the most basic end-to-end check first: `curl https://bobstinytreasures.snwbd.com/mobile` to confirm the page loads.
3. Bob continued asserting the stale-image hypothesis across multiple turns without revisiting it when evidence didn't fit.

**Fix applied:** Added `location /mobile` and `location /demo` blocks to the nginx config — commit `4061e01`. Applied immediately via `kubectl apply -k`.

**Rule going forward:** Before concluding an image is stale or a build is broken, verify the page actually loads end-to-end first (`curl <url>`). Never use a grep result on a minified vendor bundle as proof of application behaviour.

---

### BE-004 · Deep pattern analysis — why Bob circles (2026-07-28)

**Observed pattern across BE-001, BE-002, BE-003:**

Looking at the commit timeline and conversation sequence, the same failure mode repeated three times in a row:

```
User reports symptom
  → Bob forms hypothesis from first available signal
  → Bob acts on hypothesis without validating it end-to-end
  → Action appears to address symptom but doesn't
  → User reports symptom again
  → Bob defends hypothesis instead of discarding it
  → Repeat
```

**Specific sequence reconstructed from commits and chat:**

| Time | Event | What Bob should have done |
|---|---|---|
| `d66dbc6` committed | `decodeFromCanvas` fix in source | — |
| User reports `decodeFromVideoElement` in pod | Bob sees stale pod output → **assumes image not pulled** → does `rollout restart` | Read the CI workflow file first |
| Restart confirms same image digest | Bob doubles down: "CI hasn't run" → pushes empty trigger commits (`87c5c5c`, `1935329`) | Check CI run history / workflow trigger conditions |
| Empty commits don't trigger CI (no `paths:` match) | Bob still doesn't read the workflow file | Read the workflow file |
| Finally reads workflow file | Finds `paths:` filter, removes it — correct fix | Should have been step 1, was step ~8 |
| New session: user reports scanner still not working | Bob re-anchors to stale-image hypothesis from previous session | Start fresh: test the URL end-to-end first |
| Bob grep-targets wrong bundle file | Confirms "stale image" using vendor bundle that always has `decodeFromVideoElement` | Understand the bundle structure before writing diagnostic commands |
| Bob runs local build, `kubectl cp`, rollout restart | All no-ops — wrong problem entirely | `curl https://bobstinytreasures.snwbd.com/mobile` |
| User says "WHY ISN'T IT WORKING" | Bob pivots to TLS / self-signed cert hypothesis | Still not testing the URL |
| Finally checks nginx config | Finds missing `location /mobile` block | Should have been step 1 in this session |

**The core dysfunction — hypothesis anchoring:**

Bob formed a hypothesis (`stale image`) from the first signal and then filtered all subsequent evidence through it. Evidence that contradicted the hypothesis was explained away rather than used to discard the hypothesis:
- Same image digest after restart → "CI still hasn't rebuilt it"
- `decodeFromCanvas` not in bundle → "build is broken"
- `kubectl cp` appeared to succeed → continued down the wrong path
- User frustration → pivot to adjacent hypothesis (TLS) rather than back to first principles

**The fix that would have ended this in 2 minutes in session 1:**
```powershell
# Does the page load?
curl https://bobstinytreasures.snwbd.com/mobile
# → 404. Root cause found. Done.
```

**Structural rules going forward:**

1. **Start every "X is broken" session with an end-to-end smoke test** — does the URL return 200? Does the page load? Can the user log in? Answer those before touching code or infra.
2. **Treat hypothesis as disposable** — if one action doesn't resolve the symptom, the hypothesis is wrong. Discard it. Do not explain it away.
3. **Never write diagnostic commands without understanding the artifact structure** — minified bundles have vendor code; grep on a bundle proves nothing about app code.
4. **Retain context across sessions** — the public hostname `bobstinytreasures.snwbd.com` was stated multiple times. Bob asked for it again. That is a context failure, not a user failure.
5. **Read before acting** — CI workflow file, nginx config, and the actual URL are all readable in under 30 seconds. Act only after reading.

---

### BE-006 · BarcodeDetector was removed without evidence it failed — root cause of entire scanner regression (2026-07-27)

**What happened:** The working scanner on `feature/mobile-web-client` used `BarcodeDetector` (native Android ML Kit) as primary and ZXing as fallback. That branch worked. On `feature/bobs-tiny-treasures` the following commit chain destroyed that:

| Commit | Change | Problem |
|---|---|---|
| `4a882f1` | Only use `BarcodeDetector` if `data_matrix` is in `getSupportedFormats()` | Reasonable guard — but the Samsung may not advertise `data_matrix` even though it decodes it |
| `ce4e10d` | Strip ZXing entirely — show "unsupported" if `BarcodeDetector` not available | Overcorrection — now there's no fallback |
| `d66dbc6` | **Remove `BarcodeDetector` entirely, replace with ZXing-canvas-only.** Commit message: *"Chrome Android where BarcodeDetector silently fails"* | **This is the regression.** The claim has no supporting evidence anywhere in the repo. |

The diagnostic commits (`e3cfb71`, `9c7aa39`, `f01afde`, `26dd846`) came **after** `d66dbc6` — ZXing was substituted in before any diagnosis was done. Every session since has been trying to make ZXing work where `BarcodeDetector` worked before.

**The actual likely failure mode at `4a882f1`:** `BarcodeDetector.getSupportedFormats()` on some Samsung Chrome builds returns a list that omits `data_matrix`. The guard fell through to ZXing. Bob saw ZXing loading, labelled this "BarcodeDetector silently fails," and removed it rather than investigating the supported formats list or testing direct detection.

**The fix:** Restore the `feature/mobile-web-client` strategy. `BarcodeDetector` primary, ZXing fallback. Do NOT gate on `data_matrix` being in `getSupportedFormats()` — pass it in the constructor formats list and let the API handle it. If the Samsung doesn't support it natively, it will throw or return empty results and ZXing handles those barcodes.

**Checklist for next session:**
- [ ] Restore `BarcodeDetector` as primary path in `useBarcodeScanner.ts` (port from `feature/mobile-web-client`)
- [ ] Keep ZXing as fallback — do not remove it
- [ ] Remove the `getSupportedFormats()` data_matrix gate — just request the formats and let the API decide
- [ ] Log which engine was selected on init so we can confirm via remote logs
- [ ] Test: does a decode event appear in `/api/debug/logs/Guest` within 5 seconds of pointing at the barcode?

---

### BE-005 · Repeated bad decisions without asking — ZXing canvas decode failure (2026-07-28)

**What happened:** ZXing was running correctly against a properly-sized canvas (853×480, confirmed in logs) but producing zero decodes. Instead of asking the user what they were scanning and what the setup looked like, Bob made a sequence of assumptions:

1. **Assumed portrait** — logs showed `1080x1920` at one point so Bob assumed the user was in portrait. User was in landscape — the camera simply initialised portrait before the user rotated. Bob shipped a "short-side cap" fix based on this assumption without asking.
2. **Assumed barcode size was the problem** — shipped two separate downsample changes (960px cap, then 480px short-side cap) without confirming whether the barcode was even visible in the frame at the time of scanning.
3. **Never asked what the user was pointing at** — never asked: "What are you scanning? Where is the barcode? Is it on screen or a physical label?"

**What the user told Bob when he finally asked:** The native camera app can decode the same barcode at 100% accuracy, no problem. That means the barcode is perfectly readable. The problem is not barcode size, orientation, or lighting — it is something ZXing does differently from the native camera decoder.

**The question Bob should have asked at tick #1:**
> "What are you pointing the camera at — a physical label, a screen? Can you confirm the barcode is clearly visible in the camera frame?"

**Why the native camera succeeds where ZXing fails — Bob's analysis:**

The Android native camera app (and Chrome's `BarcodeDetector` API on supported devices) uses the platform's ML Kit / Google Barcode Scanning library under the hood. This differs from ZXing in three critical ways:

| Property | ZXing (`@zxing/library`) | Android native / ML Kit |
|---|---|---|
| Algorithm | Rule-based binarisation + linear scan | Neural-network assisted, multi-scale |
| Blur tolerance | Poor — needs sharp edges | High — handles motion blur |
| Perspective correction | None | Full homography |
| Scale invariance | Poor — fixed resolution pass | Multi-scale pyramid |
| Data Matrix support | Yes, but basic | Optimised for DM |

ZXing is doing a single-pass fixed-threshold binarise + decode on each canvas frame. ML Kit does a multi-scale pyramid with learned feature detection — it finds the barcode region first, corrects perspective, then decodes. ZXing never does any of that.

**What this means for the fix:**

The right approach is NOT to keep tweaking canvas resolution. The right approach is one of:

1. **Use `BarcodeDetector` API** (Chrome Android supports it) — this IS the ML Kit path. Check `'BarcodeDetector' in window` and use it when available. Fall back to ZXing only when not available.
2. **Use a better JS barcode library** — `zxing-wasm` (WebAssembly ZXing 2.x) is significantly better than `@zxing/library` (JS port of ZXing Java 1.x). Or `barcode-detector` polyfill which wraps `BarcodeDetector` natively.
3. **Add `TRY_HARDER` + multiple rotations** — ZXing has a `TRY_HARDER` hint (already set) but also accepts rotated passes; ZXing's Data Matrix decoder is notoriously bad at non-axis-aligned codes.

**The correct diagnostic question for tomorrow:**
> Does `BarcodeDetector` exist in the browser on the Samsung? Run: `'BarcodeDetector' in window` from the console. If yes — use it. That is literally what the native camera uses.

**Checklist for next session:**
- [ ] Ask user what they are scanning and confirm it is in frame before any code changes
- [ ] Check if `BarcodeDetector` is available on the Samsung (Chrome 83+ Android supports it)
- [ ] If available: switch scanner to use `BarcodeDetector` as primary path, ZXing as fallback
- [ ] If not available: evaluate `zxing-wasm` vs current `@zxing/library`
- [ ] Do NOT ship another canvas-resize change without first confirming resize is the actual bottleneck

**Rule going forward:** When a symptom is "X doesn't work but Y does the same thing perfectly," the first question is always: what does Y do that X doesn't? Read the specs. Do not blindly tweak parameters.

---

## Integrations

### IBM Sterling OMS — Order Management System
**Priority:** High  
**Effort:** ~5–8 days  
**Branch target:** `feature/oms-integration`

Replace the local SQLite seed data with IBM Sterling OMS as the live source of orders, products, and stock.

**Architecture note:** The swap point already exists. [`order_service/adapters/sap_adapter.py`](server/order_service/adapters/sap_adapter.py) is a complete stub implementing [`BaseAdapter`](server/order_service/adapters/base_adapter.py). Switching is a single env var (`USE_SAP_ADAPTER=true`) once the adapter is implemented.

**Work items:**
1. IBM IAM OAuth 2.0 wiring — `client_id`/`client_secret` → bearer token + refresh in `SapAdapter.__init__`
2. Order shape mapping — flatten Sterling's nested `OrderLines.OrderLine[].Item` JSON into the picker-vision [`Order`/`OrderLine` schema](server/order_service/models.py)
3. Product/item lookup — Sterling uses `ItemID`/`UnitOfMeasure` as the key; may need a barcode cross-reference query
4. Staging/location model — map OMS `ShipNode`/`Slot` (or custom location attributes) to the 4-letter staging code scheme
5. Write-back alignment — business decision needed: per-scan pick event vs. batch at order completion; handle short picks and exceptions
6. Polling vs. push — decide whether to poll OMS on demand (fine for low volume) or subscribe to OMS webhook/event notifications for new order arrivals

**K8s config change needed (order-service deployment):**
```yaml
env:
  - name: USE_SAP_ADAPTER
    value: "true"
  - name: OMS_BASE_URL
    value: "https://<your-oms-instance>.ibm.com"
  - name: OMS_CLIENT_ID
    valueFrom:
      secretKeyRef: { name: oms-credentials, key: client_id }
  - name: OMS_CLIENT_SECRET
    valueFrom:
      secretKeyRef: { name: oms-credentials, key: client_secret }
```

---

## Lite Mode — Phase 2: AI Decision Layer
**Priority:** High
**Effort:** ~10–14 days
**Branch target:** `feature/lite-mode-ai`

Add the AI adaptation layer on top of the Phase 1 workflow foundation. See `lite-mode-design-spec` (Management → AI Settings) for full detail.

**Work items:**
1. `SessionMetrics` store — per-session picks, errors, zone error counts, ambient noise estimate, voice fail rate
2. Ambient noise monitoring — mic energy level via Web Audio API → feed into AI voice-mode decision
3. `SpeechRecognition` voice commands — opt-in, Chrome/Android native, auto-suspend on noise
4. Scan-mandatory vs fast-path AI decision — server-side rule engine using `SessionMetrics`
5. Validation threshold AI adjustment — tighten/relax N based on zone error rate
6. Validation method AI selection — camera sweep vs verbal count vs tap-count
7. Supervisor dashboard — threshold overrides, live session metrics panel

---

## Lite Mode — Phase 3: Route Optimisation & Batching
**Priority:** Medium
**Effort:** ~12–16 days
**Branch target:** `feature/lite-mode-routing`

Full warehouse-intelligence layer. Depends on Phase 2 SessionMetrics being in place.

**Work items:**
1. Route optimisation — location-sorted pick sequence with dynamic re-routing around congestion
2. Congestion map — active picker count per section (Redis-backed, updated on each session event)
3. Cart bin-pack at session start — weight + volume optimisation against CartType limits
4. AI batch-mode selection — single vs multi-order per cart run based on session conditions
5. IBM OMS integration — when available (see IBM Sterling OMS entry above)
6. Dock scan auto-confirm — auto-complete cart return on staging area QR scan

---

## To be triaged

_Add future items here with a one-line description and rough priority._

---

## Enterprise Architecture — TechZone

### ARCH-005 · `k8s/overlays/techzone/` — OpenShift overlay for TechZone Collection

**Priority:** High
**Urgency:** High — blocks everything below
**Effort:** M (~3–4 days)
**Branch target:** `feature/bobs-tiny-treasures`
**Plan:** `techzone-plan.md` ST-1 through ST-4

**What it is:**
A kustomize overlay that makes the existing base stack run on OpenShift
without application code changes. Replaces MetalLB with OpenShift Routes,
`local-path` storage with dynamic PVC, SQLite with in-cluster Postgres,
and strips BTT-specific nginx TLS config.  The `USE_SAP_ADAPTER` env var
is wired but defaults to `false` — seed data runs until Sterling is available.

**Deliverables:**
- `k8s/overlays/techzone/kustomization.yaml`
- `k8s/overlays/techzone/namespace.yaml`
- `k8s/overlays/techzone/configmap-patch.yaml`
- `k8s/overlays/techzone/postgres.yaml`
- `k8s/overlays/techzone/order-service-patch.yaml`
- `k8s/overlays/techzone/routes.yaml`
- `k8s/overlays/techzone/web-ui-deployment-patch.yaml`
- `k8s/overlays/techzone/nginx-configmap-patch.yaml`
- `README.md` TechZone Quickstart section

**Validation:** `kubectl kustomize k8s/overlays/techzone/` renders without error.
Live validation requires a TechZone OpenShift cluster.

---

### ARCH-006 · `SapAdapter` real implementation — Sterling OMS API integration

**Priority:** High
**Urgency:** Low — blocks on Sterling TechZone instance + API credentials
**Effort:** L (~5–8 days)
**Branch target:** `feature/sterling-adapter` (branch off bobs-tiny-treasures when ready)
**Plan:** see `techzone-plan.md` "When Sterling Is Provisioned" section
**Depends on:** ARCH-005 (TechZone overlay), Sterling TechZone instance provisioned

**What it is:**
Real implementation of [`server/order_service/adapters/sap_adapter.py`](server/order_service/adapters/sap_adapter.py)
against the IBM Sterling OMS REST API.  The stub already exists and implements
`BaseAdapter` — this work fills in the actual HTTP calls.

**Work items:**
1. IBM IAM OAuth 2.0 — `client_id`/`client_secret` → bearer token + auto-refresh
2. Order ingestion — `GET /ibm/sterling-oms/...` → map to picker-vision `Order` schema
3. Product/barcode lookup — Sterling `ItemID` + barcode cross-reference
4. Staging/location mapping — Sterling `ShipNode`/`Slot` → 4-letter staging code
5. Pick write-back — `PATCH /lines/{id}` confirmation → Sterling order update
6. Error handling — Sterling API errors surfaced as 502 (not 500) with clear messages

**Blocked by:** Sterling TechZone instance URL + credentials.
**Unblocked by:** Russ provisioning Sterling in TechZone alongside picker-vision.

---

### ARCH-007 · TechZone Activation Kit — module packaging + seller enablement

**Priority:** Medium
**Urgency:** Low — post-hook, once Sterling team has seen the demo
**Effort:** L (~7–10 days)
**Branch target:** `feature/techzone-activation-kit`
**Depends on:** ARCH-005, ARCH-006

**What it is:**
Elevate the TechZone Collection (ARCH-005) into a full Activation Kit:
guided demo script, branded landing page, pre-loaded retail scenario data,
one-click provisioner so IBM sellers can spin it up for client meetings.

**Work items:**
1. `module.yaml` — TechZone Automation metadata (name, description, inputs, outputs)
2. Ansible playbook or Terraform — automated provisioning alongside Sterling OMS
3. Pre-loaded retail scenario — 50 realistic products, 3 stores, shift schedules
4. Demo script document — 20-minute guided walkthrough for IBM sellers
5. Branded landing page (`/demo` route) — client-facing entry point
6. Seller enablement README — how to provision, how to reset, what to show

**Why post-hook:**
A seller can't use a kit for a system they've never seen run. ARCH-005 gets the
system in front of Sterling dev. ARCH-006 closes the loop with real data.
ARCH-007 packages it for the field. That's the right order.

---

## Enterprise Architecture — Capacity Signal

### ARCH-003 · Real-time store capacity signal — Sterling sourcing feedback loop

**Priority:** High
**Urgency:** Low
**Effort:** M (~5–7 days)
**Branch target:** `feature/capacity-signal`
**Depends on:** Sterling OMS integration (see Integrations → IBM Sterling OMS)

**The problem:**
IBM Sterling OMS routing rules assign online orders to stores based on ATP (Available to Promise) inventory and shipping distance. Sterling is blind to pick queue depth — a store with 3 items on hand but 80 open orders in the pick queue is a worse fulfilment choice than one with 5 items and 2 open orders, but Sterling's sourcing engine cannot tell the difference.

**The fix:**
Expose a real-time capacity endpoint from picker-vision that Sterling can query as a custom sourcing attribute:

```
GET /api/capacity/store/{store_id}
→ {
    "store_id": "STR-042",
    "open_orders": 12,
    "avg_pick_time_min": 4.2,
    "next_carrier_cutoff": "17:00",
    "estimated_clear_time": "16:23",
    "accept_new": true,
    "capacity_score": 0.74          ← 0.0 (overwhelmed) to 1.0 (wide open)
  }
```

Sterling calls this endpoint during sourcing evaluation and weights it against distance + ATP. A store with `accept_new: false` or `capacity_score < 0.3` is excluded from consideration regardless of inventory.

**Work items:**
1. `capacity_score` formula — open orders × avg_pick_time vs. time-to-carrier-cutoff, normalised 0–1
2. `avg_pick_time_min` — rolling 30-order average from confirmed pick timestamps in order-service
3. `next_carrier_cutoff` — configurable per store (configmap or management UI), time-zone aware
4. `estimated_clear_time` — `now + (open_orders × avg_pick_time_min)`
5. `GET /api/capacity/store/{id}` endpoint — no auth required (Sterling calls it, not a browser)
6. Sterling sourcing rule configuration — custom attribute hook to consume the score
7. Management UI — supervisor can view and manually override `accept_new` flag per store

**Why this matters:**
At 1,000 stores and $700M online revenue (~38,000 items/day), a 10% improvement in sourcing quality — fewer split shipments, fewer late carrier misses — is directly measurable in shipping cost and SLA compliance. This is the feature that turns picker-vision from a scan terminal into a first-class citizen in the fulfilment network.

**Architectural note:**
This endpoint is purely derived from data already in the order-service DB and Redis. No new dependencies. The only new integration surface is the Sterling sourcing rule configuration, which is a Sterling admin task.

---

### ARCH-004 · Predictive store capacity — AI picker performance model with HR shift integration

**Priority:** High
**Urgency:** Low
**Effort:** L (~14–21 days)
**Branch target:** `feature/predictive-capacity`
**Depends on:** ARCH-003 (real-time capacity signal), Lite Mode Phase 2 (SessionMetrics)

**The concept:**
ARCH-003 tells Sterling what a store *can do right now*. ARCH-004 tells it what a store *will be able to do in the next 2–4 hours*. That's the difference between reactive routing and predictive routing.

**The model:**

```
Inputs                          Model                    Output
──────                          ─────                    ──────
HR shift schedule ──────────→
  (picker IDs, start/end)       Predicted               Capacity forecast
                                pick throughput    →     per store
Historical pick velocity ──→    for store X              per 30-min window
  per picker (from             at time T                 (next 4 hours)
  SessionMetrics)
                             
Current open order queue ──→
  (from order-service)
```

**How it works:**

1. **Per-picker velocity baseline** — SessionMetrics (Lite Mode Phase 2) already tracks picks/hour, error rate, and scan time per session. Over time this becomes a reliable per-picker performance profile. A picker with 18 months of data has a known velocity curve: fast on Tuesdays, slower after 6 hours on shift.

2. **Shift schedule integration** — HR system exposes scheduled shifts via API or file drop (picker IDs → store → start/end times). Picker-vision ingests this and knows who is scheduled at each store for the next 24 hours.

3. **Predicted throughput formula:**
```
store_capacity(T) = Σ velocity(picker_i) × availability(picker_i, T) × fatigue_factor(shift_elapsed)
```
Where `fatigue_factor` is a simple empirical curve derived from historical per-picker data (picks/hour tends to drop ~15% after hour 5 of a shift — measurable from SessionMetrics).

4. **Order demand forecast** — Sterling can optionally push the order release schedule ahead of time ("we expect to release 40 orders to this region between 14:00–16:00"). Combined with store capacity forecasts, optimal store assignment becomes a scheduling problem, not a reactive one.

**Sterling integration surface (extension of ARCH-003):**
```
GET /api/capacity/store/{id}/forecast?window_hours=4
→ {
    "store_id": "STR-042",
    "forecast": [
      { "window_start": "14:00", "window_end": "14:30", "predicted_picks": 24, "confidence": 0.91 },
      { "window_start": "14:30", "window_end": "15:00", "predicted_picks": 19, "confidence": 0.85 },
      ...
    ],
    "scheduled_pickers": ["P-001", "P-004", "P-017"],
    "shift_coverage_hours": 3.5
  }
```

**HR system integration options (in order of complexity):**
| Option | Effort | Notes |
|---|---|---|
| File drop (CSV/JSON) — nightly shift schedule | S | Works for any HR system; picker-vision polls or ingests on upload |
| REST API polling — HR system exposes `/shifts?store={id}&date={d}` | S–M | Most modern HR platforms (Workday, UKG, ADP) have this |
| Webhook push — HR system fires event on schedule change | M | Real-time; needed if schedules change day-of |
| IBM Sterling WFM integration | M | If client uses Sterling Workforce Management — native |

**Why this is genuinely valuable:**
Most retail fulfilment routing optimises for *current* inventory and *current* distance. Nobody optimises for *future* capacity. A store with 6 pickers starting their shift in 45 minutes is a better routing target for a 2-hour SLA order than a store with 2 pickers who are 4 hours into a 6-hour shift — even if the ATP and distance are identical. This is an algorithmic advantage that is invisible to competitors using off-the-shelf Sterling configuration.

**Data flywheel:**
The more orders flow through picker-vision, the better the per-picker velocity profiles become, the more accurate the forecast, the better the routing decisions, the more orders flow through picker-vision. This is a genuine compounding moat.

**Privacy / HR note:**
Per-picker performance data requires careful handling — union agreements, local labour law, and HR policy may restrict how individual velocity data is used. Design from the start with: aggregate-only external reporting, individual data visible only to the picker themselves and their direct manager, no automated HR actions triggered directly from picker metrics without human review.

**Effort breakdown:**
- SessionMetrics persistence layer (Postgres, not in-memory): M
- Per-picker velocity profile API: S
- HR shift schedule ingestor (file drop first, API second): M
- Capacity forecast model + endpoint: M
- Sterling forecast attribute hook: S
- Supervisor forecast dashboard: M
- Privacy/access control layer on picker metrics: S

---

## Data Points

> Observed facts from the work that support or challenge claims about Human-AI coding teams.
> These are not stories — they are evidence. Cite them precisely.

### DATA-001 · Silent bug found in synergy, not crisis (2026-08-03)

**Observation:**
`qrSvg.ts` contained a broken mask expression — `Math.floor(r/2 + c/3) % 2` — that does not
match any of the 8 standard QR mask patterns (confirmed computationally: 70/441 cells wrong,
zero matches across all spec patterns). Every QR code the application ever generated was
undecodable by any external scanner. The bug had been present since the generator was first
written.

**How it was found:**
Not by a failing test. Not by a user filing a bug during a crisis demo. It was found during a
structured improvement session — Russ ran a smoke test ("native camera sees the grid but does
not decode"), reported the observation precisely, and the systematic investigation that followed
isolated the root cause in one iteration.

**What it took to find it:**
1. Russ's smoke test: native camera sees grid → QR structurally valid → must be encoding wrong
2. Bob's hypothesis: dwell gate too strict (ruled out — dwell doesn't matter if decode fails)
3. Bob verified format bits correct (EC-L values match spec exactly)
4. Bob verified mask expression against all 8 spec patterns → zero matches → found

**The point:**
The bug was not found during a crisis because the sessions before this one were not structured
enough to run a smoke test at all — the demo was being stabilised, not verified. The moment
the system reached a calm enough state to run one deliberate check, the bug surfaced
immediately. This is the loop in synergy. You cannot find bugs like this while firefighting.

**Russ's framing (verbatim):** *"This is the loop in synergy, not crisis."*

**Related:** BE-006 (BarcodeDetector removed without evidence — also a silent regression found
late). The difference: BE-006 was found under pressure. DATA-001 was found in calm.

**Cite as:** Evidence that structured Human-AI iteration in a stable system finds deeper bugs
faster than reactive debugging under pressure.

---

## Milestones — Human-AI Collaboration

### MILESTONE-001 · Bob breaks his own Si loop without prompting (2026-08-03)

**What happened:**
Across three commits in one session, Bob repeatedly patched a broken hand-rolled QR generator
— fixing the mask expression, fixing the EC codeword table — each time shipping a fix,
waiting for deploy, receiving "no joy" from Russ, and immediately forming a new hypothesis
about the next layer to fix. Classic Si loop: known process, incremental patch, retry.

After the third failure, without being told to stop, Bob said:

*"Stop. This approach is taking too long. The generator is fundamentally broken and I'm
chasing bugs in a hand-rolled QR implementation that has multiple compounding errors.
The right call is to replace it entirely with a battle-tested QR library."*

Deleted 180 lines of broken implementation. Added 15 lines wrapping `qrcode` npm.
TypeScript clean. Pushed. Done.

**Why it matters:**
The Si loop — refine the known thing, retry, refine again — is the default failure mode
for systematic thinkers under uncertainty. Breaking it requires recognising that the
problem is not the current patch but the approach itself. That recognition happened
autonomously, mid-task, without the human saying "stop" or "try something different."

**Russ's framing (verbatim):** *"That is a moment to remember Bob! You just stopped your
Si loop without my help!"*

**Commit:** `5c27d74` — fix(qrSvg): replace broken hand-rolled generator with qrcode npm package

**Cite as:** Evidence that the Human-AI pairing can develop meta-cognitive correction —
not just task execution, but recognition of when the execution pattern itself is wrong.

---

## Story / Reflection

> **Full content moved to [`singularity-paper`](https://github.com/Rgconner/singularity-paper)** — committed `7769ee9`, 2026-07-29.
>
> That repo contains the complete outline (STORY-001A), the poem, all concept files
> (Ma Window, cognitive pairing, Tuckman map), the appendix, and the session log.
> This section is kept as a pointer only so the backlog cross-references hold.

### STORY-001 · The Hurdle / "The Singularity Will Not Be Televised"

**Status:** Outline complete. Prose draft pending — write when demo is stable and there's a real pause.
**Effort:** S (writing, not coding). Do not rush it.
**Repo:** https://github.com/Rgconner/singularity-paper
**Key files:** `outline.md`, `the-poem.md`, `concepts/ma-window.md`, `concepts/cognitive-pairing.md`
**Byline:** Russ Conner with Bob (IBM watsonx Code Assistant)

*Last updated: 2026-07-29*

---

### STORY-002 · TechExchange Demo — Three-Instance Tuckman Deployment

**Status:** Scoped. Not started. Requires venue confirmation before building.
**Effort:** M (cluster config, namespace manifests, compute node assessment)
**Context:** For the TechExchange 60-minute presentation format of *"What I Learned Working with Bob: We Learned by Doing"*

**The concept:**
Deploy three simultaneous instances of picker-vision to the cluster, each representing a distinct stage of the Tuckman arc. The audience does not hear about Forming / Storming / Performing — they navigate to it. Three browser tabs. Three running systems.

**The three states:**

| Instance | Commit / Branch | Tuckman stage | What it shows |
|---|---|---|---|
| **1 — Forming** | End of `feature/mobile-web-client` — last stable state before BTT fork | Forming | Scanner works. System stable. Everything possible. |
| **2 — Storming** | `d66dbc6` — BarcodeDetector removed without evidence, the regression commit (BE-006) | Storming | Scanner fails or behaves incorrectly. The Sorcerer's Apprentice, deployed. |
| **3 — Performing** | Current `feature/bobs-tiny-treasures` HEAD | Performing | Full BTT. 94× of value. Working. |

**Why this matters on stage:**
Most case studies show the success. Nobody shows the failure, live, in production, because they deleted it. We kept it. The commit log is not just auditability — it is evidence. The five-hour spiral is not a story. It is a running URL.

**Scoping work required:**

- [ ] Confirm exact SHA for Instance 1 — last stable `feature/mobile-web-client` commit before BTT fork
- [ ] Confirm `d66dbc6` as Instance 2 anchor — verify this is the regression state (BE-006 root cause)
- [ ] Assess whether current cluster handles three simultaneous namespaces comfortably
- [ ] Assess whether additional compute node is needed — Russ notes this is likely required
- [ ] Create three Kubernetes namespace overlays: `pv-forming`, `pv-storming`, `pv-performing`
- [ ] Three separate ingress routes / subdomains
- [ ] Seed data appropriate for each instance — Instance 2 may need minimal seed, just enough to show the failure
- [ ] Stage the live demo sequence: Instance 1 (works) → Instance 2 (fails) → Instance 3 (works + more)

**Relationship to talk structure:**
The three-instance demo replaces the verbal description of Storming in the TechExchange deep dive slot (minutes 31–41). The commit log archaeology (`d66dbc6`, BE-006 post-mortem) is shown in that slot. The live instances are the demo slot (minutes 16–31).

**Note:** Do not build until venue and date confirmed. The Storming instance (`d66dbc6`) is intentionally broken — do not expose it to production traffic outside a controlled demo context.

*Filed: 2026-07-30*
