# Capacity Signal — Retail Simulation & Sterling Proof of Concept

## Overview

Transform the load generator from a flat stress-test tool into a **retail simulation
engine** that models real store topology: named stores, named pickers with individual
velocity profiles, shift schedules, and fatigue curves.  The simulation accumulates
pick-event metrics in Redis, which feed a live **Capacity Signal** page in the
supervisor UI and a `GET /api/capacity/store/{id}` endpoint that Sterling OMS can
call as a custom sourcing attribute.

The result is a working, running demonstration of ARCH-003 — no mock data, no
slideware. A Sterling developer can `curl` the endpoint mid-simulation and see
exactly what their sourcing rule would receive.

**Branch:** `feature/bobs-tiny-treasures` (no fork — additive on existing demo)  
**Rollback tag:** `btt-load-gen-stable`  
**Namespace:** `picker-vision-btt` (unchanged)

---

## What Changes vs. What Stays

| Component | Change |
|---|---|
| `server/load_gen/agent.py` | Add `PickerProfile` (velocity, fatigue); emit `pick_event` to Redis on each confirmed pick |
| `server/load_gen/main.py` | Replace flat `picker_count` config with `stores[]` topology; add `GET /stores/status` |
| `server/web_ui/src/useSimulatedPicker.ts` | No change — hook is per-picker, topology is above it |
| `server/web_ui/src/LoadGenView.tsx` | Replace flat swarm table with per-store panels |
| `server/web_ui/src/CapacitySignalView.tsx` | **New** — metrics page + Sterling JSON preview |
| `server/api_gateway/main.py` | Add `GET /api/capacity/store/{id}` + proxy to new metrics service |
| `server/order_service/main.py` | Emit `pick_event` to Redis on `PATCH /lines/{id}` confirm |
| `k8s/overlays/bobs-tiny-treasures/` | No change — existing load-gen pod covers everything |
| `load-gen-plan.md` | Unchanged — ST-1..ST-4 remain done |

---

## Sub-Task 1 — Store/Picker Topology in Load Gen

### Intent
Replace the flat `picker_count: N` config with a structured store roster.
Each store has a carrier cutoff and a list of pickers; each picker has a
baseline velocity and a shift-start offset.  The fatigue curve is deterministic
— no ML yet, just a simple empirical function.

### Expected Outcomes

**New file `server/load_gen/store_config.py`**

```python
from dataclasses import dataclass, field

@dataclass
class PickerProfile:
    picker_id:          str
    store_id:           str
    baseline_picks_hr:  float        # e.g. 22.0
    shift_start_offset: int = 0      # seconds after sim start this picker "clocks in"

    def current_velocity(self, shift_elapsed_sec: float) -> float:
        """Picks/hour adjusted for fatigue.

        Flat for first 2 hours, then −5 % per hour elapsed beyond that.
        Floor at 40 % of baseline (picker doesn't stop, just slows).
        """
        hours = shift_elapsed_sec / 3600
        decay = max(0.0, hours - 2.0) * 0.05
        factor = max(0.40, 1.0 - decay)
        return self.baseline_picks_hr * factor

    def pick_interval_sec(self, shift_elapsed_sec: float) -> float:
        """Seconds between picks, with ±15 % Gaussian jitter."""
        import random, math
        base = 3600 / max(1.0, self.current_velocity(shift_elapsed_sec))
        z = math.sqrt(-2 * math.log(random.random())) * math.cos(2 * math.pi * random.random())
        return max(5.0, base + z * base * 0.15)


@dataclass
class StoreConfig:
    store_id:            str
    carrier_cutoff:      str           # "HH:MM" local time, e.g. "17:00"
    pickers:             list[PickerProfile] = field(default_factory=list)
```

**Modified `server/load_gen/main.py`**

- `StartRequest` gains `stores: list[StoreStartConfig]` — list of store + picker roster
- Default preset: 3 stores (8/5/6 pickers, 3/4/1 active) matching the architecture doc
- `GET /stores/status` returns per-store, per-picker live stats including `shift_elapsed_sec` and `current_velocity`

**Modified `server/load_gen/agent.py`**

- `VirtualPicker.__init__` gains `profile: PickerProfile`
- Sleep between picks uses `profile.pick_interval_sec(shift_elapsed)` instead of fixed `scan_interval_ms`
- On each confirmed pick, emit to Redis: `LPUSH pick-events <json>` (trimmed to 10,000 entries)

```python
pick_event = {
    "picker_id":   self.picker_id,
    "store_id":    self.profile.store_id,
    "order_id":    order_id,
    "line_id":     line_id,
    "picked_at":   time.time(),
    "interval_sec": actual_interval,   # wall time for this pick
}
```

### Relevant Context
- Current `server/load_gen/agent.py` — `VirtualPicker`, `PickerStats`
- Current `server/load_gen/main.py` — `StartRequest`, `_tasks`, `_stats`
- `server/web_ui/src/useSimulatedPicker.ts` — unchanged; topology is above the hook

### Status
[ ] not started

---

## Sub-Task 2 — Metrics Accumulation & Capacity API

### Intent
Read the `pick-events` Redis stream and derive per-picker, per-store metrics
in real time.  Expose these as a new internal metrics service (or as routes
on the existing load-gen service — no new pod needed for the demo).  Add the
`GET /api/capacity/store/{id}` endpoint to the api-gateway.

### Expected Outcomes

**New file `server/load_gen/metrics.py`**

```python
"""Derives live capacity metrics from the pick-events Redis list."""

import json, time
from collections import defaultdict, deque
from typing import Any

PICK_EVENTS_KEY = "pick-events"
WINDOW_PICKS    = 10    # rolling window per picker
STORE_WINDOW    = 30    # rolling window per store

def compute_metrics(redis_client, store_configs: dict) -> dict[str, Any]:
    """
    Returns:
      {
        "stores": {
          "CHI-001": {
            "store_id": "CHI-001",
            "carrier_cutoff": "17:00",
            "open_orders": 8,
            "avg_pick_time_min": 4.2,
            "estimated_clear_time": "16:41",
            "accept_new": True,
            "capacity_score": 0.74,
            "pickers": {
              "P-001": {
                "picker_id": "P-001",
                "picks_this_shift": 22,
                "avg_interval_sec": 165,
                "current_velocity_hr": 21.8,
                "fatigue_index": 0.94,
                "shift_elapsed_min": 130,
              }, ...
            }
          }, ...
        },
        "computed_at": "2026-08-02T14:32:00Z"
      }
    """
```

**`capacity_score` formula:**
```
open_capacity_min  = time_to_cutoff_min - (open_orders × avg_pick_time_min)
raw_score          = open_capacity_min / time_to_cutoff_min
capacity_score     = clamp(raw_score, 0.0, 1.0)
accept_new         = capacity_score > 0.20 and time_to_cutoff_min > avg_pick_time_min
```

**New routes on `server/load_gen/main.py`:**

```
GET /metrics              → full metrics dict (all stores)
GET /metrics/store/{id}   → single store metrics
```

**New route on `server/api_gateway/main.py`:**

```python
@app.get("/api/capacity/store/{store_id}")
async def api_capacity_store(store_id: str):
    """Sterling sourcing attribute endpoint — no auth required by design."""
    return await _proxy("GET", f"{LOAD_GEN_URL}/metrics/store/{store_id}")

@app.get("/api/capacity")
async def api_capacity_all():
    return await _proxy("GET", f"{LOAD_GEN_URL}/metrics")
```

**Sterling-shaped response** (what the endpoint actually returns):

```json
{
  "store_id": "CHI-001",
  "open_orders": 8,
  "avg_pick_time_min": 4.2,
  "next_carrier_cutoff": "17:00",
  "estimated_clear_time": "16:41",
  "accept_new": true,
  "capacity_score": 0.74,
  "pickers_active": 3,
  "picks_last_hour": 47,
  "_meta": {
    "computed_at": "2026-08-02T14:32:00Z",
    "data_window_picks": 30,
    "simulation": true
  }
}
```

The `_meta.simulation: true` flag makes it obvious to a Sterling developer this
is demo data — remove for production.

### Relevant Context
- `server/api_gateway/main.py` lines 640–663 — existing load-gen proxy pattern to copy
- Redis is already in the stack (`REDIS_URL` env var, used by event-processor)
- `server/load_gen/main.py` — `_stop_all()` should also `DEL pick-events` on stop

### Status
[ ] not started

---

## Sub-Task 3 — `CapacitySignalView` React Component

### Intent
A new supervisor-only tab that shows per-store capacity panels with live
metrics, a Sterling JSON preview block, and a copy button.  This is the
demo page — everything a Sterling developer needs to see in one view.

### Expected Outcomes

**New file `server/web_ui/src/CapacitySignalView.tsx`**

Layout (three sections):

```
┌─ ⚡ Capacity Signal ─────────────────────────────────────────────┐
│  Live store metrics · updates every 5s                           │
│                                                                  │
│  ┌─ Store CHI-001 — Chicago ───────────────────────────────────┐ │
│  │  Cutoff 17:00  · Clear ~16:41  · ✓ Accept new              │ │
│  │  capacity_score  ████████░░  0.74                           │ │
│  │                                                              │ │
│  │  Picker   Velocity   Fatigue   Shift    Status              │ │
│  │  P-001    22/hr      ▇▇▇▇▇▇▇  2h10m    picking             │ │
│  │  P-004    14/hr      ▄▄▄▄▄░░  5h05m    picking             │ │
│  │  P-017    31/hr      ▇▇▇▇▇▇░  0h45m    picking             │ │
│  └──────────────────────────────────────────────────────────── ┘ │
│                                                                  │
│  ┌─ Sterling Sourcing Payload ─────────────────── 📋 Copy ─── ┐  │
│  │  GET /api/capacity/store/CHI-001                           │  │
│  │  {                                                         │  │
│  │    "capacity_score": 0.74,                                 │  │
│  │    "accept_new": true,                                     │  │
│  │    ...                                                     │  │
│  │  }                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**`SimPickerConfig` fields needed for topology (additive, not breaking):**
- `storeId: string` — which store this picker belongs to
- `baselinePicksPerHour: number` — used to compute fatigue index display

**Wire into `App.tsx`:**
- Add `'capacity'` to `SupervisorMode` union
- Add `{ id: 'capacity', label: '📶 Capacity' }` to `SUPERVISOR_TABS`
- Render `<CapacitySignalView />` when active
- Guest-filtered (same as load-gen and management)

**Polling:**
- `useCapacityMetrics` hook — `GET /api/capacity` every 5s
- Returns `null` when load gen is not running (show "Start load gen to see metrics")

### Relevant Context
- `server/web_ui/src/LoadGenView.tsx` — layout pattern, dark theme, table style to match
- `server/web_ui/src/useSystemHealth.ts` — polling hook pattern to replicate
- `server/web_ui/src/App.tsx` — `SupervisorMode`, `SUPERVISOR_TABS`, guest filter

### Status
[ ] not started

---

## Sub-Task 4 — `LoadGenView` Store Topology Panel

### Intent
Update the existing `LoadGenView` configuration panel to accept a store
roster instead of a flat picker count, and replace the flat swarm table
with a per-store grouped view.  The hook pool (`h0`..`h19`) stays — only
the config layer above it changes.

### Expected Outcomes

**New config UI (replaces `SwarmConfig` fields):**

```
Preset:  [ Simple (3 stores) ▾ ]   or  [ Custom ]

Store    Pickers   Active   Avg velocity   Carrier cutoff
CHI-001  8         3        22/hr          17:00
DET-001  5         4        18/hr          17:00
CLE-001  6         1        28/hr          16:30

[ ▶ Start Simulation ]
```

Three built-in presets:
- **Simple** — 3 stores, 8 pickers total, gentle load (default, matches architecture doc)
- **Busy** — 5 stores, 20 pickers total, high variance between stores (stress test)
- **Edge case** — 2 stores, one overwhelmed (`accept_new: false`), one wide open (shows routing decision clearly)

The flat `sim-01..sim-20` IDs are replaced by `{store_id}-P{n}` (e.g. `CHI-001-P1`).

### Relevant Context
- `server/web_ui/src/LoadGenView.tsx` — `makeConfig`, `poolConfigs`, `padId`, `startSwarm`
- `server/web_ui/src/useSimulatedPicker.ts` — `SimPickerConfig.pickerId` is the only coupling point

### Status
[ ] not started

---

## Implementation Order

1. **ST-1** — `store_config.py`, agent fatigue curve, Redis `pick-events` emit
2. **ST-2** — `metrics.py`, load-gen `/metrics` routes, api-gateway `/api/capacity` endpoint
3. **ST-3** — `CapacitySignalView.tsx`, `useCapacityMetrics` hook, `App.tsx` wiring
4. **ST-4** — `LoadGenView` store topology panel + presets

ST-1 and ST-2 are pure backend — can be built and tested via `curl` before any
frontend work.  ST-3 is the demo-facing deliverable.  ST-4 is polish.

---

## The Demo Script (for Sterling)

1. Open supervisor UI → **⚡ Load Gen** tab
2. Select preset **"Simple (3 stores)"** → **▶ Start Simulation**
3. Switch to **📶 Capacity Signal** tab — watch `capacity_score` update live
4. After 2 minutes: Store CLE-001 has 1 picker, high load → `accept_new: false`
5. Click **📋 Copy** on CHI-001 Sterling payload
6. Paste into terminal: `curl http://192.168.11.213/api/capacity/store/CHI-001`
7. Same JSON. Live. From a running system.

Say: *"This is what your sourcing rule calls. One HTTP GET.
You set a threshold — route to stores where `capacity_score > 0.5`.
The system tells you in real time which stores can take the order."*

---

## Default Preset — "Simple (3 stores)"

| Store | Location | Pickers rostered | Active on sim start | Avg baseline | Cutoff |
|---|---|---|---|---|---|
| `CHI-001` | Chicago | 8 | 3 | 22/hr | 17:00 |
| `DET-001` | Detroit | 5 | 4 | 18/hr | 17:00 |
| `CLE-001` | Cleveland | 6 | 1 | 28/hr | 16:30 |

Picker IDs: `CHI-001-P1` .. `CHI-001-P3`, `DET-001-P1` .. `DET-001-P4`, `CLE-001-P1`  
Total active: 8 pickers — fits within the existing `MAX_PICKERS = 20` pool

---

## What This Is Not

- **Not AI yet** — fatigue curve is a deterministic formula, not a learned model.
  The pick_events Redis stream is the training data collection layer for ARCH-004.
  The ML model gets trained later, on real accumulated data.
- **Not multi-tenant** — all stores share one order-service DB.
  Production would have per-store or per-region DBs.
- **Not a real HR integration** — shift schedules are simulation parameters.
  The integration point (ARCH-004 ST-2) is designed to accept real HR data
  in the same shape as the simulation presets.
