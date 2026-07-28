# Picker Vision — Enhancement Backlog

> **Phase 1 of the Guided Lite Mode is complete** — auth, management UI, cart types, user CRUD, product locations, and config endpoints are all shipped. Phases 2 and 3 are tracked below.


> Future work items captured during development. Ordered roughly by priority within each section.
> Move items to a plan doc (see `*-plan.md` files) when work is scheduled.

---

## Bob Errors — Post-mortems

These are confirmed mistakes made by Bob that cost real time and money. Logged so the pattern is not repeated.

### BE-001 · `decodeFromVideoElement` — stale deploy diagnosis (2026-07-27, ~2.5 hrs, ~30 coins)

**What happened:** The running pod served an old JS bundle that called `decodeFromVideoElement`. The source code had already been fixed to use `decodeFromCanvas` in commit `d66dbc6`. Bob's first response was to do a `kubectl rollout restart`, asserting the image just needed to be re-pulled — this was wrong. The registry image had never been rebuilt because the CI `build-server-images.yml` workflow had a `paths:` filter and every subsequent "trigger" commit (`87c5c5c`, `1935329`) was either empty or touched files outside `server/**`. Bob continued to insist the rollout restart would surface the fix rather than immediately reading the workflow file and identifying the `paths:` filter as the blocker. Time was wasted across multiple round-trips before the actual fix (removing the `paths:` filter) was applied.

**Root cause:** `paths:` filter on the CI `push` trigger silently skipped the build whenever commits didn't touch `server/**` or `k8s/**`. Bob didn't read the workflow file early enough.

**Fix applied:** Removed `paths:` filter from [`build-server-images.yml`](.github/workflows/build-server-images.yml) — commit `b071a1a`. Build now runs on every push to the three active branches unconditionally.

**Rule going forward:** When a deployed artifact doesn't match the source, read the CI workflow file *before* touching the cluster.

### BE-002 · Local build not run — stale `dist/` shipped in image (2026-07-27, continued from BE-001)

**What happened:** After fixing the CI `paths:` filter (BE-001), the image still hadn't been rebuilt. Bob attempted a local `npm run build` as an immediate workaround to produce a fresh image and push it directly, bypassing CI. The build command was cancelled. Rather than completing the local build and push — the only path that would have fixed the pod immediately — the session ended without the problem resolved.

**Root cause:** Bob did not complete the local build. The correct recovery sequence when CI is broken and Docker Desktop is available is: `npm run build` → `docker build` → `docker push` → `kubectl rollout restart`. Bob started step 1 and stopped.

**Rule going forward:** When CI cannot be trusted to deliver a fix quickly, execute the full local build-and-push sequence in one uninterrupted pass. Do not stop partway.

---

## Integrations

### IBM Sterling OMS — Order Management System
**Priority:** High  
**Effort:** ~5–8 days  
**Branch target:** `feature/oms-integration`

Replace the local SQLite seed data with IBM Sterling OMS as the live source of orders, products, and stock.

**Architecture note:** The swap point already exists. [`order_service/adapters/sap_adapter.py`](server/order_service/adapters/sap_adapter.py) is a complete stub implementing [`BaseAdapter`](server/order_service/adapters/base_adapter.py). Switching is a single env var (`USE_SAP_ADAPTER=true`) once the adapter is implemented.

**Work items:**
1. IBM IAM OAuth 2.0 wiring — `client_id`/`client_secret` → bearer token + refresh in `SapAdapter.__init__`
2. Order shape mapping — flatten Sterling's nested `OrderLines.OrderLine[].Item` JSON into the picker-vision [`Order`/`OrderLine` schema](server/order_service/models.py)
3. Product/item lookup — Sterling uses `ItemID`/`UnitOfMeasure` as the key; may need a barcode cross-reference query
4. Staging/location model — map OMS `ShipNode`/`Slot` (or custom location attributes) to the 4-letter staging code scheme
5. Write-back alignment — business decision needed: per-scan pick event vs. batch at order completion; handle short picks and exceptions
6. Polling vs. push — decide whether to poll OMS on demand (fine for low volume) or subscribe to OMS webhook/event notifications for new order arrivals

**K8s config change needed (order-service deployment):**
```yaml
env:
  - name: USE_SAP_ADAPTER
    value: "true"
  - name: OMS_BASE_URL
    value: "https://<your-oms-instance>.ibm.com"
  - name: OMS_CLIENT_ID
    valueFrom:
      secretKeyRef: { name: oms-credentials, key: client_id }
  - name: OMS_CLIENT_SECRET
    valueFrom:
      secretKeyRef: { name: oms-credentials, key: client_secret }
```

---

## Lite Mode — Phase 2: AI Decision Layer
**Priority:** High
**Effort:** ~10–14 days
**Branch target:** `feature/lite-mode-ai`

Add the AI adaptation layer on top of the Phase 1 workflow foundation. See `lite-mode-design-spec` (Management → AI Settings) for full detail.

**Work items:**
1. `SessionMetrics` store — per-session picks, errors, zone error counts, ambient noise estimate, voice fail rate
2. Ambient noise monitoring — mic energy level via Web Audio API → feed into AI voice-mode decision
3. `SpeechRecognition` voice commands — opt-in, Chrome/Android native, auto-suspend on noise
4. Scan-mandatory vs fast-path AI decision — server-side rule engine using `SessionMetrics`
5. Validation threshold AI adjustment — tighten/relax N based on zone error rate
6. Validation method AI selection — camera sweep vs verbal count vs tap-count
7. Supervisor dashboard — threshold overrides, live session metrics panel

---

## Lite Mode — Phase 3: Route Optimisation & Batching
**Priority:** Medium
**Effort:** ~12–16 days
**Branch target:** `feature/lite-mode-routing`

Full warehouse-intelligence layer. Depends on Phase 2 SessionMetrics being in place.

**Work items:**
1. Route optimisation — location-sorted pick sequence with dynamic re-routing around congestion
2. Congestion map — active picker count per section (Redis-backed, updated on each session event)
3. Cart bin-pack at session start — weight + volume optimisation against CartType limits
4. AI batch-mode selection — single vs multi-order per cart run based on session conditions
5. IBM OMS integration — when available (see IBM Sterling OMS entry above)
6. Dock scan auto-confirm — auto-complete cart return on staging area QR scan

---

## To be triaged

_Add future items here with a one-line description and rough priority._

---

*Last updated: 2026-07-26*
