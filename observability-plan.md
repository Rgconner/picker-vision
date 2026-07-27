# Observability Improvements — Scan Debugging

## Overview

Add targeted instrumentation so that when a real-world scan doesn't behave as
expected, you can immediately see *where* in the pipeline it went wrong and *why*.

The focus is the scan event path:
```
Camera/mobile → Pi/browser → API Gateway → Event Processor → Redis → WebSocket Hub → Browser
```

Three deliverables:
1. **Trace ID** threaded through every hop so a single scan can be followed end-to-end
2. **Scan event ledger** — rolling store of the last 100 scan events with outcome, timing,
   and where any failure occurred; exposed via `GET /api/scan-log`
3. **UI** — compact summary panel on the Supervisor tab + full detail table in System tab

Silent exception handlers are fixed as a prerequisite because they currently hide the
most important errors.

No external dependencies added (no OpenTelemetry, no structlog). All changes use stdlib
logging and in-memory structures that fit the existing architecture.

---

## Decisions Log

| # | Decision |
|---|----------|
| 1 | Trace ID = short 8-char hex, generated at first hop (Pi/mobile), propagated in event body |
| 2 | Scan ledger is in-memory on event_processor (same pattern as _COUNTERS), capped at 100 entries |
| 3 | Ledger exposed via new `GET /api/scan-log` gateway endpoint |
| 4 | Supervisor tab: compact "last 5 scans" strip with outcome badges |
| 5 | System tab: full scan log table with filtering by picker/outcome |
| 6 | Silent except handlers replaced with logger.warning/error calls first |
| 7 | Latency tracked: total event processing time and order-service call time |
| 8 | New counter: events_enriched (distinct from events_processed) to show drop-off |

---

## Sub-Tasks

---

### Sub-Task 1 — Fix silent exception handlers

**Intent**
Six `except: pass` / `except Exception: pass` handlers currently swallow errors
completely. Replace each with a `logger.warning` or `logger.error` call so the log
ring captures the failure. This is the single highest-value change — it surfaces
problems that are currently completely invisible.

**Locations to fix**

| File | Approx line | What | Fix |
|------|------------|------|-----|
| `api_gateway/main.py` | ~211 | WebSocket proxy failure | `logger.warning("WS proxy error picker=%s: %s", picker_id, e)` |
| `api_gateway/main.py` | ~416 | Demo stop JSON parse | `logger.debug("demo/stop: no JSON body")` |
| `websocket_hub/main.py` | ~122 | Redis Pub/Sub thread crash | `logger.error("Pub/Sub listener crashed: %s", e, exc_info=True)` — then restart thread |
| `websocket_hub/main.py` | ~194 | JSON decode on snapshot | `logger.warning("Bad JSON in snapshot: %s", e)` |
| `event_processor/main.py` | ~356 | Broadcast lock_staging to Pi | `logger.debug("lock_staging broadcast failed (best-effort): %s", e)` |
| `log_ring.py` | ~50 | Log ring emit failure | `sys.stderr.write(...)` — cannot use logger here (re-entrant) |

**Expected Outcomes**
- WebSocket disconnects and proxy failures appear in the API Gateway log ring
- Redis Pub/Sub thread restarts automatically if it crashes (websocket_hub)
- All six swallowed exceptions now produce a visible log entry
- No behaviour change for the happy path

**Todo List**
1. In `api_gateway/main.py` WebSocket proxy: add `logger.warning` in the outer `except`
2. In `websocket_hub/main.py` Pub/Sub thread: add `logger.error` and restart the thread
   in a loop rather than silently dying
3. In `websocket_hub/main.py` snapshot decode: add `logger.warning`
4. In `event_processor/main.py` lock_staging broadcast: add `logger.debug`
5. In `log_ring.py`: replace silent `except Exception: pass` with `sys.stderr.write`

**Relevant Context**
- `server/event_processor/main.py` line 356 — `except Exception: pass`
- `server/api_gateway/main.py` line ~211 — WebSocket proxy outer except
- `server/websocket_hub/main.py` line ~122 — Pub/Sub `_run()` thread
- Each service already has `import logging; logger = logging.getLogger(...)`
  check for the variable name before adding calls

**Status** — `[ ] pending`

---

### Sub-Task 2 — Add trace IDs to detection events

**Intent**
Every detection event gets a short `trace_id` (8-char hex UUID prefix) at its origin
(Pi node or mobile browser). The trace_id flows unchanged through every service hop
and appears in every log line and scan ledger entry for that event. When a scan
doesn't register, the trace_id lets you find the event in any log ring and see exactly
where it stopped.

**Backend changes (event_processor/main.py)**
- Read `trace_id` from incoming event body (default `"no-trace"` if absent)
- Include `trace_id` in all `logger.*` calls made for that event
- Include `trace_id` in the enriched payload stored in Redis and published to Pub/Sub
- Include `trace_id` in the `POST /events/detection` response

**Frontend changes (useMobilePickerSession.ts)**
- Generate a `trace_id` per published event: `Math.random().toString(16).slice(2, 10)`
- Include it in the body sent to `POST /events/detection`

**Pi node changes (pi-node/event_publisher.py)**
- Generate `trace_id` per event (same approach: `uuid.uuid4().hex[:8]`)
- Include in event body

**Expected Outcomes**
- Every scan event has a unique `trace_id` visible in logs and ledger
- Can grep the log ring for a trace_id to see where an event died
- No behaviour change if trace_id is absent (graceful default)

**Todo List**
1. In `event_processor/main.py`: extract `trace_id` from body at top of handler;
   add `import logging; logger = logging.getLogger("event_processor")` if not present;
   use it in all log calls within `receive_detection`
2. In `event_processor/main.py`: include `trace_id` in `enriched_payload` dict
3. In `useMobilePickerSession.ts`: add trace_id generation and include in publish body
4. In `pi-node/event_publisher.py`: add `trace_id = uuid.uuid4().hex[:8]` per event

**Relevant Context**
- `server/event_processor/main.py` line 114 — `receive_detection` entry point
- `server/web_ui/src/useMobilePickerSession.ts` — `publish()` function
- `pi-node/event_publisher.py` — event publish loop

**Status** — `[ ] pending`

---

### Sub-Task 3 — Structured logging in event_processor + new counters

**Intent**
Add explicit `logger.*` calls inside `receive_detection` so that every scan leaves
a trace in the log ring. Add two new counters to separate "received" from "successfully
enriched" from "order-service errors", and track latency for the order-service calls.

**New log lines to add (event_processor/main.py)**

```python
# On entry
logger.info("detect trace=%s picker=%s barcodes=%s",
            trace_id, picker_id, [d["value"] for d in detections if d.get("type")=="product"])

# After order-service call fails
logger.warning("order-service GET /orders returned HTTP %d trace=%s", resp.status_code, trace_id)

# After enrichment: log each barcode outcome
for d in enriched_detections:
    logger.debug("enrich trace=%s barcode=%s outcome=%s order=%s",
                 trace_id, d["value"], d["status"], d.get("order_id","—"))

# On order completion detected
logger.info("order_complete trace=%s picker=%s order=%s staging=%s",
            trace_id, picker_id, order_complete_pending_id, order_complete_staging_code)

# On validation
logger.info("validate trace=%s picker=%s correct=%d missing=%d unexpected=%d",
            trace_id, picker_id, len(correct), len(missing), len(unexpected))
```

**New counters**
Add to `_COUNTERS` dict:
- `events_enriched` — incremented only when enrichment fully succeeded (vs `events_processed`)
- `order_service_timeouts` — separate from generic `order_service_errors`
- `validations_requested` — how many validate actions processed
- `orders_completed_detected` — how many times order completion was detected

**Expected Outcomes**
- Log ring shows meaningful per-scan entries for every event
- `events_received` vs `events_enriched` vs `events_processed` shows drop-off clearly
- Order service call failures produce a visible log warning with trace_id
- Supervisor/System tab displays the new counters automatically (no UI change needed —
  ServiceCard already renders all `svc.counters` entries dynamically)

**Todo List**
1. Add `import logging; logger = logging.getLogger("event_processor")` at top of
   `event_processor/main.py` (check if already present first)
2. Add 4 new counter keys to `_COUNTERS`
3. Add `logger.info` on event entry (barcodes list)
4. Add `logger.warning` on order-service HTTP errors
5. Add `logger.debug` for each enriched barcode outcome
6. Add `logger.info` on order completion detected
7. Add `logger.info` on validation with counts
8. Increment new counters at appropriate points

**Relevant Context**
- `server/event_processor/main.py` — full file already read; line numbers known
- `server/web_ui/src/SystemView.tsx` line 73 — `ServiceCard` renders all counters
  dynamically; new counters appear automatically

**Status** — `[ ] pending`

---

### Sub-Task 4 — Scan event ledger (backend)

**Intent**
Add an in-memory rolling ledger of the last 100 scan events to `event_processor`.
Each entry records: trace_id, picker_id, timestamp, barcodes seen, outcome per barcode
(correct/unexpected/unknown), total processing time in ms, order completion detected,
validation result if any, and any error that occurred.

Expose the ledger via `GET /scan-log` on the event processor and proxy it through
the API gateway as `GET /api/scan-log`.

**Ledger entry structure**
```python
{
    "trace_id":          str,          # 8-char hex
    "picker_id":         str,
    "ts":                float,        # epoch seconds (for sorting)
    "time":              str,          # HH:MM:SS.mmm
    "barcodes":          list[str],    # all product barcodes in the event
    "outcomes": [                      # per-barcode result
        {"barcode": str, "result": "correct"|"unexpected"|"unknown", "order_id": str|None}
    ],
    "processing_ms":     int,          # wall time from entry to Redis publish
    "order_completed":   str | None,   # order_id if completion detected
    "validation":        dict | None,  # {correct, missing, unexpected} counts
    "error":             str | None,   # set if an exception occurred
}
```

**New endpoint (event_processor/main.py)**
```
GET /scan-log?limit=N    → last N entries (default 50, max 100), newest first
```

**New gateway proxy (api_gateway/main.py)**
```
GET /api/scan-log?limit=N  → proxies to event_processor /scan-log
```

**Expected Outcomes**
- `GET /api/scan-log` returns the last 50 scan events with full trace
- A scan that produced no detection shows up with empty `barcodes` list
- A scan where order-service timed out shows `error` field set
- Processing latency visible per event

**Todo List**
1. Add `import collections` to `event_processor/main.py` (likely already present)
2. Add `_scan_ledger: collections.deque[dict] = collections.deque(maxlen=100)` module-level
3. At start of `receive_detection`: record `t0 = time.monotonic()`; build ledger entry dict
4. Populate ledger entry throughout handler (trace_id, barcodes, outcomes, etc.)
5. At end of handler (in a `finally` block): compute `processing_ms`, append to ledger
6. Add `GET /scan-log` endpoint returning `list(_scan_ledger)` reversed, sliced to `limit`
7. Add `GET /api/scan-log` proxy route to `api_gateway/main.py`

**Relevant Context**
- `server/event_processor/main.py` — `receive_detection` handler (lines 114–323)
- `server/api_gateway/main.py` line ~397 — end of proxy routes block to insert after

**Status** — `[ ] pending`

---

### Sub-Task 5 — Scan log UI: Supervisor tab strip + System tab full table

**Intent**
Surface the scan ledger in two places:

**A. Supervisor tab — compact strip (`DemoControls.tsx` or new `ScanStrip.tsx`)**
Shows the last 5 scan events as a compact row of outcome badges below the demo panel.
Each badge shows: picker initials · barcode (truncated) · outcome colour
(green=correct, red=unexpected, yellow=unknown, grey=empty).
Refreshes every 3 s alongside demo status polling.

**B. System tab — full scan log table (`SystemView.tsx`)**
A new collapsible section "Recent Scan Events" added below the log viewer.
Table columns: Time · Trace · Picker · Barcodes · Outcome · Ms · Order · Error
Filter controls: picker_id dropdown + outcome filter (all/correct/unexpected/error).
Shows last 50 entries, newest first. Refreshes every 5 s.

**New TypeScript types to add (`types.ts`)**
```typescript
export interface ScanOutcome {
  barcode:  string;
  result:   'correct' | 'unexpected' | 'unknown';
  order_id: string | null;
}

export interface ScanLogEntry {
  trace_id:        string;
  picker_id:       string;
  ts:              number;
  time:            string;
  barcodes:        string[];
  outcomes:        ScanOutcome[];
  processing_ms:   number;
  order_completed: string | null;
  validation:      { correct: number; missing: number; unexpected: number } | null;
  error:           string | null;
}
```

**Expected Outcomes**
- Supervisor tab shows last 5 scans at a glance — can see if the live demo is working
- System tab full table lets you filter by picker or outcome to diagnose issues
- Both views update every 3–5 s without page refresh
- A failed/empty scan (no barcodes detected) is visually distinct from a successful one

**Todo List**
1. Add `ScanOutcome` and `ScanLogEntry` to `server/web_ui/src/types.ts`
2. Create `server/web_ui/src/ScanStrip.tsx` — compact 5-entry strip component
3. Import and place `<ScanStrip />` in `SupervisorView.tsx` below `<DemoControls />`
4. In `SystemView.tsx`: add `useScanLog()` hook (inline or separate file) that polls
   `GET /api/scan-log` every 5 s
5. Add "Recent Scan Events" collapsible section to `SystemView.tsx` with full table
6. Add filter state (picker, outcome) to the section
7. Run `npm run build`, fix any type errors

**Relevant Context**
- `server/web_ui/src/SupervisorView.tsx` — insert `<ScanStrip />` after `<DemoControls />`
- `server/web_ui/src/SystemView.tsx` — insert new section after the log viewer section
- `server/web_ui/src/types.ts` — add new interfaces
- `server/web_ui/src/DemoControls.tsx` — already polls `/api/demo/status` every 3 s,
  can share the polling pattern

**Status** — `[ ] pending`

---

## Implementation Order

```
1  Fix silent exceptions      — no new features, highest safety value, do first
2  Add trace IDs              — needed by ledger; frontend + Pi changes are small
3  Structured EP logging      — builds on trace IDs; adds counters visible in System tab immediately
4  Scan ledger backend        — new endpoint; builds on trace IDs + EP logging
5  Scan log UI                — frontend only; depends on Sub-Task 4 endpoint existing
```

Sub-Tasks 1–3 are backend-only (no build required).
Sub-Tasks 4–5 require `npm run build` at the end.
