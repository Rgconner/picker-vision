# AIKB — Adversarial Code Review

**Date:** 2026-08-08  
**Reviewer:** Bob (adversarial lens)  
**Scope:** `F:\git\aikb-app-master\aikb-app\` — all Python source, config, k8s, and docs  
**Authorship Context:** Written by an AI (Bob) working with a human architect who has no programming skills — domain expertise and vision only.  
**Method:** Every claim below was checked against the live source. Line numbers refer to the tree as of this review.  
**Verdict:** For a non-programmer + AI collaboration, this is genuinely impressive. The architecture is sound, the vision is clear, and the hard problems (RPGLE scanning, edge inference, session analysis) are solved correctly. The issues below are overwhelmingly AI-generation artifacts — the kind of cleanup a professional developer would clear in a focused day or two. It is **not** production-ready as-is.

**Sprint-end re-evaluation:** Use [`aikb-adversarial-eval-playbook.md`](aikb-adversarial-eval-playbook.md) — identity, rubric, UI checks, trust-floor checklist, and per-sprint template. This file is the **baseline**; later sprints write `aikb-code-review-sprint-YYYYMMDD.md`.

**Effort context (architect-reported):** The codebase under this review was produced in roughly **~5 hours of partial attention** (including architectural layout), after about **~2 hours** of ruminating and note-taking before the AI was engaged. Human output: **0 LOC**. Calibrate “impressive vs alarming” against that half-day-scale investment — not against a multi-engineer sprint.

**Scope note — estimator:** `tools/estimate_repo.py` and related rates/tiers/HTML-MD outputs are **not functional Board/AIKB application code**. They generate a **management report on value and output of the AI/Human team**. Findings on contingency flags, monolith size, or HTML JS still matter for **report honesty**, but they are **out of band** for “does the board/API work.”

---

## 0. Context Matters: What "Non-Programmer + AI" Changes

Before the defect list, recalibrate expectations. This codebase was not written by a software engineer. It was written by an AI responding to prompts from a human architect who understands domains, processes, and what good looks like — but cannot write or review code themselves.

**What becomes more impressive:**
- `CONTEXT.md` is excellent — exactly the document a domain expert would write to orient a fresh AI.
- The RPGLE scanner handles free-format, fixed-format, mixed, SQLRPGLE, `/COPY`, CALLP, EXEC SQL, DCL-DS, CTL-OPT, and encoding fallback. That is real IBM i domain depth from the human, not generic AI knowledge.
- AIKB-028 (try/except at every boundary, trace-id everywhere) is followed with remarkable consistency across the package.

**What becomes more understandable (and less alarming):**
- **Duplicate bootstrappers** (`bootstrap_btt.py` vs `bootstrap_repo.py`): classic multi-session AI generation — ask for BTT-specific, then ask for generic, get two files.
- **`estimate_repo.py` monolith:** natural AI generation pattern; refactoring requires architectural decisions the human can't make and the AI won't volunteer.
- **`_JSON_FIELDS` triplicated:** each file likely generated in a separate context window.
- **Dead code** left after partial refactors: a human programmer would clean this; a non-programmer can't see it.
- **No tests / no auth:** the human wasn't prompted to ask for them; the AI built what was described.

**What this means:** The defects are real and should be fixed. They are evidence of the AI generation process, not fundamental architectural failure. The hard problems are already solved. What remains is cleanup, security hygiene, and a few genuine logic bugs.

### 0.1 Does 100% AI authorship change the recommendations?

**Short answer: it changes *how* and *in what order* you act — not *whether* the bugs are real.**

A wrong default port still breaks the quickstart. An ignored `--contingency` flag still lies to anyone who uses it. Missing auth still means "do not bind to the network." Physics and attackers do not grade on a curve for authorship.

What **does** change under a non-coding architect + AI-only implementation model:

| Dimension | Engineer-led project | Your model (architect directs, AI codes) |
|---|---|---|
| Who verifies a fix | Code review + CI | **Behavior the architect can see** (command output, browser, `/docs`, file diffs summarized in plain language) |
| Value of big refactors | High (maintainability) | **Lower until tests exist** — AI refactors without a human reader often re-break working paths |
| Value of tests | "Should have" | **Behavioral memory** — how a non-coder knows the next AI session didn't regress ports, contingency, auth (complements board export) |
| Value of board export | Nice ops artifact | **Semantic memory** — core product; how tomorrow’s Bob gets today’s map without cold-reading source |
| Value of dead-code cleanup | Hygiene | Real but **defer** — zero user-visible risk; burns session budget |
| Duplicate `bootstrap_btt` | Delete/merge soon | **Freeze and stop using** first; merge only with a written acceptance check |
| Auth / localhost | Ship blocker for deploy | Same blocker — **plus** the architect must treat "never set `AIKB_HOST=0.0.0.0` until auth exists" as an operational rule they own |
| Docs wrong | Embarrassing | **Critical** — docs are the architect's UI into the system; wrong uvicorn target wastes entire sessions |
| Prompting style | Ticket → PR | **One concern per session**, with paste-ready acceptance commands |

**Recommendations that stay identical (non-negotiable):**
1. Do not expose the Board API beyond localhost without an API key (or equivalent).
2. Fix port default mismatch (8000 vs 8765) — first-run trust.
3. Fix trace_id so one request = one id in logs and response (your own AIKB-028 rule).
4. Fix or remove `--contingency` until it actually changes output.
5. Fix CONTEXT.md commands so they work when copied literally.

**Two kinds of memory (do not collapse them):**

This project’s point is to give Bob back his yesterdays. That requires two complementary stores — neither replaces the other:

| Memory | What it holds | Artifact | Failure mode if missing |
|---|---|---|---|
| **Semantic** | What the system *is* — components, edges, decisions, rationale, truth hashes | Board API + **`aikb/board/` export in git** | Fresh Bob cold-reads source again; yesterdays are gone |
| **Behavioral** | What the system *must still do* after the next AI edit — ports, auth, contingency math, CRUD | **Tests** (`pytest`) | Silent regression; Bob “remembers” a board that describes a broken runtime |

An earlier draft of this review over-called tests “the only durable memory.” That was wrong relative to product intent. **Board export to git is the durable semantic session memory** — that is the core invention. Tests are the durable *behavioral* memory. Ship both; fund both; never treat one as a substitute for the other.

**Recommendations that get *upgraded* in priority for your model:**
1. **Automated tests become Must Fix, not Nice to Have** — as *behavioral* memory across AI coding sessions. Three tests (trace_id, contingency math, card create) beat a code review the architect cannot perform. They do **not** replace reading `aikb/board/`.
2. **Board export quality and habit become first-class** — re-export after meaningful bootstrap/API changes; keep `manifest.json` honest; treat board JSON as the handoff pack for the next Bob. Protect export from silent filename collisions and empty/wrong graphs (see edge-inference gap).
3. **Docs/quickstart accuracy becomes Must Fix.** You operate the system through README/CONTEXT and shell commands. A wrong `uvicorn aikb.main:app` is not a nit — it is a blocked day.
4. **Idempotent bootstrap becomes Should Fix sooner.** Re-running bootstrap is how you will "try again"; silent duplicate cards poison the semantic memory every future Bob reads.
5. **"Acceptance criteria in plain language" for every AI change.** Example: "After fix, default API URL is 8765; curl without key → 401 when key set; `--contingency 10` changes HTML math; `pytest` green; board re-export card/edge counts match expectation."

**Recommendations that get *downgraded* or deferred for your model:**
1. **Splitting `estimate_repo.py` into packages** — correct engineering, poor near-term ROI if you cannot review the split. Do it only after contingency/tests are green, in a dedicated session with "no behavior change" as the goal.
2. **Alembic / Postgres** — only when you leave single-file SQLite laptop mode. Until then: one documented rule — "schema change = delete `aikb.db` and re-bootstrap."
3. **Jinja2, structured logging, full CORS/pagination/DELETE suite** — product polish; after the trust and safety floor.
4. **Expanding RPGLE noise lists / fixed-format comment edge cases** — domain depth is already a strength; polish later unless you see false edges on a real IBM i repo.
5. **Deleting `RuntimeObservation` table** — cosmetic schema purity; leave it if CONTEXT already says "not built yet."

**Recommendations that change *shape* (same goal, different packaging):**

Instead of "hire a developer for an afternoon," use **prompt packs** — small, ordered AI sessions the architect can run:

| Session | Architect says (intent) | Architect verifies (no code reading) |
|---|---|---|
| A | "Default all Board API URLs to port 8765; fix CONTEXT uvicorn to `aikb.api.app:app`" | Copy-paste quickstart works; process listens on 8765 |
| B | "One trace id per request via `request.state`; same id in `X-Trace-Id` response and logs" | `curl -v` shows header; log line matches |
| C | "Require `AIKB_API_KEY`; reject missing key with 401; document in `.env.example`" | curl without key → 401; with key → 200 |
| D | "`--contingency 10` must affect cost math and labels" | Generate two HTMLs (10 vs 20); numbers differ |
| E | "Add pytest: trace_id, contingency, card CRUD" | `pytest` green; re-run after any later session |
| F | "Bootstrap twice must not duplicate component cards" | Second run updates or skips; card count stable |

**What the architect should *not* ask the AI to do in one blob:** "Clean up the whole codebase per the review." That recreates the generation problem (large diff, no verification, new silent bugs).

**Operational rules only the human can own (AI will not reliably enforce across sessions):**
- Keep `AIKB_HOST=127.0.0.1` until API-key session is done and tested.
- Prefer `--mode direct` bootstrap when the API is in flux — fewer moving parts.
- After every AI session: run the acceptance commands from that session; if they fail, **revert** (git) rather than "fix forward" in the same exhausted context.
- **Semantic memory:** after board-changing work, run export and commit `aikb/board/` — that is how tomorrow’s Bob gets today’s map. The live SQLite file is disposable; the exported board is not.
- **Behavioral memory:** keep `pytest` green before starting the next feature session.

**Net effect on grades:** Authorship does **not** raise the deployable-service grade (still D until auth + honest defaults). It **does** raise respect for the prototype grade: a non-coder reaching a working FastAPI + RPGLE + estimator system is an A for process leverage. The remediation plan should optimize for **architect-verifiable behavior**, **board export as semantic memory**, and **tests as behavioral memory** — not for elegant module boundaries alone.

---

## 1. Executive Summary


AIKB is a FastAPI + SQLite service that stores structured "cards" and "edges" describing a codebase so a fresh AI instance can orient without cold-reading source. The code is clean, well-commented, and consistent with its own rules.

| Area | Grade | Notes |
|---|---|---|
| Core idea / data model | A | Three-layer cards + truth tracking is well thought out |
| API surface | B- | Clean CRUD; missing auth, filters, pagination, DELETE |
| Scanners | A- | RPGLE is standout; Python is solid with minor dead code |
| Bootstrap / edge inference | B | Generic path is right; BTT-specific path undermines it; live board shows weak inference |
| Estimator (mgmt value report — not app runtime) | C+ | Useful leadership narrative tool; `--contingency` ignored, monolith, brittle JS — grade as **comms honesty**, not product core |

| Security | D | No auth, no rate limit, open by design if bound beyond localhost |
| Ops / k8s | C | Gitea stack exists; Board API itself has no k8s deploy; secrets externalized correctly |
| Tests | F | Empty `tests/` package |
| Docs accuracy | C+ | CONTEXT.md strong; several quickstart paths are wrong |

---

## 2. Security Vulnerabilities

### 2.1 CRITICAL — No Authentication or Authorization

**Files:** `aikb/api/app.py`, `aikb/api/cards.py`, `aikb/api/edges.py`

The entire Board API is wide open. No API key, bearer token, mTLS, or basic auth. Any process that can reach the bind address can read and mutate every card and edge.

```python
# api/app.py — no auth middleware, no dependency injection for auth
app = FastAPI(title="AIKB Board API", version="0.1.0")
```

Mitigating factor: `main.py` defaults to `127.0.0.1`. But:
- `AIKB_HOST` can override to `0.0.0.0` with no warning.
- k8s manifests exist for a public forge (`git.snwbd.com`), implying network exposure is in the roadmap.
- Docs never state "this is intentionally unprotected / localhost-only."

**Recommendation:** Add a shared-secret API key via FastAPI `Depends`. Reject missing/invalid `Authorization: Bearer <key>` (or `X-API-Key`) with 401. Put the key in env (`AIKB_API_KEY`) and document it in `.env.example`. ~30 lines. Block any non-localhost deploy until this lands.

### 2.2 MEDIUM — No Rate Limiting

**File:** `aikb/api/app.py`

No rate-limit middleware. A buggy bootstrap loop or hostile client can flood POSTs. SQLite write concurrency is limited; this is a trivial DoS.

**Recommendation:** `slowapi` or a simple token-bucket middleware. Cap something like 100 req/s per IP for v1. (Gitea ingress already has `ratelimit-standard` — the Board API should match that posture when exposed.)

### 2.3 MEDIUM — SQLite WAL + Multi-Process = Silent Corruption Risk

**File:** `aikb/db/session.py` (lines 33–42)

```python
_engine = create_engine(
    db_url,
    connect_args={"check_same_thread": False},  # required for SQLite
    echo=False,
)
@event.listens_for(_engine, "connect")
def _set_wal(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA foreign_keys=ON")
```

Today `main.py` runs single-process (`reload=False`) — fine. If anyone runs `--workers N` or multiple pods against one SQLite file, WAL + multi-writer is a footgun.

**Additional bug:** `connect_args={"check_same_thread": False}` is applied for **every** URL, including a future Postgres URL. That arg is SQLite-only and will break non-SQLite engines.

**Recommendation:**
1. Only pass `check_same_thread` when `db_url.startswith("sqlite")`.
2. Document single-process SQLite, or refuse to start if workers > 1.
3. For k8s multi-replica, plan Postgres (Gitea already shows the pattern of externalizing secrets).

### 2.4 LOW — `subprocess` with CLI-Controlled Paths

**Files:** `tools/estimate_repo.py`, `tools/export_board.py`

```python
cmd = ["git", "-C", str(repo)] + args   # estimate_repo pattern
subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(repo_root), ...)
```

Args are list-form (good — no shell injection). Residual risk is running git against an unexpected directory. `estimate_repo.py` checks `repo.is_dir()` but does **not** verify `(repo / ".git").exists()` before hammering git.

**Recommendation:** Require a `.git` directory (file or dir) before any git subprocess. Fail fast with a clear error.

### 2.5 LOW — `export_board --push` Can Push Without Confirmation

**File:** `tools/export_board.py`

`--push` runs `git push` with no dry-run, no branch check, no confirmation. Fine for a trusted operator; dangerous if scripted against the wrong remote.

**Recommendation:** Default push to current upstream only; log remote/branch; optional `--dry-run`.

### 2.6 INFO — Gitea k8s Posture Is Reasonable

**Files:** `k8s/03-gitea.yaml`, `k8s/06-ingressroutes.yaml`

Positive findings:
- Registration disabled, sign-in required.
- Secrets via `secretKeyRef` (not inline).
- HTTPS redirect + rate limit + secure headers on IngressRoute.
- Resource limits and probes present.

Gaps:
- No Board API Deployment/Service — k8s is forge-only today.
- SSH Service is `LoadBalancer` on port 22 — ensure MetalLB/firewall scope is intentional.
- `ENABLE_SWAGGER = true` on a private forge is minor surface; disable if not needed.

---

## 3. Bugs and Defects

### 3.1 CONFIRMED BUG — Trace IDs Diverge When Client Omits Header

**Files:** `aikb/api/app.py` (lines 58–63), `aikb/api/cards.py` / `edges.py` (every handler)

Middleware:
```python
trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
response = await call_next(request)
response.headers["X-Trace-Id"] = trace_id
```

Handlers:
```python
trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
```

If the client does **not** send `X-Trace-Id`, middleware generates UUID-A and puts it on the **response**. The handler never sees UUID-A (it is not injected into `request.state` or headers) and generates UUID-B for logs. **Log correlation is broken for the default case.**

This directly violates the spirit of AIKB-028 ("propagated unchanged, never dropped") and the CONTEXT.md claim that responses and errors share one trace id.

**Recommendation:**
```python
@app.middleware("http")
async def _propagate_trace_id(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
    request.state.trace_id = trace_id
    response = await call_next(request)
    response.headers["X-Trace-Id"] = trace_id
    return response
```
Handlers: `trace_id = getattr(request.state, "trace_id", None) or str(uuid.uuid4())`.

### 3.2 CONFIRMED BUG — `--contingency` CLI Flag Is Ignored

**Scope:** Management value-report tool only — not Board API runtime. Still a real honesty bug if leadership is shown contingency-adjusted numbers.

**File:** `tools/estimate_repo.py`

- Parsed at line 961: `parser.add_argument("--contingency", type=float, default=20.0, ...)`
- Hardcoded at lines 360–362:
```python
"contingency_cost": base_cost * 0.2,
"adjusted_cost": base_cost * 1.2,
"adjusted_hrs": total_hrs * 1.2,
```
- Call site line 1045 never passes `args.contingency`.
- HTML/Markdown also hardcode `+20%` labels (lines 585, 857, 896, 899).

**Recommendation:** Thread `contingency_pct` into `_scenario_cost` and all render paths. Use `pct/100` everywhere; label dynamically.

### 3.3 CONFIRMED BUG — Bootstrap Default Port Is 8000; Server Is 8765

**Files:**
- `main.py` line 16 → default port **8765**
- `bootstrap_btt.py` line 518 → `http://localhost:8000`
- `bootstrap_repo.py` line 612 → `http://localhost:8000`
- Docstrings in both tools advertise 8000
- README quickstart correctly shows `--url http://localhost:8765`, but env default without `--url` still fails

**Recommendation:** Change both defaults and docstrings to `http://localhost:8765`. Add `AIKB_API` to `.env.example`.

### 3.4 CONFIRMED BUG — `export_board.py` Dead / Half-Refactored Filename Code

**File:** `tools/export_board.py` (lines 253–258)

```python
filename = _card_filename(type("_", (), card_dict)())  # cheap object for _card_filename
# simpler: derive filename directly from dict
name = (card_dict.get("component_name") or card_dict.get("title") or card_dict["id"])
safe = "".join(...).strip("_")
filename = f"{safe}.json"
```

First assignment is dead. `_card_filename` (lines 43–49) is only used here and can be deleted.

**Related:** Two cards that sanitize to the same filename silently overwrite each other. Use `{safe}-{id[:8]}.json` or detect collisions.

### 3.5 CONFIRMED BUG — `get_session()` Rollback Can Mask the Original Exception

**File:** `aikb/db/session.py` (lines 70–72)

```python
except Exception:
    session.rollback()
    raise
```

If `rollback()` raises, it replaces the original exception.

**Recommendation:**
```python
except Exception:
    try:
        session.rollback()
    except Exception as rollback_exc:
        logger.error("rollback failed: %s", rollback_exc)
    raise
```

### 3.6 CONFIRMED BUG — `event.currentTarget` in Generated HTML

**File:** `tools/estimate_repo.py` (lines 645, 660)

Uses the non-standard global `event` (IE / Chrome quirk). Breaks under strict mode / some browsers / CSP.

**Recommendation:** `onclick="switchTab('cost', event)"` and `function switchTab(name, event)`.

### 3.7 CONFIRMED BUG — Dead `ast.walk` Loop in Python Scanner

**File:** `analysis/python_scanner.py` (lines 120–124)

```python
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        pass  # collected below via direct body iteration
```

No-op full-tree walk before the real `tree.body` pass. Delete it.

### 3.8 CONFIRMED BUG — `_RE_PROTO_CALL` Compiled Never Used

**File:** `analysis/rpgle_scanner.py` (line 79)

Dead compiled regex. Remove or implement prototyped-call detection intentionally.

### 3.9 CONFIRMED BUG — CONTEXT.md Quickstart Invokes Wrong ASGI App

**File:** `CONTEXT.md` (lines 217–218)

```bash
uvicorn aikb.main:app --reload
```

`aikb/main.py` defines `main()` only — it does **not** export `app`. The real app is `aikb.api.app:app`. This command fails immediately.

**Recommendation:** Document either `aikb` / `python -m aikb.main` or `uvicorn aikb.api.app:app --host 127.0.0.1 --port 8765`.

### 3.10 CONFIRMED BUG — `bootstrap_btt` Omits `web_ui`; Live Board Shows Inference Gap

**Evidence:**
- `_BTT_SERVICES` lists 5 services — no `web_ui`.
- Exported board has **6** cards including `web_ui.json`.
- Exported `edges.json` has **1** edge (`api_gateway → load_gen` via `call: api_load_gen_start`).
- `_KNOWN_EDGES` in `bootstrap_btt` lists 5 architectural edges that are **not** what ended up exported — so the live export likely came from generic inference, which missed most BTT topology.

**Recommendation:** Delete or freeze `bootstrap_btt` as legacy; invest in richer Python edge inference (httpx/requests URL and env-var scanning is documented in the module docstring but **not implemented** — only path/function name fuzzy match exists). Optionally allow a JSON "known edges" overlay for human-confirmed topology.

### 3.11 BUG — Error Bodies Are Not the Documented Shape

**Files:** `api/schemas.py` (`ErrorResponse`), all routers, `CONTEXT.md` line 108

CONTEXT promises: `{"trace_id": "...", "detail": "..."}`.  
Actual: `HTTPException(detail=f"DB error — trace_id {trace_id}")` → FastAPI body `{"detail": "DB error — trace_id ..."}` with **no** structured `trace_id` field. `ErrorResponse` is never referenced.

**Recommendation:** Custom exception handler that returns `ErrorResponse`, or build `detail` as a dict `{"trace_id": ..., "detail": ...}`. Wire `responses={...}` on routes for OpenAPI.

### 3.12 BUG — `init_db()` Is Not Idempotent for Event Listeners

**File:** `aikb/db/session.py`

Each `init_db()` call registers a new `@event.listens_for(_engine, "connect")` handler. Tools that call `init_db` multiple times in one process stack duplicate PRAGMA executors. Also replaces globals without disposing the old engine.

**Recommendation:** Guard with `if _engine is not None: return`, or dispose/recreate cleanly; register the listener once.

### 3.13 DESIGN BUG — Bidirectional `delete-orphan` on Edges

**File:** `aikb/db/schema.py` (lines 127–137)

```python
outgoing_edges: ... cascade="all, delete-orphan"
incoming_edges: ... cascade="all, delete-orphan"
```

`delete-orphan` on **both** sides of a many-to-one association is a known SQLAlchemy hazard (orphan detection ambiguity when an edge appears in two collections). FK `ondelete="CASCADE"` already covers DB-level cleanup. There is no DELETE card API yet, so this is latent — it will bite when DELETE is added.

**Recommendation:** Use `cascade="all"` without `delete-orphan` on edge relationships, or only on one side with explicit ownership semantics.

---

## 4. Architecture and Design Issues

### 4.1 `bootstrap_btt.py` Contradicts "Everything Else Is Pluggable"

Hardcoded service set, descriptions, and edges. Generic `bootstrap_repo.py` already exists. BTT-specific human narrative is valuable — it should be data (`board/overlays/btt.json`), not a second Python program with duplicated HTTP/DB paths (~200 lines copy-paste: `_compute_static_hash`, POST/PATCH helpers, dual-mode runners).

**Recommendation:** Delete `bootstrap_btt.py` after moving descriptions/known edges to config consumed by `bootstrap_repo.py`.

### 4.2 Python Edge Inference Does Not Match Its Own Docs

Module docstring claims:
> scans for httpx/requests/aiohttp call sites; matches URL strings and env var names

Actual `_infer_edges_python` only fuzzy-matches component names inside endpoint paths and function names. `_RE_PY_URL_VAR` and `_RE_PY_GETENV` are **defined and never used**.

That explains the anemic live graph (1 edge).

**Recommendation:** Implement the documented strategies or delete the dead regexes. Highest value: scan source text for `os.getenv("ORDER_SERVICE_URL")`-style names and httpx base URLs.

### 4.3 `estimate_repo.py` Is a 1,104-Line Monolith

Contains git parsing, session analysis, WBS math, cost scenarios, HTML (inline CSS/JS), Markdown, and CLI. Untestable as a unit.

**Recommendation:** Split into:
- `estimate_repo.py` — CLI orchestration
- `estimate/git_analysis.py`
- `estimate/wbs_math.py`
- `estimate/render_html.py` / `render_md.py` (prefer Jinja2 over f-string HTML)

### 4.4 JSON-as-TEXT Without a Single Source of Truth

`_JSON_FIELDS` appears in:
- `api/helpers.py`
- `api/cards.py` (subset — missing `"schema"`)
- `tools/export_board.py` (inline twice)

Add a field in the ORM, forget one set → silent corruption (object stored via `str()` path or string not decoded).

**Recommendation:** `JSON_FIELDS: frozenset[...]` in `db/schema.py` or `db/constants.py`; import everywhere. Longer-term: SQLAlchemy `JSON` type (works on SQLite 3.9+ via SQLAlchemy).

### 4.5 No Migrations

`Base.metadata.create_all` only. Schema evolution requires delete-and-rebootstrap.

**Recommendation:** Alembic from day one of any shared/persistent DB. Until then, document breaking change procedure in README.

### 4.6 `RuntimeObservation` Schema Without API

Fully modeled; zero endpoints. CONTEXT admits "not built yet." Dead weight in the ORM and relationship graph.

**Recommendation:** Remove until implemented, or add minimal POST/GET in the same PR that needs it.

### 4.7 Missing API Capabilities the Product Will Need Immediately

| Gap | Why it matters |
|---|---|
| No `DELETE` cards/edges | Can't correct bootstrap mistakes without DB surgery |
| No filter on `GET /edges?source_id=` | Topology views need it (CONTEXT already lists this) |
| No pagination / limit on list endpoints | Fine for 6 cards; fails at hundreds |
| No idempotent upsert by `component_name` | Re-bootstrap creates duplicate component cards |
| No CORS middleware | Future browser UI cannot call the API |

Re-bootstrap duplication is especially sharp: every `POST /cards` always inserts. Running bootstrap twice doubles the board.

**Recommendation:** Unique constraint on `component_name` where type=component (partial unique index), plus upsert or "skip if static_hash unchanged" in bootstrap.

### 4.8 `kube.ps1` Assumes Local Binaries

Expects `kubectl.exe` and `kubeconfig` beside the script; neither is in the repo. Fails opaquely.

**Recommendation:** Existence check with actionable error, or drop the wrapper.

### 4.9 Forge Discovery Is Shallow

`discover_components` only iterates **one level** of `service_dir`. Monorepos with `services/foo/bar` or language roots mixed with infra dirs get noise or misses. Language `unknown` still creates components for any non-hidden directory.

**Recommendation:** Allow `--depth`, ignore lists (`k8s`, `docs`, `tests`, `fixtures`), and skip `unknown` unless `--include-unknown`.

### 4.10 Estimator Math Duplication

`HEADCOUNT` in `estimate_repo.py` line 61 duplicates `rates.json` `_roles.*.count`. Drift risk.

**Recommendation:** Load headcount from `rates.json` only.

---

## 5. Code Quality Issues

### 5.1 AIKB-028 Is Slightly Over-Applied

Wrapping pure in-memory logic in try/except (e.g. some Path operations that only fail on type errors) adds noise. The rule is right for IO/network/DB; applying it to every function dilutes signal in logs.

**Recommendation:** Keep the rule for boundaries; don't require it for pure functions.

### 5.2 Deprecated FastAPI Startup Hook

```python
@app.on_event("startup")
def _startup() -> None:
```

FastAPI/Starlette prefer lifespan context managers. `on_event` is legacy.

**Recommendation:** Migrate to `lifespan=` on `FastAPI()`.

### 5.3 Unused Imports

`cards.py` imports `json`, `Any`, `Session` without use. `edges.py` imports `json`. Minor clutter.

### 5.4 RPGLE `_CALLP_NOISE` Incomplete (Secondary)

Noise set misses many built-ins (`alloc`, `scan`, `subst`, `trim*`, `lookup`, …). Primary filter is exported-proc membership in `_infer_edges_rpgle` — good — so impact is limited to pollution of `callp_targets` on the card semantic blob.

**Recommendation:** Expand noise set; consider not persisting raw CALLP lists that don't resolve to exports.

### 5.5 Fixed-Format Comment Handling

Free-format strips `//`. Fixed-format lines do not strip `*` comments in column 7; rare false matches possible on commented-out CALLP/D-specs.

### 5.6 Health Check Does Not Touch DB

`/health` returns ok even if SQLite is locked or missing after startup. Fine for liveness; add `/ready` that runs `SELECT 1` for k8s readiness later.

### 5.7 Logging Format Has No `trace_id` Field by Default

Trace ids are printf'd into messages ad hoc. Structured logging (`extra={"trace_id": ...}`) would make aggregation easier.

---

## 6. Testing

### 6.1 No Tests Exist

`tests/` contains only `__init__.py`. `pyproject.toml` lists pytest/httpx/pytest-asyncio as optional dev deps — unused.

**Minimum suite that would lock the real bugs:**
1. `test_trace_id_middleware` — no inbound header → same id in response header and handler log context/`request.state`
2. `test_cards_crud` — create/list/get/patch via `TestClient`
3. `test_json_roundtrip` — nested dict endpoints survive serialize/deserialize
4. `test_edge_fk_validation` — 422 on missing source/target
5. `test_python_scanner_fastapi` — fixture file with `@router.get` 
6. `test_rpgle_scanner_export` — fixture with `DCL-PROC Foo EXPORT`
7. `test_contingency_flag` — `--contingency 10` changes math
8. `test_bootstrap_port_default` — default URL ends with `:8765`

Without tests, every AI session is one prompt away from regressing port defaults and contingency math again.

---

## 7. Documentation

### 7.1 CONTEXT.md Is Excellent (With Caveats)

Best artifact in the repo for AI handoff: honest "not built yet" table, accurate model summary, clear success criterion.

Fix:
- Wrong uvicorn target (`aikb.main:app`)
- Bootstrap default port story still confusing vs code defaults
- Stale path references (`.bob/playground/aikb`)

### 7.2 README Is Tight and On-Message

Philosophy paragraph is strong. Quickstart uses explicit `--url http://localhost:8765` (good) but doesn't mention `AIKB_API` / auth / localhost binding.

### 7.3 `.env.example` Incomplete

Missing: `AIKB_HOST`, `AIKB_PORT`, `AIKB_API`, future `AIKB_API_KEY`.

### 7.4 OpenAPI Won't Show Error Model

Because `ErrorResponse` is unused in routes.

---

## 8. What's Good

1. **Consistent boundary discipline.** try/except + logging of attempted operation + exception type is real operational hygiene.
2. **RPGLE scanner.** Niche, thorough, encoding-aware — standout module.
3. **Modern Python stack.** SQLAlchemy 2.0 `Mapped[]`, Pydantic v2, `str | None` — no legacy cruft.
4. **CONTEXT.md as AI onboarding.** Model for other projects.
5. **Dual-mode tools** (API vs direct DB) — pragmatic for bootstrap chicken-and-egg.
6. **Board export to git** — the product’s semantic session memory; next Bob should read `aikb/board/`, not only a live API or cold source. This *is* giving Bob back his yesterdays.
7. **Estimator as management value/output report** (rates/tiers data separated from code) — right instinct for leadership storytelling, even though contingency flag is broken; correctly kept out of the Board runtime path.
8. **Gitea manifests** — secrets, probes, TLS, rate limits show production instincts on the forge side.
9. **Edge model with `truth_source` and `stale`** — ready for divergence detection later.
10. **Success criterion is testable** — "fresh Bob answers from GET /cards only" is the right north star.

---

## 9. Prioritized Action Items

### Must Fix — Trust & Safety Floor (architect can verify without reading code)

| # | Issue | Why this rank under AI-only authorship | Effort |
|---|---|---|---|
| 1 | Fix default API port 8000 → 8765 | First command must work; you cannot "see" the bug in source | 5 m |
| 2 | Fix CONTEXT.md / README commands (uvicorn target, ports) | Docs are your control panel | 15 m |
| 3 | Fix trace_id via `request.state` | Your stated non-negotiable rule; verify with `curl -v` + one log line | 30 m |
| 4 | Fix `--contingency` ignored (**value-report tool**, not Board runtime) | Verify by generating two management reports and comparing | 30 m |
| 5 | Add API key auth + `.env.example` | Operational rule you own: no non-localhost without this | 1 h |
| 6 | **Seed 3–8 pytest tests** (trace_id, contingency, card CRUD, port default) | **Behavioral memory** across AI sessions (complements board export, does not replace it) | 2–4 h |
| 7 | Fix `get_session` rollback masking + SQLite-only `check_same_thread` | Small; bundle with auth session | 20 m |
| 8 | Rate limit before any non-localhost bind | Same deploy gate as auth | 30 m |

### Should Fix — Before New Features (still AI-implementable; verify by behavior)

| # | Issue | Notes for architect-led process | Effort |
|---|---|---|---|
| 9 | Idempotent bootstrap (no duplicate cards on re-run) | You *will* re-run bootstrap; duplicates poison every future AI | 2 h |
| 10 | Implement or remove documented Python edge inference | Prefer "make board edges match BTT story you know" over clever regex | 2–4 h |
| 11 | Freeze `bootstrap_btt.py` (stop calling it); optional later merge | Don't big-bang delete/merge until tests exist | 30 m / 2 h |
| 12 | Centralize `_JSON_FIELDS` | Low visibility; do in a "no behavior change" session with tests green | 30 m |
| 13 | `ErrorResponse` global handler | Verify error JSON shape with curl | 45 m |
| 14 | Document SQLite reset policy ("delete db + re-bootstrap") | Beats Alembic until you leave laptop mode | 15 m |
| 15 | Fix `event.currentTarget`; dynamic contingency labels | Visible in browser | 20 m |

### Defer Under This Authorship Model (good engineering, weak near-term ROI)

| # | Issue | Why defer |
|---|---|---|
| 16 | Split `estimate_repo.py` monolith | Large diff, hard for you to verify; wait for tests |
| 17 | Alembic / Postgres | Only when multi-user or k8s Board API |
| 18 | Dead code deletion (`ast.walk`, `_RE_PROTO_CALL`, …) | No user-visible failure |
| 19 | `delete-orphan` cascade tuning | Latent until DELETE exists |
| 20 | Jinja2, structured logging, full OpenAPI polish | After floor is green |
| 21 | RuntimeObservation API or drop table | Already labeled not built |
| 22 | Board API k8s Deployment | Forbidden until auth + tests |
| 23 | RPGLE noise-list expansion | Unless false edges appear on a real repo |
| 24 | CORS / pagination / DELETE | When UI work starts — then yes, promptly |

---

## 10. Concrete Sequence — Optimized for Non-Coding Architect + AI

Not "maximum elegant cleanup." **Maximum trust per session**, each with a pass/fail the architect can run.

1. **Session A — Honest defaults (15 min)**  
   Ports 8765 everywhere; CONTEXT/README launch commands work copy-paste.  
   *Verify:* `aikb` or documented uvicorn listens on 8765; no reference to `:8000` in tool defaults.

2. **Session B — Contingency truth (30 min)**  
   `--contingency` drives math + labels.  
   *Verify:* two HTML outputs differ when flag is 10 vs 20.

3. **Session C — Trace id (30 min)**  
   `request.state.trace_id`; one id everywhere.  
   *Verify:* `curl -v http://127.0.0.1:8765/health` → `X-Trace-Id`; matching log line if logging visible.

4. **Session D — API key (1 h)**  
   `AIKB_API_KEY` required when set; 401 otherwise.  
   *Verify:* curl without key fails; with key succeeds. **Human rule:** keep host on 127.0.0.1 until this passes.

5. **Session E — Behavioral memory (2 h)**  
   pytest for A–D behaviors.  
   *Verify:* `pytest` green. **Never start a feature session if pytest is red.**

6. **Session F — Semantic memory hygiene (2 h)**  
   Bootstrap idempotency + reliable board export (no duplicate cards; export committed).  
   *Verify:* second bootstrap does not double cards; `export_board` writes coherent `aikb/board/`; manifest counts match what you believe about the system.

7. **Only then** — edge inference quality (richer yesterdays), BTT overlay config, UI, observations, k8s Board API.

Skip bundling "delete all dead code + split estimate_repo + Alembic" into these sessions. That is how AI-only projects thrash.

---

## 11. Bottom Line

AIKB is a **~0.3 release** with a **0.8 idea**.

The core thesis — a persistent, structured, AI-readable board as the intelligence layer between human sessions — is right. The card model (narrative / semantic / context + truth hashes) is better than most greenfield "AI memory" toys. The RPGLE work proves this is not generic CRUD; it is aimed at real enterprise codebases.

What keeps it at 0.3:
- **Security non-existence** on the API (acceptable only while strictly localhost and honest about it).
- **Broken defaults and ignored flags** (port 8000 vs 8765, `--contingency`) — classic AI-generation drift that destroys first-run trust.
- **Trace-id implementation bug** that undermines the project's own non-negotiable rule.
- **Edge inference gap** between documentation, BTT hardcoding, and the single edge actually exported.
- **Zero tests**, so the next AI session will reintroduce the same class of bugs.

**On authorship:** 100% AI implementation under a non-coding architect does **not** excuse shipping broken defaults or an open API. It **does** mean remediation should be packaged as small, behavior-verifiable AI sessions (Section 10), with **tests on the trust floor as behavioral memory**, **board export treated as semantic memory** (the product’s actual thesis), and large refactors deferred until both are trustworthy. The architect's job is acceptance commands and operational rules (localhost until auth; export after board changes); the AI's job is narrow diffs.

**Correction incorporated from project response:** tests-as-session-memory is necessary but incomplete. *The board export to git is the durable semantic session memory; tests are the behavioral memory. Both matter; neither replaces the other.* That pairing *is* “giving Bob back his yesterdays” — map plus proof the map still runs.

None of the must-fixes require redesign. Sessions A–F in Section 10 can take this to **~0.7** without a human reading code: honest quickstart, contingency that works, correlated logs, API key, pytest green, and a board export worth reading tomorrow.

Do **not** expose this on a network path, merge k8s Board API manifests, or treat bootstrap as idempotent until the trust floor (Section 9 Must Fix) and Session F are done.

**Final grade: B- as a vision prototype (A for process leverage given authorship). D as a deployable service. A for RPGLE/domain ambition.** Fix the D-row issues via architect-verifiable sessions; the B- becomes an A- foundation worth building the Carbon UI and observation pipeline on top of.

---

## 12. Will This Help Against the Vibe Code Wall?

**Context for this answer:** In-house tools and client demos of the art of the possible — not production SaaS. Directives already include try/except at boundaries and security built in from the start. Throwaway is allowed; sloppy is not. The economic path is: pique interest → absorb feedback → evolve a living design specification that a full coding team can take to production quality.

**Short answer: Yes — with refinement, AIKB is one of the few tools that attacks the wall’s actual mechanism, not its symptoms. It will not abolish the wall. Used as intended, it can delay the wall, shrink the blast radius, and turn demo residue into a handoff artifact a real team can trust more than a chat log.**

### What the wall is (for this assessment)

From the wall analysis line of work: you hit the wall when **apparent correctness decouples from actual correctness** and you have **no instrument** to detect the gap. Progress stops because every fix is a guess against an unknown baseline. Two components:

1. **Mechanism / narration divergence** — the artifact’s output is its own assertion (looks right; isn’t checkable).
2. **Periphery shedding** — vivid center gets built; boring, unverifiable requirements quietly drop.

Anti-wall behavior is anything that forces **contact with something outside the model’s story**: real boundaries, falsifiers, accumulated ground truth.

### Where AIKB helps (real benefit)

| Wall pressure | What AIKB does | Why it matters in *your* use case |
|---|---|---|
| Fresh Bob has no yesterdays | Semantic memory: cards/edges + **git board export** | Demo sessions and client pivots don’t reset the map to zero |
| “It looks done” with no check | Behavioral memory: tests + try/except + trace-id *when fixed* | Demo can be wrong; you can still *detect* wrong |
| Periphery shedding across sessions | Board holds decisions, assumptions, mistakes_log, acceptance criteria | The quiet requirements have a place to live that isn’t the chat scrollback |
| Client feedback evaporates | Living board → living design spec | Feedback becomes cards/edges, not “we talked about that Tuesday” |
| Handoff to a real team | Exported board + CONTEXT + API as orientation pack | Team inherits a structured spec, not a vibe and a zip of HTML |
| Security/try-except as culture | AIKB-028 + “security from scratch” as non-negotiables on the board itself | Directives become part of the memory layer, not a hope the next prompt remembers |

For **capability demos and design-spec harvesting**, that is high leverage. The product is not “replace the coding team.” The product is **stop losing the plot between sessions and between humans and models.**

### Where AIKB does *not* save you (honest limits)

1. **It does not execute the client’s system under test.** A beautiful board can still describe a narrated lie if bootstrap/inference was shallow (today: 1 edge for BTT). Semantic memory without contact with runtime is a **well-indexed story**. You still need demos that hit real boundaries (your picker-vision / live verify instinct).
2. **It does not stop periphery shedding by itself.** Models will still optimize the vivid center unless the board’s acceptance criteria and “not built yet” lists are **actively used as the prompt substrate** every session — not archived.
3. **Garbage-in still compounds.** Idempotent bootstrap, honest exports, and human-confirmed edges matter more than UI chrome. A wrong board is worse than no board: it *feels* like yesterdays while teaching tomorrow’s Bob false geography.
4. **Production quality remains the downstream team’s job.** AIKB can be the **design specification spine**; it should not be mistaken for production hardening, load proof, or compliance evidence.
5. **Without behavioral memory (tests) and fixed trace correlation, you re-introduce the wall inside AIKB itself** — the tool that was meant to prevent the wall becomes another plausible artifact. That is why the trust-floor sessions still matter even when “production code quality is not expected.”

### Fit to “if one is to do it… one must do it right”

For throwaway/demo code, “right” is not clean architecture awards. **Right means:**

- Boundaries fail loudly (try/except + trace).
- Dangerous defaults don’t pretend to be safe (localhost + auth before expose).
- The story of the system is **exportable and re-loadable** (board in git).
- The next session can be told: *read the board first; only then touch code.*
- Client “what if we change X?” becomes a card update + re-demo, not a greenfield rewrite.

That bar is exactly what AIKB is aimed at. Production polish (Alembic, k8s Board API, Carbon UI) is optional until a client or internal stake requires it. **Memory discipline is not optional** if the goal is a living spec.

### Will further refinement make the benefit “real”?

**Yes, if refinement prioritizes wall-resistance over feature surface:**

1. Trust floor (ports, docs, trace_id, auth posture, contingency truth).  
2. Behavioral memory (thin pytest).  
3. Semantic memory hygiene (idempotent bootstrap, export habit, richer/honest edges — including human overlays for what you *know* from architecture).  
4. **Workflow rule:** every Bob session starts from `aikb/board/` + CONTEXT; every meaningful change ends in export.  
5. **Client loop rule:** feedback → cards (decision/work) with acceptance criteria → demo against those criteria → update mistakes_log when wrong.  

**Diminishing returns / distraction:** splitting estimate_repo, pretty UI, observation pipeline — valuable later; they don’t move the wall needle until 1–5 exist.

### Bottom line on the wall question

| Question | Answer |
|---|---|
| Can AIKB prevent the Vibe Code Wall entirely? | **No.** The wall is structural to unverified generation. |
| Can it provide **real benefit** against the wall for demos + living design specs? | **Yes.** Especially semantic memory in git + forced orientation + a place for periphery and decisions. |
| Is it worth refining under “not production, but do it right”? | **Yes** — refine the memory and honesty path, not enterprise cosplay. |
| What’s the success metric that isn’t vanity? | A fresh Bob, given only board export + CONTEXT, answers correctly about the system **and** a thin test/demo falsifier still passes after the last change. Client feedback appears as cards, not folklore. A coding team can start from the board without reverse-engineering chat. |

**Verdict:** Given further refinement along the trust-floor and dual-memory path — and given your actual use case (demo → feedback → living spec for a real team) — AIKB is **strategically aligned with anti-wall practice** and likely to deliver **disproportionate benefit per hour** compared to building more demo features. Treat it as the **spine of yesterdays and of the design contract**, not as the production system and not as a substitute for hitting real runtime boundaries when you claim something works.

---

## 13. Evaluation — LLM Gatekeeper for the Board (Guarded Semantic Memory)

**The proposal:** Place a local small LLM or remote large LLM in charge of the board. The human architect cannot touch or alter cards *except through* the LLM intermediary. The LLM only alters or promotes cards upon explicit human approval. Intent: a self-maintaining board, isolated from arbitrary changes.

This is a governance model, not a feature. It changes *who is allowed to write* and under what conditions.

### 13.1 What problem this solves

| Pain point | How the gatekeeper addresses it |
|---|---|
| AI coding sessions silently corrupt the board (wrong edges, duplicate cards, hallucinated fields) | Only the gatekeeper writes; coding sessions talk to the gatekeeper, not the raw API |
| Human accidentally POSTs a malformed card | Gatekeeper validates schema, FK references, edge consistency before writing |
| No one notices that cards went stale after the last bootstrap | Gatekeeper actively compares static_hashes, flags drift, proposes updates |
| The board accumulates nonsense because "Bob doesn't remember yesterday" | **Gatekeeper IS Bob's memory** — it reads the board, maintains consistency, and presents proposed changes for approval |
| Bootstrap runs twice and doubles component cards | Gatekeeper detects duplicates and blocks or merges |
| No audit trail of who changed what | Every mutation has: human approval timestamp, gatekeeper trace_id, before/after snapshot |

This directly attacks the biggest risk in an AI-only architecture: **semantic memory corruption going undetected**.

### 13.2 What the gatekeeper CAN do well

| Capability | Model requirement |
|---|---|
| **Structural validation** (schema, FK, enums, required fields) | Deterministic; no LLM needed. LLM adds value by *explaining* rejections in plain language. |
| **Cross-reference integrity** ("edge target doesn't exist — create it first?") | Small local model sufficient |
| **Duplicate detection** (same component_name) | Deterministic; no LLM needed |
| **Staleness detection** (static_hash drift) | Deterministic; LLM can summarize "what changed" |
| **Edge inference assistance** ("CALLP to PROC_X in component A; PROC_X exported by B — add edge?") | Benefits from LLM reasoning about edge type and label |
| **Consistency across card layers** ("description says 3 endpoints but semantic layer has 4") | Medium+ LLM for nuance |
| **Audit trail** | Deterministic |
| **Proactive maintenance proposals** ("5 cards not re-scanned in 2 weeks") | Small model for scheduling; LLM for explanation |

### 13.3 What the gatekeeper CANNOT do

| Cannot do | Why | Mitigation |
|---|---|---|
| **Verify factual truth of card content** | LLM has no more ground truth about your system than you do | Truth from scanners + tests + human domain knowledge |
| **Replace behavioral memory (tests)** | A structurally valid board can still describe a broken system | Tests are behavioral memory; gatekeeper is semantic memory guardian |
| **Judge architectural correctness** | "Should api_gateway proxy to order_service?" — gatekeeper checks if edge exists, not if architecture is sound | Human architect owns architectural judgment |
| **Prevent the human from being wrong** | If architect says "add card X with description Y," gatekeeper writes it | Gatekeeper is a consistency layer, not an oracle |
| **Operate without explicit approval rules** | "Promote only on human approval" is policy, not code | Define in config: auto-approve for schema fixes, require-approve for content changes |

### 13.4 Risks and failure modes

| Risk | Severity | Mitigation |
|---|---|---|
| **LLM gatekeeper hallucinates during mediation** | High | Gatekeeper should **propose, not auto-apply**. Human always sees the diff. |
| **Gatekeeper becomes a bottleneck** | Medium | "Guarded" mode for production; "direct" mode (with audit) for rapid prototyping. Batch proposals. |
| **Gatekeeper is unavailable → board frozen** | Medium | Direct DB mode as emergency fallback with strong audit. Board export in git as read-only reference. |
| **Gatekeeper itself drifts across sessions** — governance rules change, rubber-stamps everything | High | **Governance rules in version-controlled config** (JSON/YAML). Gatekeeper behavior tests. Adversarial review of gatekeeper as part of sprint cadence. |
| **Remote large model cost/latency for every card touch** | Low-Medium | Local small model for structural validation; remote only for semantic reasoning. Batch operations. |
| **Architect can't do a quick typo fix without a conversation** | Low | "Quick-approve" path for well-understood mutation types (status updates, typo fixes). |
| **Gatekeeper disagrees with architect and blocks progress** | Medium | Architect override capability (with audit). Gatekeeper advises; architect decides. Block only for structural violations. |

### 13.5 Architecture sketch

```
CURRENT:
  Human ──(prompt)──→ AI coding session ──(raw POST/PATCH)──→ Board API ──→ SQLite
  Bootstrap tools ──(raw HTTP/DB)──→ Board API

PROPOSED ("guarded board"):
  Human Architect ──(approval)──→ LLM Gatekeeper ("aikb-guard")
                                    │
                                    ├── Proposes changes for approval
                                    ├── Validates structure, FK, consistency
                                    ├── Actively detects staleness, duplicates
                                    ├── Maintains audit log
                                    └── Writes approved changes → Board API
                                    
  AI coding sessions ──(propose)──→ Gatekeeper ──(await approval)──→ Board API
  Bootstrap/scanners ──(propose)──→ Gatekeeper ──(await approval)──→ Board API
  export_board ──→ reads Board API ──→ writes aikb/board/ to git (read-only; no bypass)

NEW COMPONENTS:
  aikb-guard/           # New service (or middleware on existing API)
    guard.py            # Gatekeeper core: approve/reject/audit
    policy.yaml         # Governance rules: what's auto, what needs approval
    proposals/          # Queue of pending mutations awaiting human approval
```

**What survives:** Board API (cards.py, edges.py) — still canonical store. Gatekeeper calls it; no one else gets write access. Bootstrap tools become *proposal generators*. Export stays read-only.

**What must change:**
1. Board API must enforce auth (already Must Fix #5). Gatekeeper has its own API key; no other service account has write.
2. `bootstrap_repo.py` becomes a proposal generator, not a direct writer.
3. Gatekeeper needs its own pytest suite.
4. Architect's operational rule: "read board + CONTEXT + pending proposals from gatekeeper."

### 13.6 Gitea fork consideration

**Gitea as git backend (unchanged):** The existing Gitea k8s stack hosts the board export in git. This is already the plan and needs no fork. The gatekeeper commits approved board exports to Gitea.

**Gitea as approval workflow engine:** Using Gitea PR/issue/comment workflow as the human approval mechanism. Clever reuse of forge tooling, but adds friction for rapid single-human changes.

**Recommendation:** Keep Gitea as the git backend. Don't force card-level approval through git PRs — too heavy for a single-human system. Instead, gatekeeper presents proposals through the UI (when Carbon UI exists) or a simple CLI approval loop (`aikb approve --proposal abc123`). For v1, even a terminal prompt ("Approve this change? [y/n/diff]") is sufficient.

### 13.7 Implementation order (do NOT gatekeeper before trust floor)

The current board has no auth, duplicate cards, 1 edge, and zero tests. Placing a gatekeeper in front of that is putting a security guard on a building with no locks, a leaky roof, and a wrong address on the front door.

1. **Trust floor** (Sessions A–D: defaults, contingency, trace_id, API key) — non-negotiable
2. **Behavioral memory** (Session E: pytest) — gatekeeper itself needs tests
3. **Semantic memory hygiene** (Session F: idempotent bootstrap, export)
4. **Richer edges** (Session G, post-F: edge inference quality) — gatekeeper's maintenance value scales with edge richness
5. **Gatekeeper v1** (Session H, ~4–6h): structural validation, duplicate detection, approval queue, audit log. Local model for structure; remote model optional for semantic reasoning. Policy file in git.
6. **Gatekeeper v2** (Session I): staleness detection, proactive maintenance proposals, edge inference assistance

**Minimum viable gatekeeper (v1) spec:**
- Service (`aikb-guard`) with its own API key
- Validates all mutations against schema, FK integrity, duplicate component_name
- Rejects invalid and returns plain-language reason
- Queues valid mutations as "pending approval"
- Architect approves/rejects via CLI or HTTP (`POST /approve/{id}`, `POST /reject/{id}`)
- Audit log: (timestamp, mutation, gatekeeper_trace_id, human_approval_timestamp)
- Bootstrap tools POST to gatekeeper, not to Board API
- Pytest: structural validation, approval flow, rejection flow, duplicate detection

### 13.8 Honest assessment

| Question | Answer |
|---|---|
| Is this a good idea for the architecture? | **Yes.** Directly addresses the #1 risk in AI-only development (semantic memory corruption) and aligns with the dual-memory thesis. |
| Does it need a dedicated "fork of Gitea"? | **Probably not.** Gitea is correctly scoped as the git backend. The gatekeeper is a new service (`aikb-guard`), not a fork. Gitea PR flow is too heavy for single-human approval. |
| Local small LLM or remote large? | **Both, scoped.** Local for structural validation + duplicate detection (cheap, fast, always available). Remote large for semantic reasoning on complex proposals. Remote optional — gatekeeper works with local-only. |
| Will this slow down the architect? | **Slightly, intentionally.** Every mutation gets a second set of eyes. For the 100:1 leverage model, a 5-second approval step per card change is noise against the productivity gain. The risk of NOT having it (silent board corruption) is far more expensive. |
| Can a coding session still corrupt the board? | **Much harder.** Direct Board API is auth-gated. Coding session talks to gatekeeper. Gatekeeper validates. Human approves. Three layers of defense. |
| Is this over-engineering for a "throwaway demo" tool? | **No — for the living-design-spec use case.** If the board is the handoff artifact to a real team, its integrity is the product. A gatekeeper is not enterprise cosplay; it's protecting the one artifact that survives demo sessions. |
| What's the biggest risk? | **The gatekeeper itself becoming a vibe artifact** — an AI that rubber-stamps approvals, drifts its governance rules across sessions. Counter: governance rules in version-controlled config. Gatekeeper behavior tests. Adversarial review of the gatekeeper as part of sprint cadence. |

**Bottom line:** The LLM gatekeeper is a **strong architectural addition** — not for this sprint, but for the roadmap after trust floor + tests + export hygiene. It converts the board from "any Bob session can silently corrupt it" to "every mutation is validated, proposed, and human-approved." That is exactly the shift from an unverified artifact to a living design contract. Build the guard after the floor is solid, and treat the gatekeeper's own integrity as a first-class concern in the adversarial review cadence.
