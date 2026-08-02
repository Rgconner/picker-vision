# Picker Vision — Session Restart Prompt

> Give this entire file to Bob at the start of the next session.
> The cards are yesterday. Load them.

---

## Your first three actions — no exceptions

1. Read `SESSION.md` — current state, last commit, key facts
2. Read `regional-simulation-plan.md` — the active build plan
3. Hit the live APIs to confirm system state:

```powershell
$base = "http://192.168.11.213"; $h = @{"X-API-Key"="changeme"}
(Invoke-WebRequest "$base/health" -UseBasicParsing).Content | python -m json.tool
(Invoke-WebRequest "$base/api/telemetry" -UseBasicParsing -Headers $h).Content | python -m json.tool
```

Do not write a line of code until all three are done.

---

## What we built (8 calendar days, part time)

A three-altitude enterprise demo ecosystem:

- **Tactical** — mobile web barcode scanner replacing dedicated hardware, full
  pick flow, WebSocket enrichment, pack verification
- **Strategic** — Regional Simulation engine generating synthetic pick history,
  store capacity signal, Sterling OMS feedback loop (`GET /api/capacity/store/{id}`)
- **Planning** — predictive capacity model with per-picker velocity profiles,
  HR shift integration, forward-looking capacity forecast

All running on `feature/bobs-tiny-treasures`, namespace `picker-vision-btt`.

---

## Active workstream — Regional Simulation

**Plan file:** `regional-simulation-plan.md`  
**Status:** Plan written, locked, committed. No code written yet.

### Decision made this session (not yet in plan doc)

**ST-4 storage: Option C — Postgres.**

Add Postgres to the BTT overlay now (same as TechZone). Do not use Redis
or order-service HTTP API for RS data. Write the RS generator once, against
Postgres, works in both BTT and TechZone without a storage abstraction.

### Build order

Start here, in this order:

**ST-5 first** — Enable Redis AOF persistence in `k8s/base/redis.yaml`:
- `command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec"]`
- Add 512Mi PVC for `/data`
- Applies to all overlays — safe base change

**ST-4 second** — Add Postgres to BTT overlay + load-gen deps:
- Add `k8s/overlays/bobs-tiny-treasures/postgres.yaml` (copy from techzone-plan.md)
- Add `DATABASE_URL` to BTT configmap patch pointing at in-cluster Postgres
- Add `LOAD_GEN_DATABASE_URL` env var to load-gen deployment
- Create `server/load_gen/requirements.txt` with sqlalchemy + psycopg2-binary
- Update `server/load_gen/Dockerfile` to install requirements

**ST-1 third** — `server/load_gen/simulator.py`:
- Batch generator, RS records, picker salting, bulk Postgres insert
- See `regional-simulation-plan.md` for full data model and preset definitions
- Picker IDs: `RS-01-CHI-001-P1` etc.
- Salt: `sha256(rs_id + timestamp)[:16]`, seeded RNG per picker

**ST-2 fourth** — `server/load_gen/capacity.py` + api-gateway routes:
- `store_capacity_signal()` → ARCH-003 Sterling endpoint shape
- `gantt_data()` → predicted vs actual, σ deviation per bucket
- New routes on load-gen: `/simulations/*`, `/simulations/{rs_id}/gantt`
- New routes on api-gateway: `/api/simulations/*`, `/api/capacity/store/{id}`

**ST-3 last** — `RegionalSimView.tsx`:
- RS selector + Generate button
- Per-store capacity panels with Sterling JSON preview
- Gantt grid: rows=stores, columns=time buckets, σ colour coding
- Tunable σ thresholds (green <1.0, yellow <2.0, red ≥2.0)
- New tab `{ id: 'regional-sim', label: '📊 Stores' }` in App.tsx

---

## Cluster facts (never re-derive)

| Fact | Value |
|---|---|
| kubectl binary | `C:\Users\RussConner\kubectl.exe` |
| Namespace | `picker-vision-btt` |
| API gateway | `http://192.168.11.213` (key: `changeme`) |
| Web UI | `http://192.168.11.214` / `https://bobstinytreasures.snwbd.com` |
| Branch | `feature/bobs-tiny-treasures` |
| Rollback tag | `btt-load-gen-stable` |
| Last commit | `760f745` — regional-simulation-plan.md |
| CI status | Green on all commits |

---

## PowerShell rules (hard-won)

- Never use `&&` — use `; if ($?) { }` or separate statements
- JSON patches always go to a file, use `--patch-file` with kubectl
- Backticks inside here-strings are hostile — write files instead
- When in doubt, use `node script.mjs` for anything complex

---

## Do NOT touch

- `server/load_gen/agent.py` and the live pick loop in `main.py` — intact
- The existing load-gen UI in `LoadGenView.tsx` — add new tab, don't modify
- `server/order_service/main.py` WAL pragma — already SQLite-guarded correctly
- Any prod namespace (`picker-vision`, `picker-vision-test`)

---

## Open plan docs (read in this order if context needed)

1. `regional-simulation-plan.md` — **active, start here**
2. `capacity-signal-plan.md` — capacity signal PoC (feeds into ST-2/ST-3)
3. `techzone-plan.md` — OpenShift overlay (parallel workstream, not active)
4. `BACKLOG.md` — ARCH-003 through ARCH-007 for full context

---

## The ecosystem in one sentence

Tactical pick execution → Strategic capacity signal → Predictive staffing model.
Three altitudes, one running system, eight days.
