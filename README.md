# Picker Vision System

Real-time warehouse picking assistance using computer vision, barcode detection, and WebSocket-driven UI.

## Architecture Overview

```
[USB Camera]
     |
[Pi Vision Service]  ──── annotated MJPEG stream ──────────────────────────┐
     |                                                                       |
     └─── detection events (HTTP POST) ──► [API Gateway :8000]              |
                                                  |                          |
                              ┌───────────────────┼────────────────────┐    |
                     [Order Service :8001]  [Event Processor :8002]    |    |
                     [SQLite + Adapters]    [Enrichment + Redis state]  |    |
                              |                    |                    |    |
                           REST API        Redis Pub/Sub               |    |
                                                   |                   |    |
                                      [WebSocket Hub :8003] ◄──────────┘    |
                                           |                                 |
                                    WebSocket push                      MJPEG proxy
                                           |                                 |
                                  [Web UI Browser :3000] ◄──────────────────┘
                              Operator View + Supervisor View
```

**Components:**

| Component | Role |
|---|---|
| **Pi Vision Service** | Captures USB camera, detects barcodes/QR codes via `zxingcpp`, annotates frames, streams MJPEG, POSTs detection events |
| **API Gateway** | Single entry point for Pi nodes and browsers; proxies to internal services; manages picker registry |
| **Order Service** | CRUD for orders, products, staging containers; SQLite-backed with pluggable adapter interface |
| **Event Processor** | Enriches detection events with order data; detects order completion; writes state to Redis |
| **WebSocket Hub** | Subscribes to Redis Pub/Sub; broadcasts enriched state to browser clients |
| **Web UI** | React/Vite SPA — Operator View (single feed + controls) and Supervisor View (grid of all pickers) |
| **Redis** | Shared state store and Pub/Sub bus between Event Processor and WebSocket Hub |

## Licence

All dependencies are MIT, Apache 2.0, or BSD licensed. No LGPL/GPL code in the stack.

Key libraries: `zxingcpp` (Apache 2.0), `opencv-python-headless` (Apache 2.0), `FastAPI` (MIT), `React` (MIT), `Redis` (BSD-3), `SQLAlchemy` (MIT), `reportlab` (BSD), `python-barcode` (MIT), `qrcode` (MIT).

---

## Prerequisites

### Server (x86)
- Docker 24+ and Docker Compose v2
- 4 GB RAM minimum

### Pi Node (per picker)
- Raspberry Pi 4 or 5
- Raspberry Pi OS (64-bit) or any ARM64 Linux
- USB webcam (UVC-compatible, `/dev/video0`)
- Docker installed on the Pi — `curl -sSL https://get.docker.com | sh`

---

## Running the Server Stack

```bash
cd picker-vision
docker compose up --build
```

Services available after startup:

| Service | URL |
|---|---|
| Web UI | http://localhost:3000 |
| API Gateway | http://localhost:8000 |
| API Docs (Order Service) | http://localhost:8001/docs |
| API Docs (Event Processor) | http://localhost:8002/docs |
| API Docs (WebSocket Hub) | http://localhost:8003/docs |

The Order Service seeds the SQLite database automatically on first start (3 orders, 10 products, 5 staging containers).

---

## Running a Pi Node

### Option A — Docker (recommended)

```bash
# Build the Pi image (run this on the Pi or cross-compile on an x86 host)
docker build --platform linux/arm64 -t picker-vision-pi ./pi-node

# Run with your server IP
docker run --privileged \
  --device /dev/video0:/dev/video0 \
  -e PICKER_ID=picker-1 \
  -e SERVER_URL=http://<YOUR_SERVER_IP>:8000 \
  -p 8080:8080 -p 8081:8081 \
  picker-vision-pi
```

The Pi registers itself with the API Gateway on startup. The MJPEG stream is immediately visible in the Web UI Operator View.

### Option B — Direct (development)

```bash
cd pi-node
pip install opencv-python-headless zxingcpp requests Pillow fastapi uvicorn
SERVER_URL=http://<YOUR_SERVER_IP>:8000 PICKER_ID=picker-1 ./start.sh
```

---

## Simulating a Pi on a Dev Laptop (No Raspberry Pi needed)

```bash
# Build for your laptop's architecture
docker build -t picker-vision-pi ./pi-node

# Linux
docker run \
  --device /dev/video0:/dev/video0 \
  -e PICKER_ID=picker-dev \
  -e SERVER_URL=http://host.docker.internal:8000 \
  -p 8080:8080 -p 8081:8081 \
  picker-vision-pi

# macOS / Windows — grant camera access via host video device passthrough
# (Docker Desktop ≥ 4.24 on macOS supports /dev/video0 passthrough on Apple Silicon)
```

---

## Printing Test Barcodes

```bash
pip install python-barcode "qrcode[pil]" reportlab svglib
python tools/generate_test_barcodes.py
# Prints: tools/test_barcodes.pdf — open and print on A4 paper
```

The PDF contains:
- **10 Code 128 barcodes** — one per seed product (WH-00001 … WH-00010), labelled with product description
- **5 QR codes** — one per staging target (ALPH, BETA, GAMM, DELT, EPSN), labelled with type (Area / Container)

For staging area simulation during testing: the printed A4 QR square is recognised by the staging area detector as a flat quadrilateral boundary. Print the staging boundary page and place it flat on a surface — the detector recognises the high-contrast square as the taped boundary polygon with the QR code centred inside.

---

## Environment Variables Reference

### Pi Node

| Variable | Default | Description |
|---|---|---|
| `CAMERA_INDEX` | `0` | OpenCV camera device index (`/dev/video<N>`) |
| `FRAME_WIDTH` | `640` | Capture width in pixels |
| `FRAME_HEIGHT` | `480` | Capture height in pixels |
| `FRAME_FPS` | `15` | Target capture frame rate |
| `PICKER_ID` | `picker-1` | Unique identifier for this Pi node |
| `SERVER_URL` | `http://localhost:8000` | API Gateway base URL |
| `CONTROL_PORT` | `8081` | Port for the Pi's local control HTTP endpoint |
| `STAGING_AREA_THRESHOLD` | `50,150` | Canny edge detection thresholds (low,high) |
| `MJPEG_QUALITY` | `80` | JPEG quality for MJPEG stream (1–100) |
| `MIN_STAGING_AREA` | `5000` | Minimum contour area (px²) to be classified as a staging region |

### Server Services

| Variable | Service | Default | Description |
|---|---|---|---|
| `ORDER_SERVICE_URL` | All server services | `http://order-service:8001` | Internal order service URL |
| `EVENT_PROCESSOR_URL` | All server services | `http://event-processor:8002` | Internal event processor URL |
| `WEBSOCKET_HUB_URL` | All server services | `http://websocket-hub:8003` | Internal WebSocket hub URL |
| `API_GATEWAY_URL` | event-processor | `http://api-gateway:8000` | Gateway URL (used to push lock_staging to Pi nodes) |
| `REDIS_URL` | All server services | `redis://redis:6379` | Redis connection string |
| `REQUIRE_API_KEY` | api-gateway | `false` | Enable `X-API-Key` header enforcement |
| `API_KEY` | api-gateway | *(unset)* | API key value when enforcement is enabled |
| `USE_SAP_ADAPTER` | order-service | `false` | Swap local SQLite adapter for SAP adapter |
| `DATABASE_URL` | order-service | `sqlite:///./picker.db` | SQLAlchemy DB connection string |

---

## Swapping in a Real Back-end Adapter

The Order Service uses a pluggable adapter interface (`server/order_service/adapters/base_adapter.py`). To connect a real ERP or OMS:

1. Create `server/order_service/adapters/my_adapter.py` implementing all abstract methods of `BaseAdapter`:
   - `get_orders()` → list of active orders with lines
   - `get_order(order_id)` → single order detail
   - `get_product(barcode)` → product metadata
   - `get_staging(code)` → staging container/area info
   - `mark_picked(order_id, line_id)` → mark a line as picked
   - `confirm_packed(order_id)` → mark order as packed/complete

2. Register your adapter in `adapters/__init__.py` — add a branch for your env var:
   ```python
   elif os.getenv("USE_MY_ADAPTER") == "true":
       from .my_adapter import MyAdapter
       return MyAdapter()
   ```

3. Set the appropriate env var in `docker-compose.yml` (e.g. `USE_MY_ADAPTER: "true"`) along with any connection details your adapter needs.

4. Rebuild and restart the `order-service` container:
   ```bash
   docker compose up --build order-service
   ```

The rest of the system — Event Processor, API Gateway, WebSocket Hub, Web UI, and Pi node — requires **no changes**.

---

## Web UI Guide

### Operator View

Select your picker ID from the dropdown. The live video feed shows coloured bounding boxes over detected barcodes:

| Colour | Meaning |
|---|---|
| 🟡 Yellow | Active barcode (closest to frame centre) |
| 🟢 Green | Detected, on active order, correct staging |
| 🔴 Red | Unexpected barcode (not on active order) |
| 🔵 Cyan | Staging area/container boundary |

When all items for an order are picked and visible in the correct staging location, a **"✅ All items picked — Confirm Packed?"** banner appears. Tap it to call `POST /orders/{id}/confirm-packed`.

After confirming, the staging region switches to a **red "⛔ DO NOT MODIFY"** overlay in both the browser and the Pi MJPEG stream.

The **pick list sidebar** shows all order lines with barcode, description, quantity, and staging code badge. Picked lines are struck through. The **Validate** button returns a modal listing correct picks, missing items, and unexpected items.

### Supervisor View

A responsive CSS grid shows one video tile per active picker. Each tile displays the picker ID, live MJPEG thumbnail, and a status badge:

| Badge | Meaning |
|---|---|
| `picking` | Actively scanning |
| `complete pending` | All items picked, awaiting confirm |
| `locked` | Order confirmed, staging locked |
| `offline` | Pi not reachable |

The grid auto-updates as pickers register and deregister. No controls are available in Supervisor View.

---

## Barcode Standards

| Type | Symbology | Format | Example |
|---|---|---|---|
| Products | Code 128 / GS1-128 | Raw barcode value | `WH-00001` |
| Staging containers/areas | QR Code | `STAGING:<4-LETTER-CODE>` | `STAGING:ALPH` |

`zxingcpp` decodes both symbologies automatically. DataMatrix is also supported for future use with small product labels (no code changes required).

---

## Seed Data Summary

### Products

| Barcode | Description |
|---|---|
| WH-00001 | Widget A - Small Blue |
| WH-00002 | Widget B - Medium Red |
| WH-00003 | Gadget C - Large Green |
| WH-00004 | Component D - Pack of 10 |
| WH-00005 | Assembly E - Heavy Duty |
| WH-00006 | Part F - Precision |
| WH-00007 | Module G - Standard |
| WH-00008 | Unit H - Deluxe |
| WH-00009 | Item I - Economy |
| WH-00010 | Item J - Premium |

### Staging Targets

| Code | Label | Type | QR Payload |
|---|---|---|---|
| ALPH | Alpha Bay 1 | Area | `STAGING:ALPH` |
| BETA | Beta Bay 2 | Area | `STAGING:BETA` |
| GAMM | Gamma Tote 1 | Container | `STAGING:GAMM` |
| DELT | Delta Tote 2 | Container | `STAGING:DELT` |
| EPSN | Epsilon Tote 3 | Container | `STAGING:EPSN` |

### Active Orders

| Reference | Customer | Lines |
|---|---|---|
| ORD-2024-001 | Acme Corp | WH-00001×2 → ALPH, WH-00003×1 → ALPH, WH-00007×3 → BETA |
| ORD-2024-002 | Globex Ltd | WH-00002×1 → GAMM, WH-00005×2 → GAMM, WH-00009×4 → DELT |
| ORD-2024-003 | Initech Inc | WH-00004×2 → EPSN, WH-00006×5 → EPSN, WH-00008×1 → EPSN |

---

## Load Generator & Automated Regression

The **⚡ Load Gen** tab (supervisor-only) simulates up to 20 virtual pickers
entirely in the browser.  Each agent mirrors the full mobile-picker lifecycle:
register, heartbeat, WebSocket, scan detection events, confirm picks, advance
demo orders — with configurable scan noise.

### Scan Noise Model

| Parameter | Default | Description |
|---|---|---|
| Scan interval | 800 ms | Base time between detection events (±20% jitter) |
| Miscan rate | 10% | Wrong product sent before correct one |
| Multi-scan rate | 25% | 2–3 barcodes in one detection event |
| Duplicate rate | 15% | Same barcode twice in one event |
| Staging rate | 60% | Staging QR region included in event |

### Running a Load Test

1. Sign in as supervisor at `https://bobstinytreasures.snwbd.com`.
2. Navigate to the **⚡ Load Gen** tab.
3. Set picker count, scan speed, and noise rates.
4. Click **▶ Start Swarm** — agents register, open WebSocket connections, and
   begin scanning through demo orders automatically.
5. Watch the swarm table and the **Server Telemetry** strip to confirm both
   sides are in agreement.
6. Click **▶ Run Assertion** for a PASS/FAIL regression report.

### Headless CI Assertion (PowerShell)

After a load-gen session, call the server-side assertion endpoint to verify
the system processed events correctly:

```powershell
# Minimal smoke test — verify endpoint reachable and processing rate >= 95%
.\tools\load-gen-assert.ps1

# Full regression — 3 pickers, expect at least 30 scans received, wait 10s
.\tools\load-gen-assert.ps1 -PickerCount 3 -ScansExpected 30 -WaitSeconds 10

# Custom target
.\tools\load-gen-assert.ps1 `
    -BaseUrl "http://192.168.11.213" `
    -ApiKey  "changeme" `
    -PickerCount 5 `
    -ScansExpected 100 `
    -WaitSeconds 15
```

Exit code 0 = all checks passed. Exit code 1 = one or more checks failed.

### Assertion Endpoint (API)

`GET /api/load-gen/assert?scans_sent=N&picks_confirmed=M&picker_count=P`

Requires `X-API-Key` header.  Returns:

```json
{
  "pass": true,
  "checks": [
    { "name": "events_received >= scans_sent",   "expected": ">=30", "actual": 34,   "pass": true },
    { "name": "processing_success_rate >= 95%",  "expected": ">=95%","actual": "97%","pass": true },
    { "name": "active_picker_sockets >= picker_count", "expected": ">=3", "actual": 3, "pass": true }
  ]
}
```

Always HTTP 200 — use the `pass` field to determine success.

