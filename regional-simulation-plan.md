# Regional Simulation Plan — Synthetic Pick History Generator + Store Capacity Dashboard

## Overview

Replace the real-time flat load generator with a **Regional Simulation (RS) engine** —
a batch data generator that synthesises months of realistic pick history for a
named set of stores and pickers, writes it to Postgres, and feeds a live
**Store Capacity Dashboard** in the supervisor UI.

The existing live load-gen (browser hooks firing real API calls) is **preserved
untouched** for the real-time phone demo.  Regional Simulations are a separate
mode: generate history fast, show accumulated metrics, produce the Sterling
capacity signal — no live traffic, no WebSocket connections, no order-service
coupling during generation.

### Key decisions locked

- **Batch generation** — not real-time. 6 months of data generated in seconds.
- **Immutable once generated** — RS history is written once. Start a new RS for
  a new scenario. Same RS always shows the same data.
- **Persistent to Postgres** — survives pod restarts. Required for demo stability.
- **Picker IDs are RS-scoped**: `RS-01-CHI-001-P1` etc. New RS → new IDs → new salt.
- **Picker personalities salted from picker ID** — deterministic. Same picker ID
  always produces the same velocity profile within that RS.
- **Presets only** for now — Simple / Busy / Edge Case. No manual roster editing.
- **Time compression** — configurable months of history; staffing changes and
  holiday surges are a future feature (noted, not built).
- **Gantt grid** — rows = stores, columns = time buckets (hour/day/week),
  cells = predicted vs actual, colour-coded by std-dev deviation, tunable thresholds.

### What is NOT in scope

- Real-time tick simulation (that's the existing load-gen)
- Staffing changes over time / holiday surge modelling (future, noted in BACKLOG)
- Real Sterling OMS connection (ARCH-006, separate workstream)
- TechZone overlay (ARCH-005, separate workstream)

---

## Data Model (new Postgres tables)

Three new tables, added to `server/order_service/models.py`.
Migration handled by `Base.metadata.create_all()` at startup (existing pattern).

```
regional_simulation
  id            UUID PK
  rs_id         VARCHAR  "RS-01", "RS-02" ...  (display label)
  preset        VARCHAR  "simple" | "busy" | "edge"
  months        INT      months of history generated
  generated_at  TIMESTAMP
  config_json   JSONB    full preset config snapshot (stores, pickers, thresholds)
  salt          VARCHAR  hex string seeding all picker RNG for this RS

rs_picker_profile
  id              UUID PK
  simulation_id   UUID FK → regional_simulation
  picker_id       VARCHAR  "RS-01-CHI-001-P1"
  store_id        VARCHAR  "CHI-001"
  baseline_picks_hr  FLOAT
  miscan_rate        FLOAT
  multi_scan_rate    FLOAT
  fatigue_rate       FLOAT  % drop per hour after hour 2
  shift_hours        FLOAT  hours per simulated shift

rs_pick_event
  id              UUID PK
  simulation_id   UUID FK → regional_simulation
  picker_id       VARCHAR
  store_id        VARCHAR
  simulated_at    TIMESTAMP  the synthetic wall-clock time of the pick
  interval_sec    FLOAT      seconds this pick took (post-fatigue, post-jitter)
  predicted_interval_sec  FLOAT  what the capacity model predicted at that moment
  miscan          BOOL
  multi_scan      BOOL
```

---

## Sub-Task 1 — Data model + generator service

### Intent
Add the three new tables to the order-service models and build the batch
generator as a new module in `server/load_gen/`.  The generator takes a
preset and a month count, synthesises the full pick history mathematically
(no HTTP calls, no real orders), and writes directly to Postgres via
SQLAlchemy.

### Expected Outcomes

**New file `server/load_gen/simulator.py`**

Core logic:
- `generate_simulation(preset, months, db_url)` — main entry point
- Assigns `rs_id` (next increment: query MAX(rs_id) + 1)
- Derives `salt` = `sha256(rs_id + str(time.time()))[:16]`
- For each picker, seeds a `random.Random(salt + picker_id)` instance —
  deterministic personality, isolated per picker
- Generates simulated timestamps across the date range:
  - Picks happen during "shift hours" only (configurable per store, default 08:00–20:00)
  - Pick interval = `(3600 / baseline_picks_hr) × fatigue_factor × jitter`
  - `fatigue_factor` = flat for first 2 hrs, then −`fatigue_rate`% per hr, floor 0.40
  - `jitter` = Gaussian ±15% using seeded RNG (looks real, reproducible)
  - `predicted_interval_sec` = interval *without* jitter (what the model would predict)
- Writes all rows in a single bulk insert (SQLAlchemy `bulk_insert_mappings`)
- Returns the completed `RegionalSimulation` record

**Modified `server/load_gen/main.py`**

New endpoints:

```
POST /simulations/start     { preset, months }  → starts generation, returns rs_id
GET  /simulations            → list all RS records (id, rs_id, preset, months, generated_at)
GET  /simulations/{rs_id}   → full RS record + picker profiles
DELETE /simulations/{rs_id} → delete RS and all its pick events
```

`POST /simulations/start` runs the generator synchronously (batch is fast —
6 months × 8 pickers generates ~100k rows in <1s). Returns immediately with
the completed RS record. No background task needed.

**New api-gateway proxy routes (additive to existing load-gen routes):**

```
POST /api/simulations/start
GET  /api/simulations
GET  /api/simulations/{rs_id}
DELETE /api/simulations/{rs_id}
```

### Preset definitions (hardcoded in `simulator.py`)

```python
PRESETS = {
  "simple": {
    "stores": [
      { "store_id": "CHI-001", "name": "Chicago",   "cutoff": "17:00",
        "pickers": [
          { "baseline": 22, "miscan": 0.08, "multi": 0.20, "fatigue": 0.05 },
          { "baseline": 14, "miscan": 0.15, "multi": 0.30, "fatigue": 0.08 },
          { "baseline": 31, "miscan": 0.05, "multi": 0.15, "fatigue": 0.03 },
        ]
      },
      { "store_id": "DET-001", "name": "Detroit",   "cutoff": "17:00",
        "pickers": [
          { "baseline": 18, "miscan": 0.10, "multi": 0.25, "fatigue": 0.05 },
          { "baseline": 20, "miscan": 0.09, "multi": 0.22, "fatigue": 0.04 },
          { "baseline": 16, "miscan": 0.12, "multi": 0.28, "fatigue": 0.06 },
          { "baseline": 24, "miscan": 0.07, "multi": 0.18, "fatigue": 0.04 },
        ]
      },
      { "store_id": "CLE-001", "name": "Cleveland", "cutoff": "16:30",
        "pickers": [
          { "baseline": 28, "miscan": 0.06, "multi": 0.20, "fatigue": 0.04 },
        ]
      },
    ]
  },
  "busy": { ... },    # 5 stores, 20 pickers, high variance
  "edge":  { ... },   # 2 stores: one overwhelmed, one wide open
}
```

Picker IDs auto-assigned: `{rs_id}-{store_id}-P{n}` (e.g. `RS-01-CHI-001-P1`)

### Relevant Context
- `server/order_service/models.py` — existing SQLAlchemy model pattern to follow
- `server/order_service/main.py` lines 43–67 — `DATABASE_URL`, engine setup
- `server/load_gen/main.py` — existing FastAPI app, `_proxy` not needed (direct DB)
- `server/load_gen/Dockerfile` — will need `psycopg2-binary` and `sqlalchemy` added

### Status
[ ] not started

---

## Sub-Task 2 — Capacity metrics derivation

### Intent
From the `rs_pick_event` table, derive the per-store, per-time-bucket
capacity metrics — actual vs predicted — that feed both the Gantt grid
and the Sterling signal endpoint.  This is a query layer, not stored data.

### Expected Outcomes

**New file `server/load_gen/capacity.py`**

```python
def store_capacity_signal(db, rs_id: str, store_id: str) -> dict:
    """
    Current capacity signal for a store — what Sterling would receive now.
    Based on pick events from the last 30 picks in the simulation.
    Returns the ARCH-003 shape:
      { store_id, open_orders (from RS config), avg_pick_time_min,
        next_carrier_cutoff, estimated_clear_time, accept_new,
        capacity_score, pickers_active, picks_last_hour, _meta }
    """

def gantt_data(db, rs_id: str, granularity: str, start: date, end: date) -> dict:
    """
    Returns grid data for the Gantt chart.
    granularity: "hour" | "day" | "week"
    Returns:
      {
        stores: [ store_id, name ],
        buckets: [ ISO timestamp ],
        cells: {
          "{store_id}:{bucket}": {
            actual_picks: int,
            actual_avg_interval_sec: float,
            predicted_picks: int,
            predicted_avg_interval_sec: float,
            deviation_sigma: float,    # how many std-devs from predicted
          }
        },
        std_dev_thresholds: { green: 1.0, yellow: 2.0 }  # tunable
      }
    """
```

**`deviation_sigma` computation:**
```
For each cell:
  mean_predicted = mean(predicted_interval_sec for all picks in bucket)
  stddev         = stddev(predicted_interval_sec for all picks in RS)
  deviation_sigma = abs(actual_avg - mean_predicted) / stddev
```

**New load-gen endpoints:**

```
GET /simulations/{rs_id}/capacity/{store_id}   → current capacity signal
GET /simulations/{rs_id}/capacity              → all stores signal
GET /simulations/{rs_id}/gantt                 → query params: granularity, start, end
```

**New api-gateway routes:**

```
GET /api/simulations/{rs_id}/capacity/{store_id}
GET /api/simulations/{rs_id}/capacity
GET /api/simulations/{rs_id}/gantt
GET /api/capacity/store/{store_id}   ← ARCH-003 endpoint, routes to active RS
```

The `GET /api/capacity/store/{id}` endpoint (ARCH-003) queries the **most
recently generated RS** automatically — no RS ID required in the Sterling call.

### Relevant Context
- `server/load_gen/simulator.py` (ST-1) — `rs_pick_event` schema
- SQLAlchemy aggregate queries — use `func.avg`, `func.stddev_pop`, `func.count`

### Status
[ ] not started

---

## Sub-Task 3 — `RegionalSimView` React component (Gantt + capacity panels)

### Intent
A new supervisor-only tab showing the Regional Simulation dashboard:
RS selector, per-store capacity panels (the Sterling signal view),
and the Gantt grid with predicted vs actual, colour-coded by σ deviation.

### Expected Outcomes

**New file `server/web_ui/src/RegionalSimView.tsx`**

Three panels:

**Panel 1 — RS Control**
```
[ Generate New Simulation ]
  Preset:  [ Simple (3 stores) ▾ ]
  History: [ 3 months ▾ ]  (1 / 3 / 6 / 12)
  [ ▶ Generate ]  ← calls POST /api/simulations/start

Past simulations:
  RS-01  simple  3 months  2026-08-02  [ View ] [ Delete ]
  RS-02  busy    6 months  2026-08-03  [ View ] [ Delete ]
```

**Panel 2 — Capacity Signal (per store, for active RS)**
Identical layout to the Sterling payload preview from `capacity-signal-plan.md`:
```
┌─ CHI-001 — Chicago ──────────────────────────────────────┐
│  Score ████████░░ 0.74  ✓ Accept new  Cutoff 17:00       │
│  Pickers: P1 22/hr ▇▇▇▇▇  P2 14/hr ▄▄▄░░  P3 31/hr ▇▇▇▇▇▇│
│  [ {} Sterling JSON ]  [ 📋 Copy ]                       │
└──────────────────────────────────────────────────────────┘
```

**Panel 3 — Gantt Grid**
```
Granularity: [ Hour | Day | Week ]
Date range:  [ 2026-07-01 ] → [ 2026-08-01 ]   [ Apply ]

           | Mon 28 | Tue 29 | Wed 30 | Thu 31 | Fri 1  |
CHI-001    |  ████  |  ██░   |  ████  |  ███   |  ████  |
DET-001    |  ██░   |  ████  |  ██    |  ████  |  ████  |
CLE-001    |  ░░░   |  ██░   |  ████  |  ██░   |  ████  |

Legend:  ■ Green = ≤1σ  ■ Yellow = ≤2σ  ■ Red = >2σ
         Darker = more picks.  Hover = actual / predicted tooltip.
```

Colour encoding:
- Hue = deviation (green/yellow/red by σ threshold)
- Opacity = pick volume (light = few picks, dark = many)
- Hover tooltip = `actual: N picks, predicted: M picks, deviation: 1.3σ`

**Threshold configuration** — stored in component state, editable inline:
```
σ thresholds:  Green < [ 1.0 ]  Yellow < [ 2.0 ]  Red ≥ 2.0
```

**New hook `server/web_ui/src/useRegionalSim.ts`**
- `GET /api/simulations` on mount — populates RS list
- `GET /api/simulations/{rs_id}/gantt?granularity=day&start=...&end=...` on date/granularity change
- `GET /api/simulations/{rs_id}/capacity` on RS selection
- No polling — data is static once generated. Manual refresh button only.

**Wire into `App.tsx`:**
- Add `'regional-sim'` to `SupervisorMode` union
- Add `{ id: 'regional-sim', label: '📊 Stores' }` to `SUPERVISOR_TABS`
- Render `<RegionalSimView auth={auth} />` when active
- Guest-filtered (same pattern as load-gen and management)

### Relevant Context
- `server/web_ui/src/LoadGenView.tsx` — dark-theme layout, table style, button pattern
- `server/web_ui/src/useSystemHealth.ts` — fetch hook pattern
- `server/web_ui/src/App.tsx` lines 14–25 — SupervisorMode, SUPERVISOR_TABS

### Status
[ ] not started

---

## Sub-Task 4 — Load-gen Dockerfile + dependency update

### Intent
The load-gen pod needs Postgres access (SQLAlchemy + psycopg2) to write
simulation data directly.  Currently it only uses httpx.  Add the deps,
rebuild, confirm the image starts against Postgres.

### Expected Outcomes

**New file `server/load_gen/requirements.txt`**
```
fastapi>=0.110
uvicorn[standard]>=0.29
httpx>=0.27
sqlalchemy>=2.0
psycopg2-binary>=2.9
pydantic>=2.0
```

**Modified `server/load_gen/Dockerfile`**
Add `COPY requirements.txt .` + `RUN pip install -r requirements.txt`
before the `COPY . .` step.

**Environment variable** — load-gen needs `DATABASE_URL` passed in.
Add to `k8s/overlays/bobs-tiny-treasures/configmap-patch.yaml`:
```yaml
LOAD_GEN_DATABASE_URL: "postgresql://picker:picker@order-service-db-svc:5432/picker"
```

Wait — for BTT the DB is SQLite on a PVC, not Postgres.  The simulation
data must go somewhere the load-gen pod can reach.  Two options:

**Option A** — load-gen writes to the same SQLite file via the order-service
HTTP API (no direct DB access — adds endpoints to order-service for RS writes)

**Option B** — load-gen connects directly to the DB (Postgres in TechZone,
SQLite file share in BTT — awkward with RWO PVC)

**Option C** — RS data lives in Redis (LPUSH to `rs:{rs_id}:events`) —
no schema migration, works with BTT today, fast, but not truly persistent
across Redis restarts without AOF

**Decision needed:** For the BTT demo (SQLite, no Postgres yet), where does
RS data persist?

**Recommendation:** Use **Redis with AOF persistence** for the BTT demo.
The RS metadata and pick events go into Redis sorted sets and hashes.
When TechZone overlay (ARCH-005) adds Postgres, swap the storage layer.
The capacity query logic in `capacity.py` gets a storage abstraction
(`RedisStore` / `PostgresStore`) so the switch is clean.

This is the only open decision in the plan.

### Relevant Context
- `server/load_gen/Dockerfile` — current `pip install` pattern
- `k8s/overlays/bobs-tiny-treasures/configmap-patch.yaml` — env vars available to load-gen
- Redis already in the cluster at `redis://redis:6379`

### Status
[ ] not started — pending storage decision above

---

## Sub-Task 5 — BTT k8s: enable Redis AOF persistence

### Intent
Redis in the BTT cluster currently runs with default config (in-memory only,
no persistence).  If RS data lives in Redis, a pod restart wipes everything.
Enable AOF (Append Only File) so RS records survive restarts.

### Expected Outcomes

**Modified `k8s/base/redis.yaml`** — add Redis config:
```yaml
command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]
```

**PVC for Redis** — add a small PVC (512Mi) for the AOF file:
```yaml
volumeMounts:
  - name: redis-data
    mountPath: /data
volumes:
  - name: redis-data
    persistentVolumeClaim:
      claimName: redis-data
```

This is a base change — applies to all overlays.  The BTT overlay already
has a Recreate strategy on order-service.  Redis can use RollingUpdate.

### Relevant Context
- `k8s/base/redis.yaml` — current Redis deployment (no persistence)
- `k8s/overlays/bobs-tiny-treasures/kustomization.yaml` — check if Redis PVC conflicts

### Status
[ ] not started — depends on ST-4 storage decision

---

## Implementation Order

1. **ST-4** — Storage decision + Dockerfile deps (unblocks everything)
2. **ST-5** — Redis AOF (if Redis storage chosen — unblocks ST-1)
3. **ST-1** — Generator + new load-gen endpoints
4. **ST-2** — Capacity query layer + api-gateway routes
5. **ST-3** — `RegionalSimView` + `App.tsx` wiring

ST-1 through ST-2 can be curl-tested before any frontend work.
ST-3 is the demo-facing deliverable — build last, show first.

---

## Future Features (logged, not built)

- **Holiday surge modelling** — configurable multiplier on pick volume for
  date ranges (e.g. Black Friday +3×, Christmas week +2×)
- **Staffing changes over time** — pickers join/leave mid-simulation,
  velocity improves over first 90 days (learning curve)
- **Shift scheduling** — not all pickers work every day; shift patterns
  (Mon–Fri, rotating weekends) affect capacity signal accuracy
- **Predicted staffing levels** — given a demand forecast, what headcount
  does each store need? This is the ARCH-004 payoff.

These are noted in `BACKLOG.md` under ARCH-004. Do not build now.

---

## The Demo in One Paragraph

Supervisor opens **📊 Stores** tab. Selects preset "Simple (3 stores)",
sets history to 3 months, clicks Generate. In under 2 seconds, RS-01 is
created. The Gantt grid shows 90 days of pick history across Chicago,
Detroit, and Cleveland — green cells where stores performed as predicted,
yellow/red where they deviated. The capacity panel shows each store's live
`capacity_score` and `accept_new` flag. The Sterling JSON preview shows
exactly what the sourcing rule would receive. A Sterling developer copies
the `curl` command, runs it, sees the same JSON. The loop is closed.
No live traffic. No orders. No phone. Just data — and the insight it
represents.
