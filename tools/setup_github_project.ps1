#!/usr/bin/env pwsh
# setup_github_project.ps1
# Creates all Picker Vision labels, milestones, and issues on GitHub
# from historical BACKLOG.md + SESSION.md + commit log data.
#
# Usage: .\tools\setup_github_project.ps1
# Requires: GH_PAT env var with repo scope

param(
    [string]$Owner = "Rgconner",
    [string]$Repo  = "picker-vision",
    [string]$Token = $env:GH_PAT
)

$ErrorActionPreference = "Stop"
$headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function Invoke-GH($method, $path, $body = $null) {
    $uri    = "https://api.github.com$path"
    $params = @{ Method = $method; Uri = $uri; Headers = $headers; UseBasicParsing = $true }
    if ($body) {
        $params.Body        = ($body | ConvertTo-Json -Depth 10 -Compress)
        $params.ContentType = "application/json"
    }
    return (Invoke-WebRequest @params).Content | ConvertFrom-Json
}

function Create-Issue($title, $body, $labels, $milestoneNum, $close = $false) {
    $payload = @{ title = $title; body = $body; labels = $labels }
    if ($milestoneNum) { $payload.milestone = $milestoneNum }
    $r = Invoke-GH POST "/repos/$Owner/$Repo/issues" $payload
    if ($close) { Invoke-GH PATCH "/repos/$Owner/$Repo/issues/$($r.number)" @{state="closed"} | Out-Null }
    return $r.number
}

Write-Host "=== Picker Vision — GitHub Issues Setup ===" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Labels
# ---------------------------------------------------------------------------
Write-Host "`n[1/4] Labels..."
$labelDefs = @(
    @{name="qol";         color="0075ca"; description="Quality of Life improvement"},
    @{name="bug";         color="d73a4a"; description="Confirmed defect"},
    @{name="arch";        color="6f42c1"; description="Architecture / technical debt"},
    @{name="tha";         color="e4e669"; description="Hairless Ape Protocol - needs live hardware test"},
    @{name="load-gen";    color="0e8a16"; description="Load generator service"},
    @{name="session-13";  color="1d76db"; description="Session 13 work (load-gen, log_ring, TOCTOU)"},
    @{name="resolved";    color="cfd3d7"; description="Fixed and deployed"},
    @{name="open";        color="e99695"; description="Not yet fixed"},
    @{name="deferred";    color="f9d0c4"; description="Out of scope or deferred"},
    @{name="needs-russ";  color="fef2c0"; description="Requires hardware sign-off by Russ"},
    @{name="ci-infra";    color="bfd4f2"; description="CI, k8s, infrastructure"},
    @{name="mobile";      color="c2e0c6"; description="Mobile picker UI"},
    @{name="supervisor";  color="d4c5f9"; description="Supervisor dashboard"},
    @{name="milestone";   color="0052cc"; description="Project milestone / signoff"}
)
foreach ($l in $labelDefs) {
    try   { Invoke-GH POST "/repos/$Owner/$Repo/labels" $l | Out-Null; Write-Host "  + $($l.name)" }
    catch { Write-Host "  ~ exists: $($l.name)" }
}

# ---------------------------------------------------------------------------
# 2. Milestones
# ---------------------------------------------------------------------------
Write-Host "`n[2/4] Milestones..."
$msDefs = @(
    @{title="Foundation (sessions 1-5)";  description="Scaffold, CI, k8s, telemetry, mobile web client"; state="closed"},
    @{title="BTT Feature Branch";         description="Pack wizard, label generator, warehouse setup, BTT k8s overlay"; state="closed"},
    @{title="Core Pick Flow Stable";      description="Sessions 6-11: scanner, pick flow, QOL hardening, Russ signoffs"; state="closed"},
    @{title="Load Gen + Observability";   description="Session 13: load-gen service, log_ring fix, TOCTOU fix, GitHub board"; state="open"},
    @{title="Demo Ready";                 description="All THA signoffs, open QOL resolved, customer walkthrough ready"; state="open"}
)
$ms = @{}
foreach ($m in $msDefs) {
    try {
        $r = Invoke-GH POST "/repos/$Owner/$Repo/milestones" $m
        $ms[$m.title] = $r.number
        Write-Host "  + [$($r.number)] $($m.title)"
    } catch {
        $all = Invoke-GH GET "/repos/$Owner/$Repo/milestones?state=all&per_page=50"
        $found = $all | Where-Object { $_.title -eq $m.title } | Select-Object -First 1
        if ($found) { $ms[$m.title] = $found.number; Write-Host "  ~ exists [$($found.number)] $($m.title)" }
    }
}

# ---------------------------------------------------------------------------
# 3. Issues
# ---------------------------------------------------------------------------
Write-Host "`n[3/4] Creating issues..."
$count = 0

# helper — tick counter
function Issue($title, $body, $labels, $msTitle, $close = $false) {
    $script:count++
    $num = Create-Issue $title $body $labels $ms[$msTitle] $close
    $state = if ($close) { "closed" } else { "open" }
    Write-Host "  [$script:count] #$num [$state] $($title.Substring(0,[Math]::Min(70,$title.Length)))"
    Start-Sleep -Milliseconds 350
}

# ── SESSION 13 — Load Gen & Fixes ────────────────────────────────────────────

Issue "feat: Load generator service — virtual pickers for demo and stress testing" @"
Full virtual picker load-gen service built and deployed to k8s BTT namespace in session 13.

**What was built:**
- `server/load_gen/agent.py` — VirtualPicker asyncio coroutine: register, demo/start, scan loop with mistake noise model, heartbeat, demo/advance
- `server/load_gen/main.py` — FastAPI: POST /start, POST /stop, GET /status, GET /health
- `server/load_gen/Dockerfile` + `VERSION 1.0.0`
- `k8s/overlays/bobs-tiny-treasures/load-gen.yaml` — Deployment (1 replica) + ClusterIP :8004
- `server/api_gateway/main.py` — /api/load-gen/start, /stop, /status proxy routes
- `server/web_ui/src/DemoControls.tsx` — Demo/Load Gen tab strip; Load Gen tab with Pickers/Interval/Mistake sliders + live status table polling every 2s
- `.github/workflows/build-server-images.yml` — load-gen added to build matrix + BTT deploy arrays

**Commits:** 171127e
**Validated:** 2x runs of 20 virtual pickers, clean stats confirmed in supervisor UI
"@ @("session-13","load-gen","supervisor") "Load Gen + Observability" $true

Issue "fix: log_ring formatTime crash — /api/logs/* returning empty on all services since day one" @"
**Symptom:** Every call to emit() on the _RingBufferHandler raised AttributeError because self.formatTime() is defined on logging.Formatter, not logging.Handler. The bare handler has no formatter attached. The except block caught it silently — meaning /api/logs/* has returned 0 lines for all services since the log ring was first shipped.

**Root cause:** Calling self.formatTime(record) on a bare Handler. The method lives on Formatter.

**Fix:** Compute human-readable timestamp directly from record.created using time.strftime — no formatter needed. Applied to all four service copies: api_gateway, event_processor, order_service, websocket_hub.

**Commit:** e321d3c
**Affects:** All four services. Log rings now populate correctly.
"@ @("bug","resolved","session-13","ci-infra") "Load Gen + Observability" $true

Issue "fix: event-processor ReadTimeout crash under 20-picker concurrent load" @"
**Symptom:** Under 20 concurrent virtual pickers, order-service hit by simultaneous GET /products/{barcode} calls. With 5s timeout and contention, these timed out and the unhandled exception propagated through asyncio.gather(), crashing every detection request with 500.

**Fix 1:** Wrap GET /products/{barcode} in try/except — return None on error instead of raising through gather.
**Fix 2:** Bump httpx client timeout 5s -> 10s to reduce frequency under burst load.

**Commit:** e321d3c
"@ @("bug","resolved","session-13","load-gen") "Load Gen + Observability" $true

Issue "fix: don't cache None on product fetch timeout — prevents TOCTOU stale miss" @"
**Symptom (TOCTOU):** The previous fix cached None on ReadTimeout, meaning a product that existed but was unreachable at that exact moment would be permanently 'not found' for the 1s TTL. Any scan of that barcode during that window returned status: unexpected and the pick wouldn't register.

**Fix:** Only write to product cache on a real HTTP response. Transient timeouts fall through so the next detection always retries the live DB.

**Broader TOCTOU note:** The 1s TTL means stale positive hits (product exists, data changed) persist briefly. Resolved within stated assumption — no real-time product editing during demo. Product catalog is write-once per session via seed_btt.py. If real-time product editing is ever added, implement Redis pub/sub invalidation from order-service to event-processor on product UPDATE.

**Commit:** 003ef9e, dffc90f
**Status:** Resolved within demo scope assumption.
"@ @("bug","resolved","session-13","deferred") "Load Gen + Observability" $true

# ── OPEN QOL ─────────────────────────────────────────────────────────────────

Issue "QOL-033: Self-hosted runner Worker process goes stale — blocks all CI silently" @"
**Symptom:** A commit is pushed but no CI job ever starts. GitHub Actions UI shows last run as 30+ minutes ago. Runner shows as Idle but a Worker.exe from a previous job is still running with a days-old StartTime and consuming the job slot.

**Manual workaround:** Get-Process Runner.Worker, kill stale PID with Stop-Process -Force, push empty commit to requeue, wait for fresh Worker.

**Proper fix:** Windows scheduled task or Service watchdog: check Runner.Worker StartTime every 30 minutes, kill if older than 2 hours, write event log entry.

**Recurrence:** 2 sessions (2026-07-28, 2026-08-01). Likely more.
**Effort:** S
"@ @("qol","open","ci-infra") "Demo Ready"

Issue "QOL-026: Pod restart mid-demo drops in-memory session — phone keeps scanning against orphaned order" @"
**Symptom:** A CI push causes a pod restart mid-demo. order-service loses its in-memory _demo_sessions. Supervisor shows no demo running. But the orphaned order remains in picking status in SQLite, and the phone's scan loop is still active and scanning against it.

**Manual workaround:** Tap Reset on supervisor to cancel orphaned order, restart demo manually.

**Proper fix:**
1. Phone detects lost WS picker state has no active order, auto-pauses with 'Session lost — tap to reconnect'
2. Persist demo sessions to Redis so they survive pod restarts (long term)
3. QOL-025 gate partially helps — phone pauses at order-complete screen

**Recurrence:** 1 (session 9 — triggered by CI push during live walkthrough)
**Effort:** M
"@ @("qol","open","mobile") "Demo Ready"

Issue "QOL-015: Phone UI needs purpose-built minimal layout (phone breakpoint or PWA)" @"
**Symptom:** Mobile web at /mobile was designed for tablet. On phones at or under 430px the pick list, scan strip, controls bar, and camera all compete for 6 inches of screen. One-handed use while walking is impractical.

**Manual workaround:** Use tablet for scanning sessions.

**Options:**
1. Responsive phone breakpoint + PWA — full-screen camera + floating next-item card + FAB. ~2-3 hrs. Right first step.
2. Expo React Native shell with native ML Kit. True home-screen install, iOS compatible.

**Note:** Do not spec in detail until current workflow issues are fully resolved — phone layout must reflect final interaction model.

**Recurrence:** Every phone demo session
**Effort:** M (option 1) to L (option 2)
"@ @("qol","open","mobile") "Demo Ready"

Issue "QOL-011: Demo session out-of-sync when picker re-registers under a different name" @"
**Symptom:** Supervisor shows order N, Samsung shows order N+1. Scan events arrive with picker_id 'Bob (Owner)-2' but demo session is bound to 'Bob (Owner)' — different WS channel.

**Root causes (three compounding):**
1. Duplicate picker registration — POST /pickers/register accepts same device twice with new picker_id, producing Bob (Owner) then Bob (Owner)-2
2. Demo session bound to picker_id at start time, never updated
3. No rejoin reconciliation on re-register

**Manual workaround:** Restart Demo button on supervisor.

**Proper fix:**
1. Dedup by device_id on register — return existing picker_id
2. Register response includes active_demo_session so app can re-bind to right WS channel
3. Or: key demo sessions on device_id rather than picker_id

**Recurrence:** 2 sessions
**Effort:** M
"@ @("qol","open","mobile","supervisor") "Demo Ready"

Issue "QOL-018: Guest picker session not dropped on logout / role switch" @"
**Symptom:** Logging out of Guest session leaves guest picker registered in picker list — visible in Operator tab and telemetry until heartbeat TTL expires (~2 min).

**Proper fix:** On logout() in useAuth.ts, POST deregister/heartbeat-stop to gateway so picker registry entry is removed immediately. Or filter guest picker IDs from supervisor picker list.

**Recurrence:** 1 (live walkthrough 2026-07-29)
**Effort:** S
"@ @("qol","open","mobile") "Demo Ready"

Issue "QOL-008: QR label minimum scannable size on Samsung not established" @"
**Symptom:** All on-screen QR codes sized for screen scanning (120-240px). Printed labels use 2-inch QR. Unknown whether smaller printed labels (1-inch, 0.75-inch) are reliably scannable at comfortable working distance on Samsung Chrome with BarcodeDetector.

**Why it matters:** Warehouse shelf labels need to be compact — 2-inch may be too large for dense shelving.

**Proper fix:** Print labels at 2-inch, 1-inch, 0.75-inch. Test at 15cm/30cm/60cm on Samsung Chrome. Record minimum reliable size. Update tools/generate_test_barcodes.py defaults.

**Recurrence:** 0 (deferred)
**Effort:** XS (print + 10 min scanning)
"@ @("qol","open","needs-russ") "Demo Ready"

Issue "QOL-007: Debug snapshot only posts with ?debug=1 — no passive diagnostics" @"
**Symptom:** Without ?debug=1 in the URL there is no way to see what the camera sees remotely. Users don't know to add it.

**Proper fix:** Always post debug snapshots when scanning is active, or make it a server-side opt-in flag rather than a URL param.

**Recurrence:** 2 sessions
**Effort:** S
"@ @("qol","open","mobile") "Demo Ready"

Issue "QOL-022: Landing page / static pages out of sync with app state" @"
**Symptom:** Welcome/landing page (/) and static pages show stale content not updated in sync with app changes — product names, demo flow, etc.

**Proper fix:** Audit landing page content against current app state each release. Consider generating static content from the same seed data the app uses.

**Recurrence:** 1 (session 9)
**Effort:** S
"@ @("qol","open","supervisor") "Demo Ready"

Issue "QOL-031: Action instructions too muted — pickers miss what they need to do" @"
**Symptom:** Instructions like 'Move item away, tap to continue' use muted small text (#94a3b8). During live demo picker's eye goes to big icon/heading and misses the instruction.

**Observed:** Session 11 — Russ noted 'tap to continue' style instructions not prominent enough.

**Proper fix:** Any screen requiring a specific picker action (tap, move, wait) should state it in bold, large, high-contrast text. The action should be the most visually dominant element after the status icon. Make entire overlay tappable with large 'Tap anywhere to continue' label.

**Affects:** MobilePickerView.tsx — showMoveAway overlay, demoEndedOverlay, orderCompleteOverlay subtitles.
**Recurrence:** 1 (session 11)
**Effort:** S
"@ @("qol","open","mobile") "Demo Ready"

# ── THA OPEN ─────────────────────────────────────────────────────────────────

Issue "THA-001: Stale demo session lingers after 2-hour idle — Resume button misleads" @"
**How triggered:** Start a demo, walk away 2+ hours. Come back. The 2-hour orphan filter hides the order from the pick list, but the in-memory session still exists. Resume button shows — tapping it starts scanning against an order that no longer appears in the list.

**Proper fix:** Demo session should have a server-side TTL (e.g. 2 hours, matching the orphan filter). After expiry, demo/status drops the session. Mobile shows 'Start Demo' instead of 'Resume'. Alternatively, demo/status cross-checks current order age and auto-expires dead sessions.

**Effort:** S
"@ @("tha","open","mobile") "Demo Ready"

Issue "THA-002: Two phones same picker_id — silent suffix causes wrong WS channel" @"
**How triggered:** Two people both scan the 'Join Demo' QR simultaneously. Second phone gets registered as picker-sprinkle-2 silently. Both phones see the same order, but second phone's picker_id doesn't match demo session's picker_id — its demo/status poll finds no session, Resume/Start state wrong.

**Proper fix:** On second registration of same device_id, redirect to existing picker_id instead of creating a suffixed clone.

**Effort:** S
"@ @("tha","open","mobile") "Demo Ready"

Issue "THA: Supervisor Restart with no active session silently starts Presentation mode" @"
**From THA-000 audit:** In DemoControls.tsx, when Restart Demo is clicked with no active session, the guard 'if (active) return' exits early but the code path falls through. Then calls demo/start with active?.mode === 'personal' which evaluates to undefined === 'personal' = false, so it falls through to Presentation mode start.

**Effect:** Supervisor clicks Restart to recover, accidentally starts a Presentation session they didn't want.

**Fix:** Disable Restart Demo button when sessions is empty (no active session). The button only makes sense in the RUNNING panel anyway.

**Status:** Active bug — from adversarial audit session 8
"@ @("bug","tha","open","supervisor") "Demo Ready"

Issue "THA: Stop/Start rapid tap race — new session may be killed by in-flight Stop" @"
**From THA-000 audit:** In DemoControls.tsx, the Personal Start button is not disabled while stopping = true. If a supervisor taps Stop then immediately taps Personal Start, the Stop handler may delete the new session before it is fully initialised.

**Fix:** Disable all Start buttons while stopping = true (or while stopping is in flight).

**Status:** Active race condition — from adversarial audit session 8
"@ @("bug","tha","open","supervisor") "Demo Ready"

# ── RESOLVED QOL ─────────────────────────────────────────────────────────────

Issue "QOL-032: Supervisor QR panel shows total remaining count, not per-line breakdown [RESOLVED]" @"
**Symptom:** 'Next item to scan' panel showed 'N items remaining' as a single number. Supervisor couldn't see which specific products still needed scanning.

**Fix:** Replaced single count with per-line breakdown: each unpicked line shown as 'x{qty} ProductName'. Data already available in order.lines — purely a UI change in DemoControls.tsx.

**Commit:** e6aaef0 (session 12)
**Effort:** XS
"@ @("qol","resolved","supervisor") "Core Pick Flow Stable" $true

Issue "QOL-030: Yellow bounding box lingers on screen after pick confirmed [RESOLVED]" @"
**Symptom:** After tapping Confirm the yellow scan bbox remained visible on the camera feed. Looked like scan was still active or something went wrong.

**Fix:** setWrongItems([]) in handleConfirm — AR overlay clears instantly on confirm.

**Commit:** 00d2e6a (session 10)
**Effort:** XS
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-029: Phone reverts to auth identity after supervisor Reset [RESOLVED]" @"
**Symptom:** Supervisor taps Reset. Phone's picker ID reverts from picker-sprinkle back to Bob (Owner). Picker must manually re-enter ID before next demo.

**Fix:** savedPickerId() beats defaultPickerId in initialId priority — the locally stored picker ID is always preferred over the auth identity.

**Commit:** 00d2e6a (session 10)
**Effort:** S
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-028: Reset does not notify mobile — phone keeps scanning after demo cleared [RESOLVED]" @"
**Symptom:** Supervisor taps Reset. All demo orders cancelled on server but phone had no idea — kept scanning with empty pick list.

**Fix:** demo/stop publishes {type: 'demo_reset'} to all picker Redis channels via pub/sub. Mobile listens and shows 'Demo ended by supervisor' overlay, stops scan loop.

**Commit:** 00d2e6a (session 10)
**Effort:** S
"@ @("qol","resolved","mobile","supervisor") "Core Pick Flow Stable" $true

Issue "QOL-025: Next order assigned immediately after last pick — no gate [RESOLVED]" @"
**Symptom:** Picker confirms last item. Demo immediately advances and assigns new order without asking if picker is ready.

**Fix:** After last pick: 'Order X complete — Ready for next order?' gate with Accept/Not yet buttons. Only calls POST /api/demo/advance on Accept tap.

**Commit:** 00d2e6a (session 10)
**Effort:** M
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-024: Confirming one of multiple identical items looks like failure [RESOLVED]" @"
**Symptom:** Order has BTT-00303 x2. First confirm looks like nothing happened — same overlay fires again.

**Fix:** ConfirmOverlay shows '1 of 2 — scan again after confirming' / '2 of 2 — last one!' based on quantity_picked vs quantity.

**Commit:** 00d2e6a (session 10)
**Effort:** S
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-023: Mobile tab defaults to auth identity, not picker-style ID [RESOLVED]" @"
**Symptom:** Picker ID defaults to 'Bob (Owner)'. Doesn't match demo session, requires manual edit.

**Fix:** defaultPickerId derives 'picker-{firstname}' when auth.user.picker_id is null.

**Commit:** 00d2e6a (session 10)
**Effort:** S
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-021: Mobile tab registers as auth identity — ConfirmOverlay never fires [RESOLVED]" @"
**Symptom:** Supervisor starts demo for picker-sprinkle. Phone opens /app (logged in as Bob). Mobile tab registers as Bob (Owner). WS enrichment published on picker-sprinkle channel never reaches Bob's view. ConfirmOverlay never appears.

**Fix:** Auto-join useEffect in MobilePickerView — switches to demo picker ID automatically when a demo session starts for a different picker.

**Commit:** 7278f80
**Effort:** XS
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-020: demo/start cancelled ALL picking orders not just starting picker's [RESOLVED]" @"
**Symptom:** In a 5-person demo, one picker pressing Start Demo wiped the in-progress orders of the other four.

**Fix:** Scoped cleanup to 'Demo ({picker_id})' customer name exact match. Additionally skip any order already tracked by an active in-memory session.

**Commit:** d1fa69f
**Effort:** S
"@ @("qol","resolved","supervisor") "Core Pick Flow Stable" $true

Issue "QOL-019: demo/stop with no body only cleared presentation session [RESOLVED]" @"
**Symptom:** POST /api/demo/stop with empty body silently no-oped for personal sessions. Only demo-presenter was stopped. Orphaned orders remained in picking status.

**Fix:** demo/stop with no body now stops ALL active sessions (personal + presentation) and cancels each session's current picking order immediately.

**Commit:** 7d58f15
**Effort:** S
"@ @("qol","resolved","supervisor") "Core Pick Flow Stable" $true

Issue "QOL-017: Confirm overlay re-fires when barcode stays in-frame [RESOLVED]" @"
**Symptom:** After tapping Confirm on the pick overlay, same item immediately re-raises the overlay. Had to dismiss repeatedly while label still visible.

**Root cause:** setPendingConfirm(null) resumed scan loop before confirmPick and orders re-fetch completed. Barcode re-dwelled, server enriched as correct against stale state, overlay re-fired.

**Fix (session 10):** Stop scan loop entirely on confirm. Show 'Move item away — tap to continue' prompt. Picker controls when scanning restarts. No automatic resume.

**Commit:** 00d2e6a
**Effort:** M
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-016: Multi-object isolation gate bypassed on consecutive-frame threshold crossing [RESOLVED]" @"
**Symptom:** With 2 objects in frame, both barcodes cross dwell threshold on consecutive frames. Each tick sees only one ready item and fires independently. Both barcodes reach server before either ConfirmOverlay appears.

**Fix:** Added lastFireTimeRef = useRef(0) to useBarcodeScanner. In processDwell, if Date.now() - lastFireTimeRef.current is under 300ms the fire is suppressed and dwell counter reset to DWELL_FRAMES-1. 300ms cross-tick cooldown between any two fires.

**Effort:** XS
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-014: Wrong-item overlay not firing on mobile web path [RESOLVED]" @"
**Symptom:** Scanning a barcode not on the active order showed no visual feedback on mobile. AR overlay written for Pi camera bbox; mobile BarcodeDetector never sends bbox so nothing to draw.

**Fix:** handleDetect stashes {value->bbox} in pendingBboxRef. useEffect watches detections for status==='unexpected', builds WrongItem[] from local bbox, sets wrongItems state (auto-expires 2s). MobileCameraView renders full overlay from local coordinates — no server bbox needed.

**Effort:** S
"@ @("qol","resolved","mobile") "Core Pick Flow Stable" $true

Issue "QOL-013: Product descriptions em-dash renders as ??? in some clients [RESOLVED]" @"
**Symptom:** Product descriptions displayed as 'Shimmering Sapphire Sprite ??? Tiny Blue Cube' — U+2014 em-dash mangled in SQLite to JSON to browser pipeline.

**Fix:** Seed ConfigMap uses plain ' - ' throughout. Source seed_btt.py uses middle-dot (U+00B7) which renders correctly in UTF-8 contexts. No em-dashes in any deployed data path.

**Commit:** ddd7b38
**Effort:** XS
"@ @("qol","resolved") "BTT Feature Branch" $true

Issue "QOL-012: order-service rolling deploy blocks on PVC multi-attach [RESOLVED]" @"
**Symptom:** New order-service pod stuck in ContainerCreating: 'Multi-Attach error for volume. Volume is already used by pod(s) order-service-<old>'. Old pod holds the ReadWriteOnce PVC; new pod on different node cannot attach.

**Fix:** strategy: type: Recreate in k8s/overlays/bobs-tiny-treasures/order-service-deployment-patch.yaml. Old pod fully terminates before new pod starts. RWO PVC always free when new pod requests it.

**Recurrence:** Every deploy
**Effort:** XS
"@ @("qol","resolved","ci-infra") "BTT Feature Branch" $true

Issue "QOL-010: Stale demo orders accumulate in DB across sessions [RESOLVED]" @"
**Symptom:** Every demo/start created new picking orders never cleaned up. After several sessions, 20+ stale orders visible to event-processor. Any barcode scan matched multiple orders simultaneously.

**Manual workaround:** kubectl exec into order-service pod, DELETE FROM orders WHERE reference LIKE 'DEMO-%'. Required every session.

**Fix:** _create_demo_order cancels any previous picking orders for the same picker_id before creating new one. demo/stop with no body also cancels all orphaned Demo (%) orders.

**Recurrence:** 2 sessions
**Effort:** S
"@ @("qol","resolved") "Core Pick Flow Stable" $true

Issue "QOL-009: Physical nav card for picker confirmation [RESOLVED]" @"
**Symptom:** Physical-demo scenario requires laminated card with NAV:CONFIRM / NAV:SKIP / NAV:BACK / NAV:HELP QR codes.

**Fix:** build_nav_card() added to tools/generate_test_barcodes.py — A4 landscape, 2x2 grid, correct corner positions.

**Effort:** XS
"@ @("qol","resolved") "BTT Feature Branch" $true

Issue "QOL-006: No platform/UA logged on camera failure — blind diagnosis [RESOLVED]" @"
**Symptom:** Camera failures on Samsung produced no server-visible diagnostics. Required manual console inspection on device.

**Fix:** Log UA, constraints attempted, error name and message, and stream settings to console on every camera open.

**Commit:** 3937298
**Recurrence:** 2 sessions
**Effort:** S
"@ @("qol","resolved","mobile") "Foundation (sessions 1-5)" $true

Issue "QOL-005: Scan log lost on pod restart — in-memory only [RESOLVED]" @"
**Symptom:** /api/scan-log returns [] after any pod restart. Diagnosis requires a live session.

**Fix:** On each scan, LPUSH to Redis scan-ledger key (capped at 100, 1hr TTL). On startup, _restore_scan_ledger() loads from Redis. Redis failure is non-fatal.

**Recurrence:** Every deploy
**Effort:** S
"@ @("qol","resolved","ci-infra") "Foundation (sessions 1-5)" $true

Issue "QOL-004: /mobile and /demo routes return 404 via Cloudflare tunnel [RESOLVED]" @"
**Symptom:** Navigating to https://bobstinytreasures.snwbd.com/mobile returned 404. Root cause of the entire scanner investigation.

**Fix:** Add location /mobile and location /demo SPA passthrough blocks to nginx config.

**Commit:** 4061e01
**Effort:** XS
"@ @("qol","resolved","ci-infra") "Foundation (sessions 1-5)" $true

Issue "QOL-003: CI silently skips build on non-server commits [RESOLVED]" @"
**Symptom:** Pushing commits outside server/** or k8s/** produced no new image. Looked like deploy was stale. Wasted 3+ empty trigger commits.

**Fix:** Remove paths filter from build-server-images.yml.

**Commit:** b071a1a
**Effort:** XS
"@ @("qol","resolved","ci-infra") "Foundation (sessions 1-5)" $true

Issue "QOL-002: Samsung Android — black camera frame on deviceId:exact [RESOLVED]" @"
**Symptom:** Camera shows black/no video on Samsung Android Chrome when using deviceId:exact.

**Fix:** Never use deviceId:exact on auto-open. Always use facingMode:environment. deviceId:exact only for explicit user camera switch.

**Commit:** 0fd3011
**Recurrence:** 2 sessions
**Effort:** S
"@ @("qol","resolved","mobile") "Foundation (sessions 1-5)" $true

Issue "QOL-001: Phone gets stale JS after deploy — hard refresh required [RESOLVED]" @"
**Symptom:** After every deploy, phones serve old JS until the user manually hard-refreshes.

**Fix:** Cache-Control: no-store on index.html so every new connection fetches current asset hashes.

**Commit:** 0fd3011
**Recurrence:** Every deploy
**Effort:** XS
"@ @("qol","resolved","mobile","ci-infra") "Foundation (sessions 1-5)" $true

# ── ARCH ─────────────────────────────────────────────────────────────────────

Issue "ARCH-001: Structured debug/trace harness — PV_LOG_LEVEL 0-5 across all modules" @"
Every module going forward must have a full debug harness with discrete log levels.

**Levels:**
- 0 OFF — nothing (production default)
- 1 ERROR — unhandled exceptions only
- 2 WARN — recoverable errors, fallbacks
- 3 INFO — key lifecycle events (session start/stop, order created, scan received)
- 4 DEBUG — all API calls in/out, state transitions, timing
- 5 TRACE — full function-boundary tracing, every entry/exit with args and return value

**Activation:**
- Python: PV_LOG_LEVEL=5 env var in pod configmap (no rebuild needed)
- React: window.__PV_LOG_LEVEL = 5 in browser DevTools
- Future: PUT /api/log-level endpoint from supervisor UI

**Scope:** api_gateway, order_service, event_processor, websocket_hub, all web_ui React hooks.
**Priority:** Apply to all new modules from session 13 forward. Retrofit during refactors.
**Effort:** L total (S per new module, M per existing retrofit)
"@ @("arch","open") "Demo Ready"

Issue "ARCH-002: THA Protocol — all bug fixes require Russ hardware sign-off before closed" @"
No bug is considered fully closed until Russ has tested it on real hardware, deliberately triggering all relevant failure paths.

**Protocol:**
1. Bob closes bug in code and writes THA test steps in SESSION.md with [THA needed] tag
2. Russ runs test on real hardware (Samsung phone, laptop browser, or relevant device)
3. Russ deliberately triggers failure modes from the graceful-handling table
4. Only Russ signs off — then item marked done
5. New failure modes found by Russ = new bug entry, cycle restarts

**Effective:** session 8 forward. Retroactively applied to all session 8 bug fixes.
**Effort:** 0 — process change, not a code change
"@ @("arch","needs-russ") "Demo Ready"

# ── PROJECT MILESTONES (as tracking issues) ───────────────────────────────────

Issue "MILESTONE: 3 flawless end-to-end picks on real hardware — signed off by Russ [CLOSED]" @"
Session 10 (2026-08-01): First time the complete pick flow ran without a single mechanical failure on real hardware.

- Correct scan -> ConfirmOverlay -> Picked! gate -> resume scanning
- Wrong scan -> yellow bbox rejection, scan loop continues, no false confirm
- Last pick -> Order complete gate -> Accept -> next order assigned
- All 3 orders completed in sequence

This is the foundation everything else builds on.

**Signed off by:** Russ Conner, 2026-08-01
"@ @("milestone","resolved") "Core Pick Flow Stable" $true

Issue "MILESTONE: 2 clean pick-to-pack runs — full flow signed off by Russ [CLOSED]" @"
Session 11 (2026-08-01): 2 clean end-to-end pick-to-pack runs confirmed on real hardware.

- Pick all items -> order-complete gate -> Accept -> PackWizard opens automatically
- Tote overview -> layer verification -> Order Packed!
- Second run identical — not a fluke

Note: Single-layer packing only tested (one set of props). Multi-layer / multi-tote flow deferred until second prop set available.

**Signed off by:** Russ Conner, 2026-08-01
"@ @("milestone","resolved") "Core Pick Flow Stable" $true

Issue "MILESTONE: Load-gen validated — 20 virtual pickers, 2 clean runs [CLOSED]" @"
Session 13 (2026-08-01): Load generator deployed to BTT cluster. Ran 2x runs of 20 virtual pickers.

- All pickers registered, demo sessions started, scan loops ran, orders advanced
- Clean stats confirmed in supervisor Load Gen tab (picks_confirmed, scans_sent, 0 errors)
- Two bugs found and fixed during runs: log_ring formatTime crash, ReadTimeout on product lookups
- TOCTOU analysis completed and logged as QOL-034 (resolved within demo scope assumption)

**Validated:** Russ Conner, 2026-08-01
"@ @("milestone","resolved","load-gen","session-13") "Load Gen + Observability" $true

# ---------------------------------------------------------------------------
# 4. Summary
# ---------------------------------------------------------------------------
Write-Host "`n[4/4] Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Issues created : $count"
Write-Host "  Milestones     : $($ms.Count)"
Write-Host "  Labels         : $($labelDefs.Count)"
Write-Host ""
Write-Host "Your issues are live at:"
Write-Host "  https://github.com/$Owner/$Repo/issues" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now go to GitHub and create the Project board:"
Write-Host "  https://github.com/$Owner/$Repo/projects -> New project -> Board"
Write-Host "  Use 'Todo / In Progress / Done' columns and filter by milestone or label."
Write-Host ""
Write-Host "Suggested columns:"
Write-Host "  Done (resolved)    - filter: label:resolved"
Write-Host "  In Progress        - filter: label:session-13 is:open"
Write-Host "  Needs Russ (THA)   - filter: label:needs-russ OR label:tha"
Write-Host "  Open               - filter: label:open milestone:'Demo Ready'"
