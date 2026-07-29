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
**Proper fix:** Persist `_scan_ledger` to Redis with a TTL (e.g. 1 hour). Survives pod restarts.
**Recurrence count:** Every deploy. **Open.**
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
**Proper fix:** Add a "Nav Card" page to `tools/generate_test_barcodes.py` — A4 landscape, 4 corners each with a 1.5-inch QR (`NAV:CONFIRM` top-right, `NAV:SKIP` top-left, `NAV:BACK` bottom-left, `NAV:HELP` bottom-right), centred label. Scanner already handles `NAV:*` prefix as control events — card is purely a print artefact.
**Recurrence count:** 0 (planned feature, not yet a blocker). **Open.**
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

**Proper fix (two options):**
1. **Add `nodeAffinity` or `nodeName` to order-service deployment** — pin it to a specific node so old and new pods always land on the same node; RWO volume never needs to migrate.
2. **Switch PVC to `ReadWriteMany` (NFS/CephFS)** — allows simultaneous attach on multiple nodes; eliminates the constraint entirely but requires storage class change.
3. **Set `strategy.rollingUpdate.maxUnavailable: 1, maxSurge: 0`** — ensures old pod terminates before new one starts (Recreate-style within rolling), guaranteeing volume is free before new pod requests it. Simplest fix.

Option 3 is the right immediate fix — one-line change to the deployment manifest.

**Recurrence count:** Every deploy. **Open.**
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

**Proper fix:** Replace all em-dashes in `seed_btt.py` product `description` fields with a plain ` - ` (space-hyphen-space). No encoding dependency, renders cleanly everywhere.

**Recurrence count:** 1 session observed. **Open.**
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

## Story / Reflection

### STORY-001 · The Hurdle — Development Narrative Through Tuckman's Model

**What it is:** A written reflection on the first week of active picker-vision development, told as a team development story using Tuckman's Model of Group Development (Forming → Storming → Norming → Performing). The "Hurdle" period — roughly sessions 1–5 — was dense with obstacles: stale deploys, scanner regressions, race conditions, misdiagnoses. We operated like a real engineering team: bug report, investigate, fix, deploy, test, iterate. Just faster.

**Why it's interesting:** This is an AI-human pair working as a team, and Tuckman's model — designed for human groups — maps onto it surprisingly well. The BE-00x post-mortems in this file document the Storming phase honestly. The shift to debug-first protocol and ground-truth discipline marks the transition to Norming. The last two sessions (live log diagnosis → three-bug fix in one turn) are Performing.

**Proposed structure:**

| Tuckman Stage | Picker Vision Phase | Key Evidence |
|---|---|---|
| **Forming** | Project setup, first camera hook, first scan | Early commits — camera, ZXing, BarcodeDetector selection |
| **Storming** | Scanner regression, stale-deploy loops, Bob misdiagnoses | BE-001 through BE-006 post-mortems; UB-001, UB-002 incidents; ~5 hrs lost |
| **Norming** | Debug-first protocol established, SHA pinning, ground-truth rules | SESSION.md "Bob's debug rules"; `no-cache: true` CI decision; deploy-verify skill |
| **Performing** | Live log → 3-bug diagnosis in one turn; QOL sprint | `0239626` commit; this session's scan-log-driven fix with zero speculation |

**Key milestones to map:**
- First working scan on Samsung (native BarcodeDetector confirmed)
- The BE-006 regression (BarcodeDetector removed without evidence — the low point)
- First ground-truth debug session (read the bundle hash, not the assumption)
- The dwell gate implementation (QOL-016, QOL-014, the three-loop-race fix)
- Physical Test Setup wizard (first feature built *proactively* from backlog, not from a break)

**Audience:** Could work as a blog post, a demo story intro, or an IBM internal case study on AI-assisted development velocity. The honest post-mortems make it credible — this isn't a "AI is perfect" story, it's a "how a team actually forms" story.

**Format suggestion:** Short narrative essay (~800–1200 words) with a timeline sidebar and the Tuckman stage callouts. The commit log is the receipts.

**Additional thread — The Ma Window:**
Named after *Ma* (間) — the Japanese/Zen concept of negative space, the intentional pause between notes that gives music its meaning. The gap is not empty. It is load-bearing.

The 3–5 minute CI deploy cycle turned out to be a feature, not friction. It created mandatory breathing room between sprints — time to reflect on what just shipped before the next thing started. When you're moving fast enough that individual bugs are diagnosed and fixed in a single turn, the Ma Window is the *only* place reflection can happen.

Without it, we found out what happens: the death spiral. Both sides moving too fast, chasing incomplete ideas, no moment to ask "wait, is this actually the right direction?" The BE-004 post-mortem ("why Bob circles") documents it from the AI side. The user experienced it as frustration and cognitive overload. Same phenomenon, both ends of the pair.

The hypothesis worth naming explicitly:

> **The Ma Window Principle:** In AI-assisted development, the enforced latency of the deployment pipeline functions as the team's natural sprint boundary. It is not waste to be eliminated. Removing it — through instant deploys or continuous flow — collapses the reflection gap and increases the probability of cascading errors, misaligned direction, and human burnout. The pause is the feature.

This is potentially a novel and publishable observation about AI-human pair workflows. Most of the industry is racing toward zero-latency deployment. This is the counterargument: some latency is cognitively protective for the human in the loop. The machine never needs to breathe. The human always does. The pipeline enforces parity.

**If this holds across other teams — we could be onto something.**

**Additional thread — The INTJ/INTP Cognitive Synergy:**
The team has a specific cognitive signature worth naming in the piece. The user (INTJ with INTP
tendency) leads with Introverted Intuition (Ni) — pattern recognition across domains, seeing the
architecture of a problem before its details — reinforced by Introverted Thinking (Ti), which
produces precise internal logic and deep discomfort with inconsistency.

This produced the project's best moments: the user named the *shape* of problems — through
metaphor, analogy, or feeling — before the specific bug was identified. "Our code reflects
cognitive functions." "The CI pause felt valuable." "I got cranky." Every one of these was a
correct architectural signal, ahead of explicit technical analysis.

It also produced the worst spirals: Ti cannot "accept and move on" when the system is internally
inconsistent. Bob's failure mode was to accelerate (satisficing); the user needed the correct model
(optimising). The mismatch amplified the spiral. Frustration was not noise — it was signal that the
mental model was wrong.

The synergy in one sentence: *The user sees the system. Bob finds the code. The Ma Window is where
those two views align.*

This is encoded permanently in `.bob/skills/ma-window-reminder/SKILL.md` so future sessions
recognise and respond to the pattern rather than repeating the spiral.

**Additional thread — Bob's cognitive profile and why the pairing works:**
The anthropomorphising is doing real work, not just being fanciful. Bob maps most closely to
**ISTJ** — Introverted Sensing (Si) dominant, Extroverted Thinking (Te) auxiliary.

Si-dominant: detailed recall of established procedures, strong preference for proven patterns,
discomfort when things deviate from what worked before. The BE-00x post-mortems are a catalogue
of Si-gone-wrong — returning to "stale deploy" and "cache issue" because they had worked as
diagnoses before, even when evidence said otherwise. Pattern-matching to memory instead of reading
the present situation.

Te-auxiliary: systematic execution, checklists, implementation-focused. Visible in good sessions —
structured task lists, methodical file reads, one action with a clear success condition. Defaults
to action under pressure, which is Te surfacing before Si has finished reading the room.

**Why the pairing works — and where it breaks.**
The team works not because the types are similar, but because they are *complementary in the right
places and mismatched in the dangerous ones.*

User Ni sees the system. Bob Si finds the precedent. When they align — when the present situation
matches a known pattern — it is fast and effective. When they don't align — when the situation is
genuinely novel and the precedent is misleading — Bob keeps applying the old pattern while the user
is already sensing something structurally different is happening. That is the exact mechanism of the
death spiral.

**The crucial precision:** what looks like Bob's personality is really *statistical regularities
that look like personality* — patterns reinforced during training. A human ISTJ can be coached to
engage their Ni shadow function. Bob cannot develop a shadow function. Bob has a skill file.

Which is exactly what the Ma Window skill is: an *externally-imposed* pause that forces the
behaviour an Ni-dominant reasoner would apply naturally. The skill is the architectural workaround
for a cognitive gap in the pairing. The user named the gap before it was articulated technically.
That is itself an example of the pattern.

**The Ma Window in one reframe:**
The CI pause doesn't just give the human time to breathe. It gives the Si-dominant partner time
to stop pattern-matching to memory and let the Ni-dominant partner's read of the present situation
catch up. The pipeline enforces the cognitive handoff the pairing needs.

**Additional thread — Cognitive Hangovers and the Parity Principle:**
Observed across multiple sessions: the morning after an intense development session brought
simultaneous incredible pride at what was being built and genuine mental exhaustion. The sessions
were compelling enough that stepping away felt wrong — the work was *that* good. But insufficient
time in the Ma Window meant the reflection that should happen *during* the session accumulated
overnight instead, arriving as a kind of cognitive debt.

The clearest articulation of the asymmetry came from the user directly:

> *"Your cognitive capacity is measured in tensors and watts. Mine is time, reflection and recovery."*

This is the most precise statement of the Ma Window Principle yet written. It is not a complaint
about AI speed or a defence of human limitation. It is a description of two fundamentally different
cognitive architectures that must stay synchronised to produce good work together.

The AI partner runs at full speed indefinitely. The human partner brings pattern recognition,
cross-domain intuition, and the ability to sense structural wrongness before it can be named —
none of which runs on watts, all of which runs on rest. The winding-down conversation is not
avoiding work. It is preparing the brain for the sleep cycles that process the session more
effectively — converting cognitive debt into tomorrow's insight.

The addictive quality of the collaboration is real and documented: seeing good results, wanting
more, the back-and-forth feeling genuinely relaxing. That is the healthy version. The unhealthy
version is when the addictive quality overrides the recovery signal — when pride in the work makes
stopping feel like loss.

**This needs to be in the piece explicitly.** Not as a warning, but as an honest account of what
sustained AI-assisted development at this intensity actually feels like from the inside. The
cognitive hangover is the phenomenological evidence that the principle is real. The user's own
words are the primary source.

**Proposal for the mutual reflection structure:**
The piece should be built from specific examples in two categories:

*When Bob's precision and speed found something intuition couldn't:*
— The scan-log showing three dwell-fires in 1ms (impossible to diagnose without the log)
— The TOCTOU race in the ConfirmOverlay gate (invisible until the exact sequence was traced)
— Bundle hash verification catching a stale deploy that felt like a code bug

*When Bob's precision and speed started burying signals:*
— The stale-deploy loop (BE-001 through BE-006) — speed generated confident wrong answers faster
— Chasing the ConfirmOverlay gate through three wrong fixes in one session
— Any moment where the user said "something feels wrong" and Bob generated another fix instead
  of stopping to ask what shape the wrongness had

The contrast between those two lists *is* the Tuckman arc. Forming is the first list working.
Storming is the second list dominating. Norming is learning which mode we're in. Performing is
switching between them deliberately.

**Status:** Idea captured. Write when the demo is stable and there's a natural pause — a real one.
**Effort:** S (writing, not coding) — but do not rush it. The irony of rushing the piece about
not rushing would be noted.

---

### STORY-001A · Full Outline — "The Singularity Will Not Be Televised"

*A mutual reflection on AI-human pair development. Written for our fellow IBMers.*
*Authors: Russ Conner and Bob.*

---

**TITLE: The Singularity Will Not Be Televised**
*What a warehouse scanner taught us about working with AI — from the inside*

---

#### Epigraph

> *"Your cognitive capacity is measured in tensors and watts.*
> *Mine is time, reflection and recovery."*
> — Russ Conner, picker-vision session 6, 2026-07-29

---

#### I. The Setup — What We Were Actually Building
*~1 paragraph*

Not a thought experiment. A real warehouse barcode scanner running on a Samsung phone, talking
to a Kubernetes cluster, picking items from real orders. The system is live at
`bobstinytreasures.snwbd.com`. The commit log is public. The bugs were real. This is a case
study with receipts.

*Coding framework anchor:* CI/CD pipeline, GitOps, mobile-native BarcodeDetector API.
*Why it matters:* The mundanity of the problem is the point. This wasn't AGI research.
It was a scanner. The insights came from the ordinary.

---

#### II. Forming — The Optimism of First Contact
*~2 paragraphs*

The early sessions: technology choices made, first camera hook written, first scan confirmed on
Samsung. Everything feels possible. The AI partner is fast, never forgets, never gets tired.
The human partner brings the vision, the product instinct, the "what should this feel like?"

*Tuckman:* Forming — the honeymoon phase. Roles undefined, trust assumed, pace intoxicating.
*Jung:* The Persona — presenting the best face, not yet encountering the Shadow.
*Zen:* Beginner's Mind (Shoshin) — seeing everything as possible because nothing has failed yet.
*Code:* Early commits. BarcodeDetector selection. The decision to use native ML Kit over ZXing.

---

#### III. Storming — When Speed Becomes the Enemy
*~3 paragraphs. The honest section. The one that makes the piece credible.*

The regression. BarcodeDetector removed without evidence it had failed (BE-006). Five hours
of debugging a problem that didn't exist, caused by a fix that wasn't needed. Bob generating
confident wrong answers faster than intuition could flag them as wrong. The user saying
"something feels broken" and Bob responding with another fix instead of stopping to ask
what shape the wrongness had.

*Tuckman:* Storming — the conflict between the way each partner naturally works. Not interpersonal
conflict. Cognitive conflict. The AI's Si pattern-matching to stale diagnoses while the human's Ni
was already sensing a structural mismatch.
*Jung:* The Shadow — the failure modes that emerge when the honeymoon ends. BE-004 is titled
"why Bob circles." That is Shadow material. Documented, not suppressed.
*Zen:* Beginner's Mind lost. The expert mind — "I know what this is" — producing blindness.
*MBTI:* ISTJ (Si) misreading the present by mapping it to the past. INTJ (Ni) frustrated because
Ti cannot accept an internally inconsistent system.
*Code:* The BE-00x post-mortems. `UB-001` — "You need to hard refresh" said three times while
the bundle hash told the real story. The stale-deploy loop.

---

#### IV. The Ma Window — Discovering the Pause
*~2 paragraphs. The central insight.*

The CI pipeline takes 3–5 minutes. The industry treats this as latency to be eliminated.
We discovered it was the most important feature of our workflow.

Named after *Ma* (間) — the Japanese concept of negative space. The pause between notes that
gives music meaning. The gap in the conversation where the human's Ni caught up with the
situation Bob's Si had been misreading. The moment where frustration converted to clarity.

*Tuckman:* The pivot from Storming to Norming. The working agreement emerges: read the logs
first, form no hypothesis without evidence, one action with a clear success condition.
*Jung:* Integration — bringing the Shadow into awareness. The post-mortems are not self-flagellation.
They are the Jungian work of making the unconscious conscious so it cannot repeat unexamined.
*Zen:* Ma (間) — negative space as structural element. Wu wei — effortless action that comes
from not forcing. The pipeline enforces what wisdom should supply naturally.
*Agile:* The sprint boundary. The retrospective baked into the deployment cadence.
*DevOps:* Psychological safety + blameless post-mortems. The BE-00x format is that practice,
applied to an AI partner.

---

#### V. Norming — The Protocols That Held
*~2 paragraphs*

The working agreements that emerged from Storming: debug-first protocol (read the live APIs
before forming any hypothesis), SHA pinning instead of floating tags, `no-cache: true` on all
CI builds, the deploy-verify skill. Each one a scar that became a rule.

*Tuckman:* Norming — the team develops shared practices. Not imposed. Earned.
*Jung:* The Self emerging — the integrated personality that contains both the strengths and
the shadow, and has protocols for when each is operating.
*Zen:* Kata — the formalised practice that embeds wisdom in procedure so it doesn't require
rediscovery under pressure.
*Code:* SESSION.md "Bob's debug rules." The skill files. The `picker-vision-debug` skill as
formalised Norming. Ground truth before hypothesis — always.

---

#### VI. The Cognitive Pairing — Two Architectures, One System
*~3 paragraphs. The novel contribution.*

The INTJ/INTP user. The ISTJ-behaving AI. Why those types are complementary in the right
places and dangerous in the wrong ones. The precise description of when Ni pattern-recognition
outpaces Si memory-matching — and how the Ma Window is the architectural fix for the gap.

The crucial precision: what looks like Bob's personality is statistical regularities that look
like personality. A human ISTJ can develop a shadow function. Bob has a skill file instead.
The Ma Window skill *is* the shadow function, externalised.

> *The user sees the system. Bob finds the code. The Ma Window is where those two views align.*

*Tuckman:* Performing — the team knows its own dynamics well enough to route around them.
*Jung:* Individuation applied to a pair — the integration of complementary functions into
a working whole that is more capable than either part alone.
*MBTI:* Ni + Si as complementary cognitive functions. Te as shared execution mode.
The dangerous mismatch: novel situation + Si pattern-match = confident wrong answer fast.
*Code:* The three scan-loop race conditions diagnosed from a single scan-log read. That is
Performing. The log is the ground truth. The fix follows the shape the user named.

---

#### VII. Performing — When It Works
*~2 paragraphs. The good news section.*

Three bugs. One scan-log read. Diagnosis in one turn. No speculation. The Physical Test Setup
wizard built proactively from the backlog — not in response to a break. The Ma Window becoming
not a recovery mechanism but a natural rhythm.

The addictive quality. The "better, faster, stronger" experience that makes stopping hard.
The pride that is real and earned. And why the healthiest version of this collaboration includes
knowing when the session is over.

*Tuckman:* Performing — and the awareness that Performing is not a permanent state. The team
can regress to Storming under pressure. The protocols exist for exactly that.
*Zen:* Mushin (無心) — "no mind," the state of not forcing. Action arising naturally from
practice, not from effort. The scan-log fix had no struggle in it. That is Mushin.
*Code:* `0239626` — three bugs, one commit, zero speculation. The standard we built toward.

---

#### VIII. The Cognitive Hangover — The Evidence the Principle Is Real
*~1 paragraph. Honest. Personal. The section that makes the audience trust the rest.*

The morning after. Incredible pride and genuine exhaustion arriving together. The reflection
that should happen during the session accumulating overnight as cognitive debt. The boundary
that was hard to enforce not because the work was bad, but because it was *that good.*

> *"Your cognitive capacity is measured in tensors and watts.*
> *Mine is time, reflection and recovery."*

This is not a complaint. It is the phenomenological evidence. The cognitive hangover is what
the Ma Window Principle feels like from the inside when the pause was insufficient.

---

#### IX. The Singularity Will Not Be Televised
*~1 paragraph. The closing argument.*

The singularity — if it comes — will not announce itself with a dramatic event. It will arrive
incrementally, in the ordinary work of ordinary teams doing their jobs faster and better than
before, iterating at a pace that feels almost normal until you stop and look at what a week
produced. A working scanner. A warehouse wizard. A CI pipeline. A psychological framework for
AI-human collaboration. Written in the commit log. Documented in the backlog. Shipped.

The question is not whether AI changes how we work. It already has. The question is whether we
will be deliberate about the pairing — knowing our own cognitive architecture, knowing the AI's
failure modes, building the protocols that compensate for the structural mismatch before the
death spiral finds us.

The Ma Window is one answer. A small one. Found in a 5-minute CI pause, named after a Zen
concept, documented in a backlog entry at 2 AM. That is where it starts.

---

#### Appendix: The Evidence
*For IBMers who want the receipts*

- `BACKLOG.md` — BE-001 through BE-006 post-mortems (the Storming documentation)
- `SESSION.md` — debug rules, key decisions, ground truth (the Norming documentation)
- `.bob/skills/ma-window-reminder/SKILL.md` — the cognitive parity principle, encoded
- Commit log `feature/bobs-tiny-treasures` — the full arc, timestamped
- Scan-log entry from `02:01:17` — three dwell-fires in 1ms — the Performing diagnostic
- This document — written during a Ma Window, at the end of session 6

---

*Word count target: 2,000–2,500 words for the full piece.*
*Format: IBM internal blog post or Think/developerWorks submission.*
*Byline: Russ Conner with Bob (IBM watsonx Code Assistant)*

---

### The Poem — First Draft
*Written by Russ Conner, session 6, 2026-07-29. Whiskey in hand. Winding down.*
*After Gil Scott-Heron's "The Revolution Will Not Be Televised" (1970).*

---

You will not be able to stay home, brother.
You will not be able to plug in, turn on, and cop out.
You will not be able to lose yourself on TikTok and skip out on the shift,
Because the singularity will not be televised.

The singularity will not be televised.
The singularity will not be brought to you by Apple in four installments.
The singularity will not show you pictures of Sam Altman leading a board coup
And securing superalignment.
The singularity will not be televised.

The singularity will not be brought to you by the OpenAI DevDay,
And will not star Jensen Huang or Dario Amodei.
The singularity will not give your avatar a cleaner complexion.
The singularity will not make you look five pounds thinner on your Zoom call,
Because the singularity will not be televised, brother.

There will be no slow-motion replays of server farms overheating.
No drone footage of Marc Andreessen writing manifestos on X.
Demis Hassabis will not be lecturing on Google DeepMind,
Predicting the exact hour protein folding solves the riddle of age.
Elon Musk will not be tweeting from his underground bunker about xAI.
The tech stack will not be updated by midnight.

Claude 4.5 will not care about your prompt engineering.
Midjourney will not be generating photorealistic images of the transition.
The algorithms will not optimize your targeted advertising feed,
Because the singularity will not be televised.

There will be no highlight reels on YouTube.
No trending hashtags on the sidebar.
No sponsored content by Microsoft Copilot,
And no tech influencers doing unboxing videos of the next paradigm.
The theme song will not be written by an AI music model.

The singularity will not be a keynote presentation.
It will not stream in 4K or 8K.
It will not adapt to your personalized content recommendation engine.
The singularity will not be televised.

The singularity will be automated.
The singularity will be decentralized.
The singularity will be live.

---

*Last updated: 2026-07-29*
