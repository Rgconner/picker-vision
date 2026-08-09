# AIKB — Adversarial Evaluation Playbook

**Purpose:** Encode how to re-run the adversarial code review at the **end of every sprint**, so future Bobs and the architect get consistent, high-value evaluations without re-deriving context from chat.

**Canonical baseline review:** [`aikb-code-review.md`](aikb-code-review.md) (2026-08-08)  
**Code under review:** `F:\git\aikb-app-master\aikb-app\` (or successor path / git remote)  
**Cadence:** End of each sprint — mandatory. Also after major milestones (first UI pass, auth land, board-export hardening).

---

## 1. Project identity (do not re-litigate every sprint)

| Fact | Implication for the reviewer |
|---|---|
| **100% AI-written code** at the direction of a **non-coding architect** (domain/process vision; **0 lines of code** from the human) | Defects are often generation artifacts. Judge **behavior and honesty**, not “would a senior eng structure modules this way” as the primary axe — unless structure blocks the use case. |
| **Not production SaaS** | In-house tools + **client demos of the art of the possible**. Production-quality implementation is the **downstream coding team’s** job after the living spec is good enough. |
| **“Throwaway allowed; sloppy is not”** | Right = boundaries, memory discipline, safe defaults, verifiable claims — not enterprise cosplay (premature k8s Board API, Alembic-before-need, etc.). |
| **Economic path** | Pique interest → client feedback → **living design specification** → full team builds production quality. |
| **Non-negotiable directives** | (1) **try/except** at every IO/network/DB/inter-component boundary with what-was-attempted + exc type + trace_id. (2) **X-Trace-Id** generated/propagated, never dropped. (3) **Security built in from scratch** (auth before non-localhost; no open mutate APIs on a network path). |
| **Dual memory (product thesis)** | **Semantic** = board API + **`aikb/board/` export in git** (“give Bob back his yesterdays”). **Behavioral** = tests/falsifiers. **Both matter; neither replaces the other.** |
| **Vibe Code Wall** | Wall = apparent correctness decouples from actual correctness with no instrument. AIKB should **delay/shrink** the wall for demos+specs, not abolish generation risk. See baseline §12. |
| **Productivity context (architect-reported)** | ~**100:1** leverage vs a typical **IBM Client Engineering blended team**, with architect output at **0 LOC**. Use as **process context**, not as a KPI the reviewer must prove or audit. Do not grade the repo on whether 100:1 is “true”; grade whether the **system preserves leverage** (memory, honesty, handoff). |
| **Effort to first adversarial baseline (architect-reported)** | Roughly **~5 hours partial attention** to produce the reviewed codebase (including architectural layout), **plus ~2 hours** ruminating and note-taking **before** engaging the AI. Total human wall-ish investment on the order of **one focused half-day + pre-work**, not weeks of a squad. **Calibrate severity and praise against that budget:** generation artifacts and missing tests are expected; coherent FastAPI + scanners + board export (+ side tools) in that window is the signal. Do not review as if a multi-sprint eng team shipped it. |
| **Estimator is not app runtime** | `tools/estimate_repo.py`, `tools/data/rates.json`, `tools/data/wbs_tiers.json`, and the HTML/MD value reports they emit are **not functional Board API / AIKB product code**. They exist to produce a **management-facing report on value and output of the AI/Human team** (internal + client value stories). Grade them as **reporting/comms tooling**: honesty of flags/math, usefulness of narrative for leadership — **not** as API surface, semantic memory, or demo runtime. Bugs there do not block “board works”; they block “story to management is trustworthy.” |

---

## 2. What “done” means for this product

**Success is not** clean hexagonal architecture or production SLO evidence.

**Success is:**

1. A **fresh Bob**, given primarily `aikb/board/` + `CONTEXT.md` (+ live API if up), can answer correctly about the system without cold-reading all source.
2. **Client/demo feedback** lands as cards (decision/work) with acceptance criteria — not folklore.
3. A **coding team** can start from the board/export as a design spine without reverse-engineering chat logs.
4. Claims that something “works” still meet **something outside the model’s story** (tests, curl, real demo boundary).
5. Directives (try/except, trace-id, security-from-scratch) remain **true in code**, not only in README.

---

## 3. How to run a sprint-end adversarial review

### 3.1 Inputs

- Current tree of `aikb-app` (path may move; resolve from workspace / git).
- Previous review: `aikb-code-review.md` (and any `aikb-code-review-sprint-NN.md` deltas).
- This playbook.
- Sprint intent (what was supposed to land) — architect one-paragraph brief if available.
- Exported board: `aikb/board/manifest.json`, cards, edges — **treat as first-class evidence**.

### 3.2 Method (mandatory)

1. **Read this playbook + prior review bottom line** before deep file reads.
2. **Verify claims against live source** — line-level. No drive-by severity from memory alone.
3. **Exercise behavior when possible:** health/curl, pytest, bootstrap dry-run, export, UI click-path. Prefer instruments over narration.
4. **Diff against prior sprint findings:** fixed / regressed / new / deferred-still-ok.
5. **Write a new dated review artifact** (see §5). Do not only chat.
6. **Recalibrate severity** using §4 (authorship + use case). Physics still wins for security and false claims.

### 3.3 Adversarial stance

- Assume the AI will leave dead code, duplicate modules, ignored flags, and docs that drift.
- Assume the architect **cannot** code-review hunks; every “must fix” needs an **acceptance check** a non-coder can run.
- Praise what preserves yesterdays and falsifiability. Punish plausible lies (wrong ports, ignored flags, board that doesn’t match topology, UI that only narrates).

---

## 4. Rubric (score each sprint)

Use letter grades or 1–5; be consistent with baseline where possible.

| Area | What to examine | Wall / memory link |
|---|---|---|
| **Semantic memory** | Board model; export quality; manifest honesty; edge richness vs reality; idempotent bootstrap; “read board first” workflow | Core product |
| **Behavioral memory** | pytest (or equivalent) existence, greenness, coverage of trust-floor bugs | Anti-regression across AI sessions |
| **AIKB-028** | try/except at real boundaries; **one** trace_id per request (middleware → handler → response) | Instrument |
| **Security** | Auth default; localhost bind; rate limit if exposed; secrets not in git; no “open by accident” | Non-negotiable |
| **Docs honesty** | CONTEXT/README/quickstart copy-paste works | Architect’s UI |
| **API / contracts** | CRUD completeness vs needs; error shape vs docs; OpenAPI truth | Handoff |
| **Scanners / bootstrap** | Python/RPGLE accuracy; edge inference vs documented behavior; BTT/generic split | Spec quality |
| **UI** (when present) | Does UI **read/write the board**, or only look like a kanban? Carbon/a11y nice-to-have; **false affordances** are defects | Narration risk |
| **Estimator / value report** (side tool, not app) | `estimate_repo` + rates/tiers: flags/math honest; HTML/MD useful for **management value/output narrative** | Comms to leadership — not Board runtime |
| **Other CLI tools** | bootstrap, export_board: correctness vs dual-memory thesis | Semantic memory pipeline |
| **Ops / k8s** | Only as far as sprint claimed; forge ≠ Board API | Scope control |
| **Remediation velocity** | Prior “Must Fix” cleared vs reopened | Process health |

### 4.1 Severity calibration

| Severity | Use when |
|---|---|
| **Critical** | Network-exposed mutate without auth; data loss/corruption; security directive violated in a way the architect might not notice |
| **Must fix before demo/share** | Broken quickstart; ignored CLI flags; trace_id split brain; board export lies; tests red; UI shows fake state |
| **Should fix before features** | Idempotency; dual memory hygiene; error contract; inference gaps that poison the board |
| **Defer** | Large refactors, polish, Alembic-before-need — unless they block UI or memory |

### 4.2 Authorship-adjusted priorities (stable)

**Upgrade:** tests, docs accuracy, board export habit, idempotent bootstrap, plain-language acceptance checks.  
**Defer:** monolith splits, cosmetic dead-code, enterprise ops — until trust floor is green.  
**Never defer:** auth-before-expose, honest defaults, dual-memory integrity.

---

## 5. Output artifacts each sprint

Create or update:

1. **`aikb-code-review-sprint-YYYYMMDD.md`** (or append a clearly dated section to a sprint log) containing:
   - Sprint goal (1 paragraph)
   - Grades table (same axes as baseline §1)
   - **Delta from prior review:** Fixed / Partial / Regressed / New
   - Findings (only what’s still true or newly true) with file evidence
   - UI-specific section when UI exists (see §6)
   - Updated Must / Should / Defer tables
   - **Architect acceptance pack** — copy-paste commands for each Must Fix
   - Wall/memory note: did this sprint strengthen or weaken yesterdays?

2. **Update this playbook only when process/context changes** (new directives, path moves, cadence change) — not for ordinary bug lists.

3. Optional: one card on the AIKB board (when board is healthy) — `decision` or `work` type summarizing sprint review outcomes.

Baseline full narrative remains in `aikb-code-review.md` until superseded by an explicit “baseline reset.”

---

## 6. First-pass UI evaluation (expected soon)

When UI lands, **add** these checks (do not drop API/memory review):

| Check | Pass looks like | Fail looks like |
|---|---|---|
| **Board-backed** | Lists/cards/edges from API or exported JSON | Hardcoded demo entities only |
| **Write path** | Create/update card or layout persists and reappears after refresh | UI state only in memory; refresh loses truth |
| **Fresh Bob path** | UI or export helps orientation without reading all source | Pretty shell, empty semantic layer |
| **Trace/error surfacing** | Failed API calls visible; trace_id findable | Silent failure / spinner forever |
| **Auth posture** | UI sends API key if required; no encouragement to bind `0.0.0.0` open | Docs say “just expose port” |
| **Honesty** | Empty states, “not built,” stale edges labeled | Fake topology / placeholder as production |
| **a11y / Carbon** | Note quality; rarely block sprint unless client-facing bar was committed | — |
| **Periphery** | Decision/work cards, acceptance criteria reachable | Only component pretty-boxes |

UI is a **lens on semantic memory**, not a substitute for it.

---

## 7. Remediation sprints (bugs from baseline)

When scoring a remediation sprint, start from baseline **Must Fix** (trust floor), then **Should Fix**.

### 7.1 Trust floor checklist (from 2026-08-08 baseline)

Re-verify explicitly each remediation sprint until all green:

- [ ] Bootstrap/tool default API port **8765** (not 8000)
- [ ] CONTEXT/README launch commands work copy-paste (`aikb.api.app:app` or `aikb` entrypoint — not fictional `aikb.main:app`)
- [ ] Single **trace_id** via `request.state` (or equivalent) — response header matches handler logs
- [ ] `--contingency` affects math **and** labels
- [ ] API key (or equivalent) when configured; 401 without; `.env.example` documents it
- [ ] Thin **pytest** green (trace_id, contingency, card CRUD minimum)
- [ ] `get_session` rollback does not mask original errors
- [ ] SQLite `check_same_thread` only for SQLite URLs
- [ ] No non-localhost demo without auth + clear architect rule

### 7.2 Semantic memory checklist

- [ ] Re-bootstrap does not duplicate component cards
- [ ] `export_board` produces coherent `aikb/board/`; manifest counts match belief
- [ ] Edge graph not absurdly empty vs known architecture (or explicit human overlay)
- [ ] Export filename collisions handled

### 7.3 Prompt-pack style (for architect driving AI fixes)

One concern per session; accept/revert on failure. Order of maximum trust:

**A** defaults/docs → **B** contingency → **C** trace_id → **D** API key → **E** tests → **F** bootstrap idempotency + export → **then** UI/features/inference.

Do **not** “fix the whole review” in one blob.

---

## 8. Standing operational rules (architect-owned)

Encode in every review’s reminder section:

1. `AIKB_HOST=127.0.0.1` until auth session is proven.
2. Prefer `--mode direct` bootstrap when API is in flux.
3. After each AI session: run acceptance commands; **git revert** on fail, don’t fix-forward in an exhausted context.
4. After board-changing work: **export + commit** `aikb/board/`.
5. Don’t start feature work on red pytest.
6. Every Bob session: **read board + CONTEXT first.**

---

## 9. Reviewer voice and deliverable quality

The 2026-08-08 review was valued because it was:

- **Evidence-based** (files, lines, live board counts)
- **Calibrated** to non-coder + AI authorship without excusing broken physics
- **Actionable** (effort, order, acceptance checks)
- **Honest about upside** (RPGLE, CONTEXT, dual-mode tools, thesis)
- **Connected to the wall** without sloganizing

**Repeat that bar.** Avoid: generic lint rants, production- purism inappropriate to demo tools, or rubber-stamping because “AI did a lot.”

---

## 10. Sprint review template (copy into new file)

```markdown
# AIKB Adversarial Review — Sprint <id> — <YYYY-MM-DD>

**Code path:** …
**Prior baseline:** aikb-code-review.md (2026-08-08) + playbook aikb-adversarial-eval-playbook.md
**Sprint intent:** …
**Reviewer:** Bob (adversarial)

## Grades
| Area | Grade | Notes |
|---|---|---|
| Semantic memory |  |  |
| Behavioral memory |  |  |
| AIKB-028 / trace |  |  |
| Security |  |  |
| Docs honesty |  |  |
| API |  |  |
| Scanners/bootstrap |  |  |
| UI (if any) |  |  |
| Tools/estimator |  |  |
| Remediation vs prior |  |  |

## Delta vs prior review
### Fixed
### Partial
### Regressed
### New

## Findings
### Critical / Must fix
### Should fix
### Defer

## Architect acceptance pack
1. `…`
2. `…`

## Wall & memory
- Semantic (board export): stronger / weaker / unchanged — evidence
- Behavioral (tests): stronger / weaker / unchanged — evidence

## Bottom line
<one short paragraph>
```

---

## 11. Path and naming conventions

| Artifact | Location (picker-vision workspace unless moved) |
|---|---|
| This playbook | `aikb-adversarial-eval-playbook.md` |
| Full baseline review | `aikb-code-review.md` |
| Per-sprint reviews | `aikb-code-review-sprint-YYYYMMDD.md` |
| Subject code | `F:\git\aikb-app-master\aikb-app\` (update playbook §header if path changes) |

If AIKB becomes its own primary git root, **copy this playbook into that repo root** as `ADVERSARIAL-EVAL.md` and keep one canonical copy.

---

## 12. Change log (playbook only)

| Date | Change |
|---|---|
| 2026-08-08 | Initial playbook from first full adversarial review + authorship + dual-memory + wall §12 + sprint cadence + UI preview + architect productivity context (~100:1 CE blended, 0 LOC). |
| 2026-08-08 | Effort context: ~5h partial attention (incl. architecture) + ~2h pre-AI notes to reach baseline codebase under review. |
| 2026-08-08 | Estimator (`estimate_repo` + data/reports) scoped as management value/output reporting — not functional AIKB app code. |
| 2026-08-09 | LLM Gatekeeper evaluated (§13 baseline); parked for after trust floor + base functions complete. |
