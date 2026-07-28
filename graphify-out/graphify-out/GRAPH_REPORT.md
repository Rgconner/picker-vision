# Graph Report - graphify-out  (2026-07-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 871 nodes · 1524 edges · 51 communities (47 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 58 edges (avg confidence: 0.63)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `62915362`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- get
- models.py
- plan_packing
- vision_service.py
- BttLabelsPanel.tsx
- devDependencies
- BaseAdapter
- label_generator.py
- EventPublisher
- SystemView.tsx
- websocket_hub/main.py
- VideoPanel.tsx
- MobilePickerView.tsx
- types.ts
- ManagementView.tsx
- compilerOptions
- App.tsx
- order_service/main.py
- Request
- MobilePickList.tsx
- start.sh
- SupervisorView.tsx
- _RingBufferHandler
- _RingBufferHandler
- _RingBufferHandler
- _RingBufferHandler
- _RingBufferHandler
- _RingBufferHandler
- DemoPage.tsx
- dmSvg
- qrSvg.ts
- OperatorView.tsx
- MobileLiteView.tsx
- useBarcodeScanner.ts
- camera_probe.py
- _row_to_dict
- verify_layer
- gen_barcode_test.js
- draw_page
- install-service.sh
- generate_warehouse_grid
- useAuth.ts
- generate_test_barcodes.py
- _init_db
- _create_demo_order
- vite.config.ts
- _validate_seed.py
- demo_stop
- demoCredentials.ts

## God Nodes (most connected - your core abstractions)
1. `get()` - 79 edges
2. `_proxy()` - 28 edges
3. `plan_packing()` - 24 edges
4. `make_pair()` - 20 edges
5. `_row_to_dict()` - 16 edges
6. `dmSvg()` - 16 edges
7. `EventPublisher` - 15 edges
8. `LocalAdapter` - 15 edges
9. `_DemoStartRequest` - 15 edges
10. `_DemoStopRequest` - 15 edges

## Surprising Connections (you probably didn't know these)
- `get_logs()` --references--> `get()`  [EXTRACTED]
  server/order_service/main.py → pi-node/config_loader.py
- `health()` --references--> `get()`  [EXTRACTED]
  server/order_service/main.py → pi-node/config_loader.py
- `get_logs()` --references--> `get()`  [EXTRACTED]
  server/websocket_hub/main.py → pi-node/config_loader.py
- `health()` --references--> `get()`  [EXTRACTED]
  server/websocket_hub/main.py → pi-node/config_loader.py
- `run_btt_seed()` --calls--> `CartType`  [INFERRED]
  fixtures/bobs-tiny-treasures/seed_btt.py → server/order_service/models.py

## Import Cycles
- None detected.

## Communities (51 total, 4 thin omitted)

### Community 0 - "get"
Cohesion: 0.05
Nodes (85): middleware, get(), Convenience: get a single config value., api_cart_types(), api_confirm_packed(), api_create_cart_type(), api_create_user(), api_delete_cart_type() (+77 more)

### Community 1 - "models.py"
Cohesion: 0.10
Nodes (39): Base, _parse_args(), Bob's Tiny Treasures — BTT fixture seed script. Populates the database with the…, Populate the database with Bob's Tiny Treasures data. Idempotent — checks for…, run_btt_seed(), Namespace, Order, OrderLine (+31 more)

### Community 2 - "plan_packing"
Cohesion: 0.08
Nodes (28): ItemSlot, LayerSpec, plan_packing(), packer.py — fallback bin-packing heuristic for Bob's Tiny Treasures. This is a…, One unit of an OrderLine item to be placed in a tote., One layer of items within a tote (max MAX_ITEMS_PER_LAYER items)., One physical tote with its layers and total assigned weight., Compute a tote packing plan without touching the database. Parameters… (+20 more)

### Community 3 - "vision_service.py"
Cohesion: 0.05
Nodes (36): _bbox_centre(), detect(), _points_to_bbox(), ndarray, Barcode and QR code detector using OpenCV built-in engines (Apache 2.0). Uses:…, Convert a polygon (N,2) float array to an axis-aligned bounding box., Detect all barcodes and QR codes in an OpenCV BGR frame. Returns a list of…, load() (+28 more)

### Community 4 - "BttLabelsPanel.tsx"
Cohesion: 0.06
Nodes (26): API(), AVERY_DEFAULTS, AVERY_LABELS, BarcodeType, BttLabelsPanel(), DetailLevel, LabelConfig, PrintMode (+18 more)

### Community 5 - "devDependencies"
Cohesion: 0.06
Nodes (32): autoprefixer, postcss, react, react-dom, dependencies, react, react-dom, @zxing/library (+24 more)

### Community 6 - "BaseAdapter"
Cohesion: 0.10
Nodes (16): ABC, BaseAdapter, Any, Return a single order by ID, or None if not found., Return product metadata by barcode, or None if not found., Return staging container info by 4-letter code, or None if not found., Increment quantity_picked by 1 on the given line. When quantity_picked >=…, Mark the order as packed and lock all associated staging targets. Returns the… (+8 more)

### Community 7 - "label_generator.py"
Cohesion: 0.17
Nodes (25): BytesIO, Image, _barcode_image(), _draw_cut_lines(), _draw_product_cell(), _draw_shelf_cell(), _draw_wordmark(), _draw_zone_cell() (+17 more)

### Community 8 - "EventPublisher"
Cohesion: 0.10
Nodes (11): EventPublisher, Event publisher for the Picker Vision Pi node. Design goals for headless /…, POST to /pickers/register with exponential backoff. Args: retries: Maximum…, Drain the in-memory queue; write to offline buffer when server is down., POST a single event. Returns True on success. Logs only on state transitions…, Append an event to the offline JSONL buffer file., Replay buffered events to the server, then delete the buffer file., Posts detection events to the server in a background thread. (+3 more)

### Community 9 - "SystemView.tsx"
Cohesion: 0.11
Nodes (17): outcomeColour(), outcomeLabel(), pickerInitials(), ScanStrip(), logLevelColor(), LogViewer(), Props, SERVER_SERVICES (+9 more)

### Community 10 - "websocket_hub/main.py"
Cohesion: 0.13
Nodes (21): AbstractEventLoop, Event, PubSub, Queue, get_logs(), get_state(), get_supervisor_state(), health() (+13 more)

### Community 11 - "VideoPanel.tsx"
Cohesion: 0.16
Nodes (17): COLOURS, MobileCameraView(), Props, Props, StagingOverlay(), PickerStreamBadge(), Detection, StagingRegion (+9 more)

### Community 12 - "MobilePickerView.tsx"
Cohesion: 0.16
Nodes (15): MobilePickerView(), MobilePickerViewProps, pickerIdFromUrl(), savedPickerId(), useActiveDemoPickerId(), useIsLandscape(), useBarcodeScanner(), useDebugSnapshot() (+7 more)

### Community 13 - "types.ts"
Cohesion: 0.11
Nodes (14): apiFetch(), ORDER_API(), Props, WizardStep, BBox, BoundaryPoint, OrderLine, OrderTote (+6 more)

### Community 14 - "ManagementView.tsx"
Cohesion: 0.11
Nodes (9): AI_PROVIDERS, AiConfig, BASE_TABS, CartType, ManagedUser, Props, Tab, WorkflowConfig (+1 more)

### Community 15 - "compilerOptions"
Cohesion: 0.11
Nodes (18): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+10 more)

### Community 16 - "App.tsx"
Cohesion: 0.15
Nodes (15): App(), Mode, PickerMode, SUPERVISOR_TABS, SupervisorMode, dot(), HealthStrip(), Props (+7 more)

### Community 17 - "order_service/main.py"
Cohesion: 0.17
Nodes (16): confirm_packed(), demo_status(), _get_adapter(), get_instance_profile(), get_logs(), get_order(), get_product(), get_staging() (+8 more)

### Community 18 - "Request"
Cohesion: 0.20
Nodes (15): create_cart_type(), create_user(), generate_labels(), post, put, Request, Upsert a stock assignment on the scratch WarehouseScenario. Body:…, Save the current scratch inventory as a named scenario. Body: {"name": str}… (+7 more)

### Community 19 - "MobilePickList.tsx"
Cohesion: 0.24
Nodes (12): buildDetectionMap(), detectionStyle(), MobilePickList(), orderWeight(), Props, stagingBadge(), PackWizard(), orderStatusBadge() (+4 more)

### Community 20 - "start.sh"
Cohesion: 0.14
Nodes (13): CONTROL_PORT, FRAME_FPS, FRAME_HEIGHT, FRAME_WIDTH, MIN_STAGING_AREA, MJPEG_QUALITY, OPENCV_LOG_LEVEL, PICKER_ID (+5 more)

### Community 21 - "SupervisorView.tsx"
Cohesion: 0.21
Nodes (11): DemoControls(), DemoSession, Order, OrderLine, Props, FocusedPickerProps, FocusedPickerView(), Props (+3 more)

### Community 22 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 23 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 24 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 25 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 26 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 27 - "_RingBufferHandler"
Cohesion: 0.18
Nodes (9): attach(), get_lines(), Any, LogRecord, In-memory log ring buffer handler. Attaches to the root logger and captures up…, Thread-safe in-memory ring buffer for log records. Guard flag ``_emitting``…, Attach the ring-buffer handler to the root logger (idempotent)., Return captured log lines (newest last). Safe to call before attach(). (+1 more)

### Community 28 - "DemoPage.tsx"
Cohesion: 0.20
Nodes (8): DemoPage(), ProductLabel(), PRODUCTS, ShelfLabel(), SHELVES, STAGING, StagingLabel(), WelcomePage()

### Community 29 - "dmSvg"
Cohesion: 0.29
Nodes (11): buildMatrix(), dmEncode(), dmSvg(), GF_EXP, GF_LOG, gmul(), padData(), PARAMS (+3 more)

### Community 30 - "qrSvg.ts"
Cohesion: 0.24
Nodes (11): ALIGN, DCAP, ECWDS, EXP, FMT_M, gm(), LOG, makeQR() (+3 more)

### Community 31 - "OperatorView.tsx"
Cohesion: 0.27
Nodes (8): Action, Controls(), Props, OperatorView(), PickerInfo, ValidationResult, usePickerSocket(), VideoPanel()

### Community 32 - "MobileLiteView.tsx"
Cohesion: 0.27
Nodes (8): DemoSession, MobileControls(), Props, MobileLiteView(), Props, ScanResult, MobilePickerSessionState, useMobilePickerSession()

### Community 33 - "useBarcodeScanner.ts"
Cohesion: 0.18
Nodes (6): getZXingReader(), NativeBarcode, NativeBarcodeDetector, ZXING_FMT_NAMES, _zxingCallbacks, ZXingReader

### Community 34 - "camera_probe.py"
Cohesion: 0.29
Nodes (9): find_camera(), list_cameras(), _probe_device(), Camera auto-detection for the Picker Vision Pi node. Scans /dev/video* devices…, Return info dicts for all working cameras., Return sorted list of integer indices from /dev/video* nodes., Try to open /dev/videoN and grab one frame. Returns a dict with device info on…, Return the OpenCV index of the first working camera. Args: prefer_index: If set… (+1 more)

### Community 35 - "_row_to_dict"
Cohesion: 0.20
Nodes (10): get_ai_config(), get_scenario(), get_user(), get_workflow_config(), list_cart_types(), list_scenarios(), list_users(), List all saved WarehouseScenarios (excludes the scratch row). (+2 more)

### Community 36 - "verify_layer"
Cohesion: 0.22
Nodes (9): get_pack_plan(), pack_order(), _pack_plan_to_dict(), patch, Serialise a list of OrderTote ORM rows (with .layers and .assignments) to a…, Run the fallback packer on a completed order. Creates OrderTote / ToteLayer /…, Return the existing pack plan (totes + layers + assignments) for an order., Mark a layer as verified (or skipped). Body: {"status": "verified"|"skipped",… (+1 more)

### Community 37 - "gen_barcode_test.js"
Cohesion: 0.25
Nodes (6): fs, outPath, path, PATTERNS, sizes, values

### Community 38 - "draw_page"
Cohesion: 0.43
Nodes (6): draw_page(), generate(), make_qr(), Canvas, Path, ImageReader

### Community 39 - "install-service.sh"
Cohesion: 0.52
Nodes (6): error(), header(), info(), install-service.sh script, success(), warn()

### Community 40 - "generate_warehouse_grid"
Cohesion: 0.29
Nodes (7): delete_cart_type(), delete_scenario(), delete_user(), generate_warehouse_grid(), delete, Generate shelf StagingContainers for a rows×cols grid. Deletes any existing…, Delete a saved scenario. Cannot delete the scratch row.

### Community 41 - "useAuth.ts"
Cohesion: 0.43
Nodes (6): ApiUser, AppUser, loadSession(), saveSession(), sha256hex(), useAuth()

### Community 42 - "generate_test_barcodes.py"
Cohesion: 0.38
Nodes (6): build_pdf(), _make_code128_drawing(), _make_qr_image(), Test barcode sheet generator for Picker Vision System. Requirements (all…, Return a ReportLab platypus Image (flowable) containing a QR code., Return a ReportLab Drawing containing a Code 128 barcode. If svglib is…

### Community 43 - "_init_db"
Cohesion: 0.33
Nodes (6): on_event, _init_db(), Create all tables (no-op if they already exist) then seed., startup_event(), No-op — seeding is handled by seed_btt.py., run_seed()

### Community 44 - "_create_demo_order"
Cohesion: 0.33
Nodes (6): _advance_demo_session(), _create_demo_order(), demo_start(), Called after an order is marked complete. If a demo session is watching that…, Start (or restart) a demo order loop. Personal mode: each picker_id runs its…, Create one randomized BTT demo order and return its id.

## Knowledge Gaps
- **126 isolated node(s):** `start.sh script`, `OPENCV_LOG_LEVEL`, `FRAME_WIDTH`, `FRAME_HEIGHT`, `FRAME_FPS` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get()` connect `get` to `vision_service.py`, `_row_to_dict`, `verify_layer`, `generate_warehouse_grid`, `websocket_hub/main.py`, `_create_demo_order`, `order_service/main.py`, `Request`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `plan_packing()` connect `plan_packing` to `order_service/main.py`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `EventPublisher` connect `EventPublisher` to `vision_service.py`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `plan_packing()` (e.g. with `.test_custom_max_items_per_layer()` and `.test_custom_weight_cap()`) actually correct?**
  _`plan_packing()` has 18 INFERRED edges - model-reasoned connections that need verification._
- **What connects `start.sh script`, `OPENCV_LOG_LEVEL`, `FRAME_WIDTH` to the rest of the system?**
  _126 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `get` be split into smaller, more focused modules?**
  _Cohesion score 0.05399625768511093 - nodes in this community are weakly interconnected._
- **Should `models.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09795918367346938 - nodes in this community are weakly interconnected._