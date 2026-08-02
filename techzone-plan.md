# TechZone Deployment Plan — Picker Vision + Sterling Capacity Signal PoC

## Strategy: Hook the Fish First

Deploy picker-vision as a **TechZone Collection** (self-service, zero
Terraform required) running alongside a Sterling OMS demo instance.
The goal is a single URL a Sterling developer can provision in under
10 minutes, see the capacity signal live, and `curl` the endpoint.

Once that exists, the Activation Kit (guided demo script, branded landing
page, pre-loaded retail scenario) is an upgrade — not a prerequisite.

**Branch:** `feature/bobs-tiny-treasures`  
**New overlay:** `k8s/overlays/techzone/`  
**Rollback tag:** `btt-load-gen-stable`

---

## What TechZone Changes vs. BTT Home Lab

| Concern | BTT (home lab) | TechZone (OpenShift) | Fix |
|---|---|---|---|
| Ingress | MetalLB + nginx | OpenShift `Route` | New `routes.yaml` |
| TLS | cert-manager self-signed | Route edge termination (cluster handles cert) | Remove `tls.yaml`, add Route annotations |
| Storage | `local-path` provisioner | Dynamic PVC via `ibmc-block-bronze` (or `managed-nfs-storage`) | StorageClass in PVC spec |
| Database | SQLite file on PVC | Postgres (in-cluster, ephemeral) | Postgres deployment + env var swap |
| Image pull | ghcr.io public | ghcr.io reachable from IBM network — no change needed | None |
| Hardcoded IPs | `192.168.11.213/214` | Route hostnames (auto-assigned) | ConfigMap patch |
| Namespace admin | Full | Restricted — no SCC changes needed if we stay unprivileged | Verify pod security — should be fine |
| Sterling OMS | Not present | Provisioned in same project or adjacent | `OMS_BASE_URL` env var in configmap |

---

## What We Are NOT Doing (yet)

- No TechZone Automation / Terraform module — that's ARCH-007, post-hook
- No `SapAdapter` real implementation — that's ARCH-006, needs Sterling API access
- No Activation Kit branding or guided demo script — post-hook polish
- No `capacity-signal-plan.md` ST-1..ST-4 implementation — parallel workstream

The TechZone overlay is pure infrastructure. The application code is unchanged.

---

## Sub-Task 1 — `k8s/overlays/techzone/` Overlay

### Intent
A kustomize overlay that makes the existing base stack run on OpenShift
with zero application code changes.  Sterling connection is a ConfigMap
env var — wired in even if Sterling isn't provisioned yet
(`USE_SAP_ADAPTER=false` default keeps BTT seed data running).

### Expected Outcomes

**File layout:**

```
k8s/overlays/techzone/
  kustomization.yaml
  namespace.yaml
  configmap-patch.yaml
  postgres.yaml               ← Postgres Deployment + Service + PVC
  order-service-patch.yaml    ← DATABASE_URL → postgres, remove SQLite PVC mount
  routes.yaml                 ← OpenShift Route for api-gateway + web-ui
  web-ui-deployment-patch.yaml ← remove nginx TLS volume mounts (Route handles TLS)
```

**`kustomization.yaml`** — mirrors BTT structure, swaps BTT-specific pieces:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: picker-vision-tz

resources:
  - namespace.yaml
  - ../../base
  - postgres.yaml
  - routes.yaml

patches:
  - path: configmap-patch.yaml
    target: { kind: ConfigMap, name: picker-vision-config }
  - path: order-service-patch.yaml
    target: { kind: Deployment, name: order-service }
  - path: web-ui-deployment-patch.yaml
    target: { kind: Deployment, name: web-ui }

images:
  - name: ghcr.io/rgconner/picker-vision/api-gateway
    newTag: feature-bobs-tiny-treasures
  - name: ghcr.io/rgconner/picker-vision/order-service
    newTag: feature-bobs-tiny-treasures
  - name: ghcr.io/rgconner/picker-vision/event-processor
    newTag: feature-bobs-tiny-treasures
  - name: ghcr.io/rgconner/picker-vision/websocket-hub
    newTag: feature-bobs-tiny-treasures
  - name: ghcr.io/rgconner/picker-vision/web-ui
    newTag: feature-bobs-tiny-treasures
  - name: ghcr.io/rgconner/picker-vision/load-gen
    newTag: feature-bobs-tiny-treasures
```

**`configmap-patch.yaml`** — key differences from BTT:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: picker-vision-config
data:
  # Postgres replaces SQLite
  DATABASE_URL: "postgresql://picker:picker@postgres:5432/picker"

  # Sterling OMS — set to "true" + OMS_BASE_URL when Sterling is provisioned
  USE_SAP_ADAPTER: "false"
  OMS_BASE_URL:    ""

  # Service URLs use in-cluster DNS (same as BTT, already correct)
  ORDER_SERVICE_URL:    "http://order-service:8001"
  EVENT_PROCESSOR_URL: "http://event-processor:8002"
  WEBSOCKET_HUB_URL:   "http://websocket-hub:8003"
  LOAD_GEN_URL:         "http://load-gen:8004"

  # TechZone instance profile
  INSTANCE_PROFILE: "techzone"
```

**`postgres.yaml`** — ephemeral Postgres (no HA needed for demo):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi
  # StorageClass deliberately omitted — uses cluster default
  # On TechZone ROKS: ibmc-block-bronze
  # On TechZone OCP:  managed-nfs-storage or thin
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - { name: POSTGRES_DB,       value: picker }
            - { name: POSTGRES_USER,     value: picker }
            - { name: POSTGRES_PASSWORD, value: picker }
          ports:
            - containerPort: 5432
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 500m, memory: 512Mi }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: postgres-data }
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
spec:
  selector: { app: postgres }
  ports:
    - port: 5432
      targetPort: 5432
```

**`order-service-patch.yaml`** — swap SQLite mount for Postgres env:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  strategy:
    type: Recreate
  template:
    spec:
      # Remove the SQLite PVC volume mount entirely
      volumes:
        - name: db-storage
          emptyDir: {}          # placeholder so base ref doesn't break
      containers:
        - name: order-service
          resources:
            requests: { cpu: 500m,  memory: 128Mi }
            limits:   { cpu: 2000m, memory: 256Mi }
          # DATABASE_URL comes from ConfigMap — points to postgres:5432
          # No volumeMount for /data needed with Postgres
          volumeMounts: []
```

**`routes.yaml`** — OpenShift Routes (TLS edge-terminated by cluster):

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: api-gateway
  annotations:
    haproxy.router.openshift.io/timeout: 60s
spec:
  to:
    kind: Service
    name: api-gateway
  port:
    targetPort: 8000
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
---
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: web-ui
spec:
  to:
    kind: Service
    name: web-ui
  port:
    targetPort: 80
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

**`web-ui-deployment-patch.yaml`** — strip BTT nginx TLS mounts (Route handles TLS):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-ui
spec:
  template:
    spec:
      volumes:
        - name: nginx-config
          configMap:
            name: web-ui-nginx-config
      containers:
        - name: web-ui
          ports:
            - containerPort: 80
          volumeMounts:
            - name: nginx-config
              mountPath: /etc/nginx/conf.d/default.conf
              subPath: default.conf
```

### Relevant Context
- `k8s/overlays/bobs-tiny-treasures/` — structural reference for all patches
- `k8s/base/order-service.yaml` — SQLite PVC mount to neutralise
- `server/order_service/main.py` — SQLAlchemy engine reads `DATABASE_URL`;
  switching to `postgresql://` automatically activates pg dialect. No code change.
- `server/order_service/models.py` — SQLAlchemy models are dialect-agnostic

### Status
[ ] not started

---

## Sub-Task 2 — Postgres dialect validation in order-service

### Intent
Confirm the order-service starts and seeds correctly against Postgres.
SQLAlchemy + the existing models should work without code changes — this
sub-task is about confirming that and fixing any SQLite-isms if found.

### Expected Outcomes
- `DATABASE_URL=postgresql://...` works end-to-end: startup, seed, pick flow
- Any SQLite-specific pragmas or raw SQL removed or made conditional
- `psycopg2-binary` added to `server/order_service/requirements.txt`
  (SQLAlchemy needs it for the `postgresql://` dialect)
- The WAL-mode pragma listener in `main.py` must be SQLite-only:

```python
@_sa_event.listens_for(_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _rec):
    # Only applies when running SQLite — Postgres ignores this block
    if "sqlite" not in str(_engine.url):
        return
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA busy_timeout=15000")
    cur.close()
```

### Relevant Context
- `server/order_service/main.py` lines 43–67 — engine + pragma listener
- `server/order_service/requirements.txt` — add `psycopg2-binary>=2.9`

### Status
[ ] not started

---

## Sub-Task 3 — nginx ConfigMap for TechZone (no TLS block)

### Intent
The BTT nginx config includes an HTTPS server block with TLS cert paths.
TechZone Routes handle TLS at the edge — the nginx inside the pod only
needs to serve HTTP on port 80 and proxy API calls.  A new configmap
patch strips the TLS block.

### Expected Outcomes

**`k8s/overlays/techzone/nginx-configmap-patch.yaml`**

Same structure as the BTT nginx patch but:
- Only one `server { listen 80; }` block
- No `listen 443 ssl` block
- No `ssl_certificate` / `ssl_certificate_key` directives
- Proxy pass rules unchanged (`/api/`, `/events/`, `/ws/`, `/pickers/`, `/state/`)
- SPA fallback unchanged (`try_files $uri $uri/ /index.html`)

Service URLs use TechZone in-cluster DNS — identical to BTT since they
use service names, not IPs.

### Status
[ ] not started

---

## Sub-Task 4 — README: TechZone Quickstart

### Intent
A `## TechZone Quickstart` section in `README.md` so a Sterling developer
(or IBM seller) can deploy the stack in under 10 minutes with copy-paste
commands.  No Ansible, no Terraform — just `kubectl apply -k`.

### Expected Outcomes

```markdown
## TechZone Quickstart

### Prerequisites
- TechZone environment provisioned (OpenShift 4.12+)
- `kubectl` or `oc` CLI pointed at the cluster
- (Optional) IBM Sterling OMS provisioned in same project

### Deploy

```bash
# 1. Apply the TechZone overlay
kubectl apply -k k8s/overlays/techzone/

# 2. Wait for all pods
kubectl wait --for=condition=Ready pods --all -n picker-vision-tz --timeout=300s

# 3. Get the web UI route
kubectl get route web-ui -n picker-vision-tz

# 4. Get the API gateway route (for Sterling integration)
kubectl get route api-gateway -n picker-vision-tz
```

### Connect Sterling OMS (optional)
If a Sterling instance is running in the same cluster:

```bash
kubectl set env deployment/order-service -n picker-vision-tz \
  USE_SAP_ADAPTER=true \
  OMS_BASE_URL=http://<sterling-service>:9080
kubectl rollout restart deployment/order-service -n picker-vision-tz
```

### Verify capacity signal
```bash
GATEWAY=$(kubectl get route api-gateway -n picker-vision-tz \
  -o jsonpath='{.spec.host}')
curl https://$GATEWAY/api/capacity/store/CHI-001
```
```

### Status
[ ] not started

---

## Implementation Order

1. **ST-1** — TechZone overlay files (pure YAML, no code)
2. **ST-2** — Postgres dialect fix in order-service (one guard + one pip dep)
3. **ST-3** — nginx configmap patch (straightforward)
4. **ST-4** — README quickstart (last — after ST-1 is validated)

ST-1 can be built and syntax-checked (`kubectl kustomize`) without a live
OpenShift cluster.  ST-2 can be validated locally with a Docker Postgres
container.  ST-3 is mechanical.  ST-4 is documentation.

---

## When Sterling Is Provisioned

The only changes required to go from "BTT demo data" to "real Sterling catalog":

```bash
# 1. Point to Sterling
kubectl set env deployment/order-service -n picker-vision-tz \
  USE_SAP_ADAPTER=true \
  OMS_BASE_URL=http://<sterling-oms-svc>:9080

# 2. Add credentials (if Sterling requires auth)
kubectl create secret generic oms-credentials \
  --from-literal=client_id=<id> \
  --from-literal=client_secret=<secret> \
  -n picker-vision-tz

# 3. Restart to pick up new config
kubectl rollout restart deployment/order-service -n picker-vision-tz
```

The `SapAdapter` implementation (ARCH-006) is what fills in the actual
Sterling API calls.  The overlay is ready for it the moment credentials
are available.

---

## What This Demonstrates to Sterling

A running OpenShift deployment that:

1. Accepts orders from Sterling (via `SapAdapter` — or seed data while
   adapter is in progress)
2. Executes picks via phone/browser scanner with real-time WS enrichment
3. Returns a live capacity signal via `GET /api/capacity/store/{id}` that
   Sterling's sourcing rules can consume as a custom attribute
4. Shows the full metrics page — per-picker velocity, fatigue index,
   `capacity_score`, `accept_new` — in the supervisor UI

The hook: a Sterling developer can provision this alongside their own OMS
instance from TechZone, point one env var at their service, and see the
loop close in real time.  No slides.  No mock data.  Running system.

---

## Not In Scope (ARCH-007 — post-hook)

- TechZone Automation module (`module.yaml`, Terraform/Ansible provisioner)
- Activation Kit (guided demo script, branded landing page, seller enablement)
- Multi-tenant store isolation (each store in its own namespace)
- Production Postgres (RDS / CloudSQL — not ephemeral in-cluster)

These become the landing-the-fish work once a Sterling team has seen the
hook and asked "how do we put this in front of customers?"
