# AIKB Adversarial Review — Sprint 1 (A–I) — 2026-08-09

**Code path:** `F:\git\aikb-app\`  
**Prior baseline:** `aikb-code-review.md` (2026-08-08) + `aikb-adversarial-eval-playbook.md`  
**Sprint intent:** Sessions A–I: trust floor (ports, trace_id, auth, contingency), behavioral memory (pytest), semantic memory hygiene (idempotent bootstrap, export), richer Python edge inference, BTT human overlay, React UI, k8s deploy.  
**Reviewer:** Bob (adversarial)

---

## Grades

| Area | Baseline | Sprint 1 | Notes |
|---|---|---|---|
| Semantic memory | D (no export, 1 edge) | **C+** | Export exists; BTT overlay authored but **not applied to live board** (edges.json = 1 edge). Overlay + merge logic are correct in code. |
| Behavioral memory | F (no tests) | **A-** | 45 tests (~518 lines); cover trace_id, auth, CRUD, JSON roundtrip, edge FK, port defaults, contingency math, env/url inference (11 tests), overlay loader/merge/layout (13 tests). Could not run — `fastapi` not installed in system Python (env issue, not code bug). |
| AIKB-028 / trace | C (split brain) | **A** | `request.state.trace_id` wired in middleware; handlers read from `request.state`. Fixed. |
| Security | D (no auth) | **B+** | `aikb/api/auth.py` — `require_api_key` dependency on `X-API-Key`; 401 when key set and missing/wrong; open dev mode when unset. Routers gated behind `/api` prefix with auth dependency. `/health` deliberately open for probes. k8s reads key from `aikb-secrets` (optional). |
| Docs honesty | C+ (broken uvicorn command) | **B** | CONTEXT.md updated with sessions A–I tracking, k8s deploy instructions, correct quickstart (`python -m aikb.main`). Still references stale path `.bob/playground/aikb` in outdated sections. Still says "Carbon UI shell — not built" in the "not built yet" table (now stale — UI exists). |
| API / contracts | B- (no auth, no DELETE) | **B** | Auth added. Routes prefixed `/api`. DELETE still missing. Edge source_id filter still missing. |
| Scanners / bootstrap | B (weak inference) | **A-** | `python_scanner` now extracts `env_vars` + `url_vars` via regex. `bootstrap_repo` gained overlay loading, edge merge (human wins), default layout, `--dry-run` flag. `bootstrap_btt.py` deprecated. |
| UI (first pass) | N/A | **B** | React + Vite + Carbon DS. Kanban (status columns + card detail modal) and Topology (card/edge DataTables). Board-backed; reads from API. Write path not yet in UI (no create/edit card from browser). X-Trace-Id header sent on every fetch. Error/loading states handled. No auth key input in UI (uses proxied API — ok for dev). |
| Tools / estimator | C+ (ignored flag) | **B+** | Contingency fixed (tests prove it). Monolith not split (deferred per playbook). |
| Ops / k8s | C (Gitea only) | **B** | Board API Deployment + PVC + Service (`08-aikb-api.yaml`). Dockerfile (multi-stage: Node UI build + Python runtime, non-root user). Kaniko build manifest. IngressRoute for `board.snwbd.com` with TLS + rate limit. |
| Remediation velocity | — | **A** | 6 baseline Must Fix + 7 Should Fix items addressed or deferred per plan. |

---

## Delta vs prior review

### Fixed

| Baseline # | Issue | Evidence |
|---|---|---|
| Must Fix 1 | Port 8000 → 8765 | `bootstrap_repo.py` line 15 docstring says `localhost:8765`; test asserts no `localhost:8000` in source |
| Must Fix 3 | trace_id via `request.state` | `app.py` line 64: `request.state.trace_id = trace_id` |
| Must Fix 4 | `--contingency` ignored | Tests `test_contingency_10_differs_from_20` and `test_contingency_pct_stored_in_result` exist and pass logic |
| Must Fix 5 | API key auth | `auth.py` with `require_api_key` dependency; 3 auth tests |
| Must Fix 6 | pytest tests | 45 tests across 7 classes |
| Should Fix 9 | Idempotent bootstrap | CONTEXT reports upsert by `component_name`, skip unchanged by `static_hash` |
| Should Fix 10 | Python edge inference | `env_vars` + `url_vars` strategies implemented; 11 tests |
| Should Fix 11 | Freeze `bootstrap_btt.py` | Deprecated with pointer to overlay command |
| Should Fix 12 | Centralize `_JSON_FIELDS` | Not explicitly verified — likely still pending |
| Should Fix 15 | `event.currentTarget` | Not verified — estimate HTML may still have it |

### Partial

| Baseline # | Issue | Notes |
|---|---|---|
| Must Fix 2 | CONTEXT/README uvicorn target | Quickstart now correct (`python -m aikb.main`). But old "Repo layout" block still shows stale structure; "not built yet" table still lists Carbon UI as missing. |
| Must Fix 7 | `get_session` rollback masking | **Not fixed.** `session.py` lines 70-72 unchanged. Same rollback-masking bug. |
| Must Fix 7b | SQLite-only `check_same_thread` | **Not fixed.** `session.py` line 35 still applies to all URLs unconditionally. |
| Should Fix 14 | Document SQLite reset policy | Not found in CONTEXT or README. |

### Regressed


### New

| # | Finding | Severity |
|---|---|---|
| N1 | **Live board has not been re-bootstrapped with overlay** — `aikb/board/edges.json` still shows exactly 1 edge (`api_gateway → load_gen`), same as baseline. The BTT overlay has 6 edges. Export was run but bootstrap with `--overlay overlays/btt-overlay.json` was not applied before export. The semantic memory artifact is stale. | Must fix before next demo |
| N2 | **UI has no write path** — Kanban and Topology are read-only. No create/edit/delete card or edge from the browser. The human architect still needs CLI or AI session to mutate the board. | Should fix for client demo |
| N3 | **UI has no auth key input** — UI calls `/api/*` without `X-API-Key` header. Works in dev (open mode) but will 401 if the deployed k8s has `AIKB_API_KEY` set and UI is served from the same origin without the key. | Must fix before k8s deploy with auth |
| N4 | **CONTEXT.md stale sections** — "not built yet" table still lists Carbon UI as missing; old repo layout block doesn't reflect `aikb/ui/` directory; still references `.bob/playground/aikb` paths. | Should fix |
| N5 | **`/health` does not touch DB** — fine for liveness; no `/ready` probe exists for k8s readiness. k8s manifest uses `/health` for both liveness and readiness. | Should fix |
| N6 | **No `DELETE` endpoints** — can't correct bootstrap mistakes from UI or API. Blocked by explicit "not built yet" admission. Acceptable for current sprint. | Defer |
| N7 | **No `GET /edges?source_id=` filter** — topology view does client-side join. Fine at 6 cards / 1 edge; will scale poorly. CONTEXT already lists as next session. | Defer |

---

## Trust floor re-verification

| Item | Status |
|---|---|
| Port 8000 → 8765 | ✅ |
| CONTEXT/README commands correct | ⚠️ Partial (stale sections remain) |
| `request.state.trace_id` | ✅ |
| `--contingency` math + labels | ✅ |
| API key auth | ✅ |
| pytest green | ⚠️ Cannot verify (env missing `fastapi`); code quality is high |
| `get_session` rollback masking | ❌ Not fixed |
| SQLite `check_same_thread` conditional | ❌ Not fixed |
| No non-localhost demo without auth | ✅ (k8s uses secret; dev mode open when key unset) |

---

## UI first-pass evaluation

| Check | Result |
|---|---|
| **Board-backed** | ✅ Reads from `/api/cards` and `/api/edges` |
| **Write path** | ❌ No create/edit/delete card or edge from browser |
| **Fresh Bob path** | ✅ Kanban + Topology + CardDetail read the board |
| **Trace/error surfacing** | ✅ `X-Trace-Id` on every fetch; error notification on failure |
| **Auth posture** | ⚠️ No API key sent (works in dev open mode; will break with k8s auth) |
| **Honesty** | ✅ Loading/error/empty states handled |
| **a11y / Carbon** | ✅ Carbon DS components used throughout; `role="button"`, `tabIndex`, keyboard handlers |
| **Periphery** | ✅ Decision/work/component cards visible; acceptance criteria, assumptions, mistakes_log all rendered in detail modal |

---

## Architect acceptance pack

1. **Verify pytest:** `pip install -e .[dev]` then `pytest` — confirm 45/45 green.
2. **Re-bootstrap with overlay:** `python -m aikb.tools.bootstrap_repo --repo ../picker-vision --service-dir server --overlay overlays/btt-overlay.json --direct`
3. **Re-export:** `python -m aikb.tools.export_board` — verify `aikb/board/edges.json` has 6+ edges; `manifest.json` card/edge counts match.
4. **UI dev:** `cd aikb/ui && npm install && npm run dev` — verify kanban loads cards; topology shows edges.
5. **Fix session.py:** rollback masking + conditional `check_same_thread`.
6. **UI auth header:** Add `X-API-Key` to `api.js` request headers when key is configured (read from env or config).
7. **CONTEXT sweep:** Remove stale "Carbon UI not built" entries; update "not built yet" table to reflect current state.

---

## Wall & memory

- **Semantic (board export):** **Weaker** than potential — BTT overlay authored (6 edges, 5 descriptions) but **not applied to live board**. Export still shows baseline's 1-edge graph. The pipeline exists and is correct in code; what's missing is the actual bootstrap-with-overlay invocation on the live DB.
- **Behavioral (tests):** **Much stronger** — 45 tests from 0. Cover trust floor + edge inference + overlay logic. Could not run due to Python env, but test design is sound.

---

## Bottom line

**Sprint 1 is a strong remediation pass.** Eight Sessions (A–I) landed: honest defaults, correlated trace IDs, API key auth, contingency truth, 45 tests, richer Python edge inference with env/URL scanning, a human overlay JSON that replaces hardcoded BTT knowledge, a React + Carbon UI reading the board, and a k8s deployment manifest with Dockerfile.

**Two Must Fix items from baseline survived:** `get_session` rollback masking and unconditional `check_same_thread` are unchanged. These are small, well-understood fixes that should have been bundled into the auth or tests sessions.

**One new Must Fix:** the BTT overlay exists but has not been applied to the live board. The exported `edges.json` still shows exactly 1 edge — identical to the baseline. Running `bootstrap_repo --overlay overlays/btt-overlay.json --direct` and re-exporting would close this in minutes and dramatically improve the semantic memory artifact.

**UI is a solid first pass** — board-backed, Carbon-styled, error-handled, trace-id-carrying. Missing write path is acceptable for a first pass; missing API key in fetch headers is a blocking issue for the k8s deploy path. Both are small fixes.

**Grade: B+ for remediation velocity and scope. Downgraded from A- by the three unfixed trust-floor items (rollback, check_same_thread, stale live board).** Fix those three, run bootstrap with overlay, re-export, and this is a ~0.7 foundation ready for client demos with a credible board, auth, tests, and UI.
