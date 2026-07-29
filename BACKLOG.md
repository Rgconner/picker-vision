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

*Last updated: 2026-07-26*
