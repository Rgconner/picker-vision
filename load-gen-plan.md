# Load Generator — Multi-Picker Simulator Plan

## Overview

Add a **Load Generator** tab to the existing React Supervisor UI that spawns N
simulated picker agents running entirely in the browser.  Each agent faithfully
reproduces the full lifecycle of a real mobile picker — including realistic scan
noise — so the server cannot distinguish simulated traffic from a real warehouse
floor.

The tab is **supervisor-only**, ships inside the existing web UI Docker image,
and surfaces per-agent metrics alongside live server-side counters so a human
operator or an automated regression check can confirm both sides of the pipe
match.

---

## Authentic Scan Behaviour — Design Decisions

Real pickers produce scan events that differ from "one barcode per POST":

| Behaviour | Simulation approach |
|---|---|
| **Multi-item scan** — camera briefly sees 2–3 barcodes at once | Each detection POST may contain multiple `detections[]` entries drawn from a configurable burst probability (default 25 %) |
| **Miscan / wrong product** — picker grabs the wrong item first | Per-scan configurable `misscanRate` (default 10 %): emit a detection whose `value` is a random non-target BTT barcode; next tick send the correct one |
| **Duplicate scan** — same barcode seen on two consecutive frames | Per-event `duplicateRate` (default 15 %): emit the same barcode twice in the same `detections[]` array (coalesce window behaviour) |
| **Staging region included** — real phones also report the staging QR code | Each POST probabilistically (default 60 %) includes a `staging_regions[]` entry matching the order's staging code with realistic boundary points and area |
| **Realistic bbox geometry** — values match a 640×480 camera frame | Each detection has a randomly-placed, realistically-sized bounding box inside a virtual 640×480 viewport |
| **Coalesce timing jitter** — network + processing delay varies | Each simulated POST is delayed by a Gaussian-distributed jitter (mean=scanIntervalMs, σ=20 %) mimicking human hand speed variation |
| **Offline queue** — real client buffers events when WS is lost | Sim agent implements the same offline queue from `useMobilePickerSession` |

---

## Full Picker Lifecycle (per agent)

```
register → heartbeat loop (25 s)
       ↓
open WS /ws/sim-NN
       ↓
POST /api/demo/start  { mode: personal, picker_id: sim-NN }
       ↓
┌─────────────────────────────────────────────────────┐
│  GET /api/orders/{order_id}  (fetch pending lines)  │
│       ↓                                             │
│  for each pending line:                             │
│    maybe: POST wrong barcode (miscan)               │
│    maybe: POST 2–3 barcodes together (multi-scan)   │
│    POST correct barcode  ← detection event          │
│    wait for WS enriched ack  (or timeout 3 s)       │
│    PATCH /api/orders/{id}/lines/{line_id}   (pick)  │
│    jitter delay                                     │
│  POST /api/demo/advance  (order complete)           │
└─────────────────────────────────────────────────────┘
       ↓
loop until demo session done or Stop pressed
```

---

## Sub-Task 1 — `useSimulatedPicker` hook

### Intent
Encapsulate one simulated picker agent as a reusable React hook.  It owns the
register / heartbeat / WebSocket / scan-loop / pick-confirm / advance lifecycle
for a single `picker_id`, applying the authentic noise model above.  It is the
direct counterpart of `useMobilePickerSession` but timer-driven rather than
camera-driven, and it exposes observable metrics.

### Expected Outcomes
- New file `server/web_ui/src/useSimulatedPicker.ts`.
- Exports `useSimulatedPicker(config: SimPickerConfig): SimPickerHandle`.
- `SimPickerConfig` fields:
  - `pickerId: string`
  - `scanIntervalMs: number` (default 800)
  - `misscanRate: number` (0–1, default 0.10) — probability a wrong product is
    sent before the correct one on any given line
  - `multiScanRate: number` (0–1, default 0.25) — probability an event contains
    2–3 barcodes simultaneously
  - `duplicateRate: number` (0–1, default 0.15) — probability the target
    barcode appears twice in one `detections[]`
  - `stagingRate: number` (0–1, default 0.60) — probability a `staging_regions`
    entry accompanies a detection POST
  - `mistakeProbability: number` (passed to `demo/start`, default 0)
  - `autoStart: boolean` — whether the hook calls `demo/start` itself
- `SimPickerHandle` exposes:
  - `state: SimPickerState` — reactive snapshot
  - `start() / stop()` — imperative controls (called by the parent view)
- `SimPickerState` fields:
  - `status: 'idle' | 'registering' | 'running' | 'done' | 'error'`
  - `connected: boolean` — WS open
  - `currentOrderId: string | null`
  - `ordersCompleted: number`
  - `scansSent: number` — total detection POSTs issued
  - `barcodesInLastScan: number` — size of the last `detections[]` array
  - `picksConfirmed: number` — successful PATCH calls
  - `miscans: number` — deliberate wrong-barcode events sent
  - `multiScans: number` — events with 2+ barcodes
  - `errors: number` — HTTP errors + WS reconnects
  - `lastEventAt: string | null` — ISO timestamp
  - `lastWsMessageAt: string | null`
- Detection payload construction mirrors `useMobilePickerSession` exactly:
  `symbology`, `value`, `bbox` (random 640×480 region), `centre`, `type`,
  `staging_code`, `corners` (4 points around bbox), `active: true`.
- Staging region payload mirrors the real client: `staging_code`,
  `boundary_points` (4-point polygon), `centre`, `area`.
- The hook respects the same 300 ms coalesce window that the real client uses —
  multi-item scans are injected into the same coalesce buffer flush.

### Relevant Context
- `server/web_ui/src/useMobilePickerSession.ts` — register/heartbeat/WS/
  coalesce pattern to replicate exactly.
- `server/web_ui/src/types.ts` — `Detection`, `StagingRegion`, `PickerState`,
  `OrderLine` types.
- `server/order_service/main.py` lines 1136–1141 — `_BTT_PRODUCTS` list (9
  products) and `_BTT_STAGING` codes (`TINY`, `WOND`, `CHRM`).
- `server/event_processor/main.py` lines 146–170 — detection event schema and
  ledger entry shape that the server expects.
- `server/api_gateway/main.py` lines 267–306 — register endpoint; note the
  409 conflict on duplicate device.

### Status
[x] done — `server/web_ui/src/useSimulatedPicker.ts`

---

## Sub-Task 2 — `LoadGenView` React component

### Intent
Render the Load Generator tab.  The supervisor configures the swarm, starts it,
watches per-agent metrics alongside live server counters, and triggers
assertions for regression checks.

### Expected Outcomes
- New file `server/web_ui/src/LoadGenView.tsx`.
- Configuration panel, swarm table, server telemetry strip, assertion panel.

### Relevant Context
- `server/web_ui/src/ManagementView.tsx` — full-page dark-theme layout pattern.
- `server/web_ui/src/SystemView.tsx` — counter rendering from telemetry.
- `server/web_ui/src/DemoControls.tsx` — `demo/start` and `demo/stop` call patterns.
- `server/web_ui/src/useSystemHealth.ts` — telemetry hook to import and reuse.

### Status
[x] done — `server/web_ui/src/LoadGenView.tsx`

---

## Sub-Task 3 — Wire `LoadGenView` into `App.tsx`

### Intent
Register the Load Generator as a new supervisor-only navigation tab so it is
accessible from the header and protected from guest and picker roles.

### Expected Outcomes
- `App.tsx` has a new `'load-gen'` entry in the `SupervisorMode` union.
- `SUPERVISOR_TABS` includes `{ id: 'load-gen', label: '⚡ Load Gen' }`.
- The tab is filtered out for guests using the same guard as the Management tab.
- The `<main>` block renders `<LoadGenView auth={auth} />` when active.
- Active-state highlight uses the `#7c5cd8` purple family (matches Management).

### Relevant Context
- `server/web_ui/src/App.tsx` — `SupervisorMode` type, `SUPERVISOR_TABS`, tab
  render, guest filtering, and `<main>` render switch.

### Status
[x] done — `server/web_ui/src/App.tsx`

---

## Sub-Task 4 — `GET /api/load-gen/assert` endpoint + CI script

### Intent
Add a server-side assertion endpoint so the same regression check works from
the browser UI **and** from a headless CI step — no test runner required.  A
companion PowerShell script automates the full start → wait → assert → exit
cycle for GitHub Actions.

### Expected Outcomes
- New route `GET /api/load-gen/assert` in `server/api_gateway/main.py`.
- New file `tools/load-gen-assert.ps1`.
- `README.md` updated with a "Load Generator & Automated Regression" section.

### Relevant Context
- `server/api_gateway/main.py` lines 604–631 — `_collect_telemetry()` async
  helper; the new route handler calls this directly.
- `server/api_gateway/main.py` lines 547–552 — `/api/scan-log` for the exact
  API-key guard pattern to copy.

### Status
[x] done — `server/api_gateway/main.py`, `tools/load-gen-assert.ps1`, `README.md`

---

## Implementation Order

1. **Sub-Task 1** (`useSimulatedPicker`) ✓
2. **Sub-Task 2** (`LoadGenView`) ✓
3. **Sub-Task 3** (wire into `App.tsx`) ✓
4. **Sub-Task 4** (assertion endpoint + CI script) ✓

---

## Noise Model — Default Parameters Summary

| Parameter | Default | Purpose |
|---|---|---|
| `scanIntervalMs` | 800 ms | Base time between scan events |
| Jitter | ±20 % Gaussian | Human hand speed variation |
| `misscanRate` | 10 % | Wrong product before correct one |
| `multiScanRate` | 25 % | Multiple barcodes in one event |
| `duplicateRate` | 15 % | Same barcode twice in one event |
| `stagingRate` | 60 % | Staging region included in event |
| Burst size when multi | 2–3 barcodes | From BTT catalogue, non-target |
| Coalesce window | 300 ms | Matches real mobile client exactly |
| WS ack timeout | 3 s | Before proceeding without enrichment |
| Heartbeat | 25 s | Matches real mobile client exactly |
