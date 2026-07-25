# Picker Vision — Telemetry, Health Monitoring & Versioning Plan

## Overview

The system consists of an external Raspberry Pi node (running picker vision software on the LAN) and four server-side services deployed in a Kubernetes namespace (`picker-vision`) behind MetalLB:

```
[Raspberry Pi :8080/:8081]  →  [MetalLB IP:80 api-gateway]  →  [event-processor]
                                        ↓                           ↓
                                  [order-service]           [websocket-hub]
                                        ↓                           ↓
                                     [Redis]              [web-ui (browser)]
```

### Root Bug (Why Picker Doesn't Appear on WebUI)

In `vision_service.py`, `publisher.set_stream_url()` and `publisher.set_control_url()` are **never called** before `publisher.register()`. The picker registers with empty `stream_url` and `control_url` fields. The nginx web-ui routes `/stream/{picker_id}` to the api-gateway, which returns HTTP 404 ("not available in Kubernetes mode") because the stream URL stored for the picker is blank.

The Pi must register with its own LAN-reachable URL: `http://<PI_LAN_IP>:8080/stream` and `http://<PI_LAN_IP>:8081`.

### Scope of This Plan

1. **Fix Pi registration** — populate stream/control URLs before register(); auto-detect Pi LAN IP with `STREAM_HOST` override.
2. **Versioning system** — VERSION file per component, root VERSIONS.md changelog, ConfigMap updated from these.
3. **In-memory log ring-buffer** — each service exposes `/logs` endpoint; api-gateway aggregates at `/api/logs/{service}`.
4. **Extended health/telemetry endpoints** — richer `/health` responses (uptime, counters, Redis connectivity, event rates).
5. **WebUI: compact health strip** — permanent red/green status bar across all tabs.
6. **WebUI: System tab** — full telemetry panel (service health cards, event-flow counters, picker registration detail, per-service log viewer).
7. **Bump version numbers** on every file changed by this plan.

---

## Sub-Task 1 — Fix Pi Node Registration (Root Bug)

**Status:** `[x] done`

### Intent
The picker never appears on the WebUI because it registers with blank `stream_url` and `control_url`. This sub-task makes the Pi compute its own LAN IP and set those URLs on the publisher before calling `register()`.

### Expected Outcomes
- Picker appears in the WebUI picker list after startup.
- MJPEG stream loads in the VideoPanel for that picker.
- Registration log shows a non-empty `stream_url` in the payload (visible in debug log).
- `STREAM_HOST` env var / config key overrides auto-detection.

### Todo List
1. Add a `STREAM_HOST` key to `config_loader.py` `DEFAULTS` (default: empty string).
2. Add a `STREAM_PORT` key (default: `"8080"`), and `CONTROL_PORT` already exists (default `"8081"`).
3. Add a helper function `resolve_stream_host(server_url: str, override: str = "") -> str` in a new file `pi-node/network_utils.py`:
   - If `override` is non-empty, return it as-is.
   - Otherwise parse the server URL to extract the host, open a UDP socket toward that host (port 80) without sending data, read `sock.getsockname()[0]` — the OS selects the correct outbound interface automatically. No `STREAM_HOST` default in `start.sh`; probing is always the fallback.
4. In `vision_service.py` (after publisher is constructed, before `register()`):
   - Call `resolve_stream_host()` to get `HOST`.
   - Call `publisher.set_stream_url(f"http://{HOST}:{MJPEG_PORT}/stream")`.
   - Call `publisher.set_control_url(f"http://{HOST}:{CONTROL_PORT}")`.
5. Add `STREAM_HOST` to `start.sh` export list.
6. Add `STREAM_HOST` to `picker.env.template`.

### Relevant Context
- `picker-vision/pi-node/vision_service.py` lines 182–193 — publisher construction and register call
- `picker-vision/pi-node/event_publisher.py` lines 57–61 — `set_stream_url` / `set_control_url` already exist but are never called
- `picker-vision/pi-node/config_loader.py` lines 28–40 — DEFAULTS dict
- `picker-vision/pi-node/start.sh` lines 22–28 — env var exports

---

## Sub-Task 2 — Versioning System

**Status:** `[x] done`

### Intent
Establish a single source-of-truth version for each component. Every time a file in a component is changed, its version is bumped. Versions are visible in the WebUI header strip and the System tab.

### Expected Outcomes
- Each component has a `VERSION` file containing a semantic version string (e.g. `1.1.0`).
- A root `VERSIONS.md` documents the changelog per component.
- Each Python service reads its `VERSION` file at startup and serves it on `/health`.
- The k8s `configmap.yaml` version keys are updated to match the VERSION files.
- The WebUI `package.json` version field matches `web-ui/VERSION`.
- This plan itself triggers a version bump for every component it touches (all of them → `1.1.0`).

### Todo List
1. Create `picker-vision/pi-node/VERSION` with content `1.1.0`.
2. Create `picker-vision/server/api_gateway/VERSION` with content `1.1.0`.
3. Create `picker-vision/server/event_processor/VERSION` with content `1.1.0`.
4. Create `picker-vision/server/websocket_hub/VERSION` with content `1.1.0`.
5. Create `picker-vision/server/order_service/VERSION` with content `1.1.0`.
6. Create `picker-vision/server/web_ui/VERSION` with content `1.1.0`.
7. Update each Python service's `SERVICE_VERSION` assignment to read the VERSION file:
   ```python
   import pathlib
   _VERSION_FILE = pathlib.Path(__file__).parent / "VERSION"
   SERVICE_VERSION = _VERSION_FILE.read_text().strip() if _VERSION_FILE.exists() else os.getenv("SERVICE_VERSION", "unknown")
   ```
8. Update `configmap.yaml` — set all `*_VERSION` keys to `1.1.0`.
9. Update `package.json` `version` field to `"1.1.0"`.
10. Create `picker-vision/VERSIONS.md` — root changelog table with initial entry for `1.1.0`.
11. Fix `picker-vision/k8s/metallb-config.yaml` — update the IP pool range from `192.168.1.200-192.168.1.210` to `192.168.11.200-192.168.11.210` to match the actual `192.168.11.x` subnet where the server lives at `192.168.11.7`.

### Relevant Context
- `picker-vision/k8s/configmap.yaml` lines 15–19 — version keys
- `picker-vision/server/api_gateway/main.py` line 16 — `SERVICE_VERSION`
- `picker-vision/server/event_processor/main.py` line 21 — `SERVICE_VERSION`
- `picker-vision/server/websocket_hub/main.py` line 26 — `SERVICE_VERSION`
- `picker-vision/server/order_service/main.py` line 57 — `SERVICE_VERSION`
- `picker-vision/pi-node/vision_service.py` line 31 — `SERVICE_VERSION`
- `picker-vision/server/web_ui/package.json` line 4 — `version`

---

## Sub-Task 3 — In-Memory Log Ring Buffer (All Services)

**Status:** `[x] done`

### Intent
Each service captures its last 200 log lines in memory and exposes them via a `GET /logs` endpoint. The api-gateway proxies these at `/api/logs/{service}`. This gives the WebUI System tab real-time access to structured logs without needing external log aggregation infrastructure.

### Expected Outcomes
- `GET /logs` on each service returns `{"service": "...", "lines": [...]}` where each entry has `timestamp`, `level`, `logger`, `message`.
- `GET /api/logs/{service}` on the api-gateway proxies to the correct upstream service.
- `GET /api/logs/pi/{picker_id}` proxies through the api-gateway to the Pi node's control server at `http://<control_url>/logs`.
- The Pi control server exposes `GET /logs` returning the same structure.
- Ring buffer size is configurable via `LOG_RING_SIZE` env var (default 200).

### Todo List
1. Create `picker-vision/server/log_handler.py` — a shared `RingBufferHandler` class (Python `logging.Handler` subclass) that stores up to N `LogRecord`s in a `collections.deque`. Expose `get_lines() -> list[dict]` returning serialised records. **Note:** Since each server service is a separate Dockerfile, copy this file into each server service directory (or use a shared base image layer — copying is simpler here).
2. Add `RingBufferHandler` to each server service's logging setup (attach to root logger after `basicConfig`).
3. Add `GET /logs` endpoint to each server service's FastAPI app returning `{"service": SERVICE_NAME, "lines": handler.get_lines()}`.
4. Add `GET /logs` endpoint to the Pi node's FastAPI control app in `vision_service.py` — same structure.
5. Add routes to `api-gateway/main.py`:
   - `GET /api/logs/{service}` — maps service name to URL (order-service, event-processor, websocket-hub) and proxies.
   - `GET /api/logs/pi/{picker_id}` — looks up the picker's `control_url` from Redis and proxies `GET {control_url}/logs`.
   - Add `/api/logs` to the `_API_KEY_EXEMPT` set.
6. Add nginx proxy rule for `/logs/` in `web-ui.yaml` nginx config (route to api-gateway).
7. Add the log routes to the `_API_KEY_EXEMPT` set in api-gateway so they don't require API keys.

### Relevant Context
- `picker-vision/server/api_gateway/main.py` lines 73–95 — `_collect_service_versions()` pattern to follow for multi-service aggregation
- `picker-vision/pi-node/vision_service.py` lines 43–71 — existing FastAPI control app where `/logs` endpoint goes
- `picker-vision/server/websocket_hub/main.py` line 91 — health endpoint pattern
- `picker-vision/k8s/web-ui.yaml` lines 65–118 — nginx config location blocks to extend

---

## Sub-Task 4 — Extended Health & Telemetry Endpoints

**Status:** `[x] done`

### Intent
Enrich each service's `/health` response to include uptime, event counters, connectivity status, and last-activity timestamps. Add an aggregated `/api/telemetry` endpoint to the api-gateway that collects all service telemetries in one call.

### Expected Outcomes
- Each service's `/health` returns:
  ```json
  {
    "status": "ok",
    "service": "...",
    "version": "1.1.0",
    "uptime_seconds": 1234,
    "started_at": "2025-...",
    "counters": { ... }   // service-specific
  }
  ```
- `event-processor` counters: `events_received`, `events_processed`, `order_service_errors`.
- `api-gateway` counters: `pickers_registered`, `events_proxied`, `websocket_connections`.
- `websocket-hub` counters: `active_picker_sockets`, `active_supervisor_sockets`, `messages_broadcast`.
- `pi-node` control `/health` returns: `camera_open`, `frames_captured`, `events_published`, `events_buffered_offline`, `server_online`, `last_event_at`.
- `GET /api/telemetry` on api-gateway returns all service telemetries and picker registry snapshot in one payload.
- `GET /api/telemetry/stream` (SSE endpoint) pushes telemetry updates every 5 seconds to keep the WebUI System tab live without polling.

### Todo List
1. Add a `_started_at` timestamp and `_counters` dict to each service at module level; increment counters at appropriate call sites.
2. Update each `/health` endpoint to include `uptime_seconds`, `started_at`, and `counters` in the response.
3. Add connection-count tracking to `websocket-hub` (increment/decrement on WS connect/disconnect events).
4. Add a `frames_captured` counter and `last_event_at` timestamp to `vision_service.py`; expose them on the `/health` endpoint of the Pi control server.
5. Add `GET /api/telemetry` to `api-gateway/main.py` — collects `/health` from all internal services concurrently (reuse `_collect_service_versions` pattern) and merges with `_redis_list_pickers()`.
6. Add `GET /api/telemetry/stream` (SSE) to api-gateway — `asyncio` loop that collects telemetry every 5 seconds and yields `data: {json}\n\n`.
7. Add nginx proxy rule for `/telemetry/` in `web-ui.yaml`.
8. Add telemetry routes to `_API_KEY_EXEMPT`.

### Relevant Context
- `picker-vision/server/api_gateway/main.py` lines 73–95 — `_collect_service_versions()` concurrent fetch pattern
- `picker-vision/server/websocket_hub/main.py` lines 135–180 — WS connect/disconnect to instrument
- `picker-vision/pi-node/event_publisher.py` lines 269–273 — heartbeat loop, add last-seen tracking
- `picker-vision/pi-node/vision_service.py` lines 104–174 — capture loop, add frames_captured counter

---

## Sub-Task 5 — WebUI: Compact Health Status Strip

**Status:** `[x] done`

### Intent
Add a permanent one-line health status bar visible across all tabs (Operator, Supervisor, System). It shows a green/red/amber dot per service plus the Pi node status, updating every 10 seconds. This gives at-a-glance confidence that the system is healthy without needing to navigate anywhere.

### Expected Outcomes
- A thin bar below the header (or within it) shows icons: `api-gateway ●`, `event-processor ●`, `websocket-hub ●`, `order-service ●`, `redis ●`, `pi-1 ●`.
- Green = healthy, amber = degraded (unreachable but last seen < 2 min), red = offline/error.
- Clicking any indicator navigates to the System tab and scrolls to that service's card.
- The strip re-uses data from `useServiceVersions` hook (already polling `/api/versions`) — extend it to also call `/api/telemetry`.

### Todo List
1. Create `picker-vision/server/web_ui/src/useSystemHealth.ts` — a hook that polls `/api/telemetry` every 10 seconds and returns `{ services: Record<string, TelemetryInfo>, pickers: PickerInfo[] }`.
2. Add `TelemetryInfo` and related types to `types.ts`.
3. Create `picker-vision/server/web_ui/src/HealthStrip.tsx` — a bar component that maps service status to dot colours. Accepts `onServiceClick(name: string) => void` callback.
4. Mount `<HealthStrip>` in `App.tsx` between the header and `<main>`, passing a callback that sets mode to `'system'` and scrolls to the relevant card.
5. Add `'system'` to the `Mode` type in `App.tsx` and wire the System tab button in the header nav.

### Relevant Context
- `picker-vision/server/web_ui/src/App.tsx` lines 8–72 — header, mode state, nav buttons
- `picker-vision/server/web_ui/src/useServiceVersions.ts` — polling pattern to follow
- `picker-vision/server/web_ui/src/types.ts` lines 72–85 — `PickerInfo`, `ServiceVersionInfo`

---

## Sub-Task 6 — WebUI: System Tab (Full Telemetry Panel)

**Status:** `[x] done`

### Intent
A dedicated "System" tab with: service health cards (status, version, uptime, counters), a picker registration table (showing stream URL, control URL, last seen, version), a data-flow diagram showing event counts between components, and a log viewer per service (expandable, last 50 lines).

### Expected Outcomes
- Service Health section: one card per service (api-gateway, event-processor, websocket-hub, order-service, pi-node). Each card shows: name, version, status badge, uptime, key counters.
- Picker Registration table: picker_id, stream_url (clickable link), control_url, last_seen_at, version, status.
- Data-Flow section: a simple horizontal flow diagram `[Pi] → [api-gateway] → [event-processor] → [websocket-hub] → [browser]` with event counts annotated on each arrow.
- Log Viewer: dropdown to select service (including pi nodes by picker_id). Shows last 50 log lines in a scrollable monospace box. Auto-refreshes every 5s. Log lines are coloured by level (ERROR=red, WARNING=amber, INFO=white, DEBUG=grey).
- Version panel: table of all components with current version + last-changed indication.

### Todo List
1. Create `picker-vision/server/web_ui/src/SystemView.tsx` — the full System tab component using data from `useSystemHealth`.
2. Build `ServiceCard` sub-component (health card with counters and badge).
3. Build `PickerRegistrationTable` sub-component showing picker registry data.
4. Build `DataFlowDiagram` sub-component — static SVG/div layout with live counter annotations pulled from telemetry.
5. Build `LogViewer` sub-component — dropdown selector, log line list, auto-refresh using `setInterval` calling `GET /api/logs/{service}`.
6. Build `VersionTable` sub-component — list all service versions from telemetry response.
7. Wire `SystemView` into `App.tsx` as the third mode `'system'`.
8. Add "System" button to the header nav in `App.tsx`.

### Relevant Context
- `picker-vision/server/web_ui/src/SupervisorView.tsx` — layout and styling patterns to follow
- `picker-vision/server/web_ui/src/OperatorView.tsx` — sidebar + main panel pattern
- `picker-vision/server/web_ui/src/types.ts` — extend with telemetry types from Sub-Task 5

---

## Sub-Task 7 — Version Bump This Plan's Changes

**Status:** `[x] done`

### Intent
Every sub-task in this plan modifies files across all components. This sub-task ensures the version is bumped **as the final step** after all other sub-tasks complete, and the VERSIONS.md changelog is updated.

### Expected Outcomes
- All `VERSION` files read `1.1.0` (set in Sub-Task 2).
- `VERSIONS.md` entry for `1.1.0` is complete with all changes documented.
- `configmap.yaml` reflects `1.1.0` for all services.
- The WebUI header shows `1.1.0` for every service after deployment.

### Todo List
1. After all sub-tasks are complete, verify all VERSION files are at `1.1.0`.
2. Finalise `VERSIONS.md` with complete change summary for `1.1.0`.
3. Confirm `configmap.yaml` version keys are all `1.1.0`.
4. Update `package.json` version to `"1.1.0"`.

### Relevant Context
- This sub-task depends on all others being complete.
- `picker-vision/VERSIONS.md` — created in Sub-Task 2.
- `picker-vision/k8s/configmap.yaml` — updated in Sub-Task 2.

---

## Implementation Order

Sub-tasks must be implemented in this order, each reviewed before the next begins:

```
1 → 2 → 3 → 4 → 5 → 6 → 7
```

Sub-Task 1 unblocks everything (picker must be visible first). Sub-Tasks 3 and 4 provide the backend data that Sub-Tasks 5 and 6 consume.
