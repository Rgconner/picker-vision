# Picker Vision — Version Changelog

Each row describes a component version change.  The component version is stored
in the component's `VERSION` file and read at startup.  Any code change to a
component **must** bump its `VERSION` file and add a row here.

---

## Component Versions

| Component         | Current | File                                        |
|-------------------|---------|---------------------------------------------|
| pi-node           | 1.1.3   | `pi-node/VERSION`                           |
| api-gateway       | 1.1.3   | `server/api_gateway/VERSION`                |
| event-processor   | 1.1.3   | `server/event_processor/VERSION`            |
| websocket-hub     | 1.1.3   | `server/websocket_hub/VERSION`              |
| order-service     | 1.1.3   | `server/order_service/VERSION`              |
| web-ui            | 1.1.3   | `server/web_ui/VERSION`                     |

---

## Changelog

### 1.1.3

**pi-node**
- Removed spurious `STREAM_HOST` warning and pinning suggestion. The UDP probe is the correct and only mechanism for DHCP environments — no configuration needed. Replaced warning with an INFO log showing the advertised stream URL so operators can confirm which interface was selected.
- Cleaned up `picker.env.template` — `STREAM_HOST` is now commented out and documented as an emergency-only override, not a normal setting.

---

### 1.1.2

**pi-node**
- Fixed `UnboundLocalError: cannot access local variable '_frames_captured'` — `_run_capture()` mutates module-level globals but was missing `global _frames_captured, _events_published, _last_event_at` declaration. Also removed erroneous `global` declaration inside a `with _state_lock:` block (global declarations must be at function scope, not block scope).
- Added subnet mismatch warning: if the UDP-probed stream host is on a different subnet than the server, a `WARNING` is logged at startup telling the operator to set `STREAM_HOST` explicitly.

**api-gateway**
- Reduced `PICKER_TTL` from 300s → 120s and `PICKER_STALE_AFTER` from 120s → 45s. Pi heartbeats every 30s; the old values kept a rebooted/dead picker showing as "online" for up to 2 minutes. Now a picker goes offline within 45s of missing its first heartbeat.

---


### 1.1.0

**pi-node**
- Fixed registration bug: `stream_url` and `control_url` were never populated before calling `register()`. Pi now uses UDP-socket probing to determine its own LAN IP at startup, with `STREAM_HOST` env override for static/multi-homed hosts.
- Added `network_utils.py` with `resolve_stream_host()` helper.
- Added `STREAM_HOST` and `STREAM_PORT` config keys to `config_loader.py` and `start.sh`.
- Updated `picker.env.template` with new networking section and corrected `SERVER_URL` to `192.168.11.7:80`.
- VERSION is now read from `pi-node/VERSION` file at startup.

**api-gateway**
- VERSION is now read from `server/api_gateway/VERSION` file at startup.
- Added `/api/logs/{service}` and `/api/logs/pi/{picker_id}` aggregation endpoints.
- Added `/api/telemetry` and `/api/telemetry/stream` (SSE) endpoints.
- Extended `/health` with uptime, started_at, and request counters.

**event-processor**
- VERSION is now read from `server/event_processor/VERSION` file at startup.
- Added `/logs` endpoint with in-memory ring buffer.
- Extended `/health` with uptime, started_at, and event counters.

**websocket-hub**
- VERSION is now read from `server/websocket_hub/VERSION` file at startup.
- Added `/logs` endpoint with in-memory ring buffer.
- Extended `/health` with uptime, started_at, and active connection counters.

**order-service**
- VERSION is now read from `server/order_service/VERSION` file at startup.
- Added `/logs` endpoint with in-memory ring buffer.
- Extended `/health` with uptime and started_at.

**web-ui**
- VERSION bumped to 1.1.0 in `package.json`.
- Added compact health status strip (red/green indicators) visible across all tabs.
- Added dedicated **System** tab with: service health cards, picker registration table, data-flow diagram with event counters, per-service log viewer, and version table.
- Added `useSystemHealth` hook polling `/api/telemetry` every 10 seconds.

**k8s**
- Fixed MetalLB IPAddressPool range from `192.168.1.x` to `192.168.11.x` (actual subnet).
- Updated all `*_VERSION` keys in `configmap.yaml` to `1.1.0`.

---

### 1.0.0

Initial release.
