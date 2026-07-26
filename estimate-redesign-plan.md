# Estimate HTML Redesign Plan

## Overview

Redesign `picker-vision-estimate.html` to lead with the **value story** rather than cost
numbers. The report is used as a portable, emailable artefact for managers and IBM customers.
Every structural decision should serve the "Art of the Possible" partnership narrative.

**File to modify:** `picker-vision/picker-vision-estimate.html`

**Guiding principle:** Story first → context second → data last.

---

## Sub-Task 1 — Restructure tabs and rename pages

**Intent**
Remove the "Plan vs Codebase" tab entirely and reorder the remaining three tabs so the value
story is the first thing any reader sees.

**Expected Outcomes**
- Tab order: **The Value Story** · **Cost** · **Development Estimate**
- "The Value Story" is the active/default tab on open
- "Plan vs Codebase" tab and all its HTML content are deleted
- "ROI & Value" tab is renamed to "The Value Story"
- "Cost" tab label stays "Cost" — remove the Work Breakdown Structure table and its note/heading
  from the Cost tab entirely (scenario selector, summary cards, rate overrides, role summary,
  and scenario comparison all stay)
- "Timeline" tab is renamed "Development Estimate"

**Todo List**
- [ ] Rename tab button labels in the tab-bar div
- [ ] Set "The Value Story" tab button as the default `on` class; remove `on` from Cost tab
- [ ] Set `id="roi"` pane as `class="pane on"` (default visible); remove `on` from `id="cost"`
- [ ] Delete the entire `id="coverage"` pane div
- [ ] Delete the `.sh` heading "Work Breakdown Structure", the `.note` badge legend paragraph,
      and the `<div class="tbl-wrap">` containing the `<table id="wbs-body">` from the Cost tab
- [ ] Remove the `wbs-body` tbody population code from `recalc()` in JS (keep all other recalc
      logic — role summary, scenario comparison, summary cards all stay)

**Relevant Context**
- Tab buttons are in `<div class="tab-bar">` around line 102
- Cost pane opens at `<div id="cost" class="pane on">` around line 110
- Coverage pane is `<div id="coverage" class="pane">` — delete entirely
- ROI pane is `<div id="roi" class="pane">` — make this `on`
- Timeline pane is `<div id="timeline" class="pane">`
- WBS table in Cost tab: `<table>` with `<tbody id="wbs-body">` — delete table + heading + note
- JS `recalc()` builds WBS rows into `wbs-body` — remove that block only

**Status:** [ ] pending

---

## Sub-Task 2 — Rebuild "The Value Story" tab content order

**Intent**
Reorder the content within "The Value Story" tab so it reads: partnership narrative →
pipeline value → value multiplier → investment table → session analysis → three-way comparison.
The current tab leads with a callout then jumps to session data — it needs to lead with story.

**Expected Outcomes**
- First element: a **green hero banner** with the Art of the Possible narrative text (the
  `roi_narrative` from rates.json). Large, prominent, visually dominant.
- Second element: **"What This Partnership Unlocks"** qualitative table (currently at the
  bottom — move it up to second position, immediately after the hero)
- Third element: **Pipeline Value** box (currently near the bottom — move up to third)
- Fourth element: **Value Multiplier** big-number box (85×)
- Fifth element: **Your Investment** table
- Sixth element: **Session Analysis** table
- Seventh element (last): **Three-Way Value Comparison** table

**Todo List**
- [ ] Cut the `<div class="callout green" id="roi-headline">` block and move it to top of pane
- [ ] Move "What Makes This Partnership Valuable" table immediately after the hero banner
      (before any numbers appear)
- [ ] Move the Pipeline Value `<div class="pipe-box">` to third position
- [ ] Keep Value Multiplier box in fourth position
- [ ] Move "Your Investment" table to fifth (currently second)
- [ ] Move "Session Analysis" table to sixth
- [ ] Move "Three-Way Value Comparison" to last position
- [ ] Remove the `.sh` heading "Session Analysis (git-derived · 45 commits)" — replace with
      a simpler inline label; the session data is supporting detail not a headline
- [ ] Rename the hero callout: remove the `id="roi-headline"` dependency from `calcROI()` JS
      — keep the headline text static (the narrative quote from rates.json does not change
      when inputs change); only the investment/multiplier numbers below it should update

**Relevant Context**
- Current order in `id="roi"` pane: callout → session table → investment table →
  multiplier box → three-way comparison → pipeline box → partnership table
- `calcROI()` in JS updates `id="roi-headline"` innerHTML — decouple: make the narrative
  paragraph static HTML, only update the numbers in the investment table and multiplier box
- The Art of the Possible narrative text is in `rates.json` `roi.narrative` field and was
  already copied into the previous estimate runs

**Status:** [ ] pending

---

## Sub-Task 3 — Redesign "Development Estimate" tab (formerly Timeline)

**Intent**
Transform the Timeline tab into a full "Development Estimate" page that leads with an
aspirational "what this partnership unlocks" metrics panel, then shows our actual work
timeline (2 buckets: Building vs Iteration/Fixes), then the mock dev team analysis (Gantt),
then recommendations reframed as partnership advantages.

**Expected Outcomes**
- Top of page: **"What This Partnership Unlocks"** metrics strip — 4–5 stat cards showing
  the contrast between You+Bob and the Mock Dev Team (e.g. "2 days actual vs 5.8 weeks
  equivalent", "2-person team vs 7-person team", "$2,279 invested vs $193,812 equivalent",
  "Vision fidelity: 100% — no handoff loss", "Iteration speed: hours not sprints")
- Second section: **"How We Actually Built This"** — our real timeline shown as a simple
  two-bar visual: Building (feat commits: hrs) and Iteration/Fixes (fix/chore/ci: hrs),
  with a brief narrative sentence under it. No clock times, just aggregated hours by type.
- Third section: **"If a Full Dev Team Built This"** heading — makes clear the Gantt and
  cost analysis below is the hypothetical comparison, not our actual work
- The existing Gantt chart (phase bars) stays under that heading
- **Remove** the Key Milestones table
- **Keep** the Recommendations section but reframe each recommendation to contrast with the
  You+Bob workflow (e.g. "Biggest risk items — a traditional team would need hardware-in-the-
  loop test environments; we shipped working Pi integration in day 1")

**Actual commit classification for the two-bucket timeline:**
- feat commits (11): classified as "Building"
- fix commits (21): classified as "Iteration & Fixes"
- chore/docs/ci commits (13): classified as "Admin & Docs"
- Actual hour split (proportional to commit count across 8.7 active hrs):
  Building: ~2.1 hrs (11/45 × 8.7) — round to 2 hrs
  Iteration & Fixes: ~4.1 hrs (21/45 × 8.7) — round to 4 hrs
  Admin & Docs: ~2.5 hrs (13/45 × 8.7) — round to 2.5 hrs
  (These are approximations; present them as estimates not precise measurements)

**Todo List**
- [ ] Add CSS for a new `stat-strip` component (4–5 cards in a row, larger font, IBM blue
      accent, suitable for a quick executive scan)
- [ ] Build the "What This Partnership Unlocks" stat strip at top of the pane with 5 cards:
      actual duration, team size, investment, vision fidelity, iteration speed
- [ ] Add "How We Actually Built This" section with a simple horizontal stacked bar (CSS only,
      no JS) showing 3 segments: Building (2h, green), Iteration/Fixes (4h, amber), Admin (2.5h, blue)
      plus a one-sentence narrative below it
- [ ] Add "If a Full Dev Team Built This" heading before the Gantt
- [ ] Delete the Key Milestones table
- [ ] Rewrite the 4 recommendation boxes to frame each as a partnership advantage:
      - Biggest Risk Items → reframe as "We shipped these in hours; a traditional team would
        allocate weeks and require dedicated test environments"
      - Staffing Bottleneck → reframe as "Bob absorbs the MDD/SRD workload; no bottleneck
        because capacity scales with the conversation"
      - Contingency Guidance → reframe as "Traditional teams build in 20% contingency for
        rework; our iteration loop catches issues in the same session"
      - Plan Coverage → reframe as "Traditional teams require plans before build; we build
        and the plan emerges from the codebase — verified by audit"

**Relevant Context**
- Timeline pane is `<div id="timeline" class="pane">` in the HTML
- Gantt is built by `buildGantt()` in JS — keep as-is, just add heading above it
- Milestones table is static HTML — delete the entire `<div class="tbl-wrap">` block
- Recommendation boxes are `.reco` divs — rewrite text content only, keep structure

**Status:** [ ] pending

---

## Sub-Task 4 — Add value callout to Cost tab header

**Intent**
The Cost tab shows large cost numbers with no framing. A single sentence at the very top
anchors those numbers in the value context before the reader sees them.

**Expected Outcomes**
- A slim, non-intrusive callout bar at the very top of the Cost pane (above the scenario
  selector) that reads: *"These figures represent what a 7-person IBM development team would
  charge for equivalent work. Your actual investment was $2,279 — an 85× value multiplier."*
- The $2,279 and 85× values are static (not dynamically updated — they are our actual figures)
- Styled as a subtle blue info bar, not alarming

**Todo List**
- [ ] Add a `<div class="callout" style="margin-bottom:16px">` at the top of `id="cost"` pane
      with the framing sentence
- [ ] Keep it brief — one sentence, link-style nudge to "The Value Story tab for full context"

**Relevant Context**
- Cost pane opens at `<div id="cost" class="pane on">` around line 110
- The callout CSS class already exists in the stylesheet

**Status:** [ ] pending

---

## Implementation Notes

- All four sub-tasks modify only `picker-vision/picker-vision-estimate.html`
- Do sub-tasks in order 1 → 2 → 3 → 4; each is a self-contained HTML edit
- No new JS functions needed for sub-tasks 1, 3, 4
- Sub-task 2 requires a small JS change: decouple `roi-headline` from `calcROI()` so the
  narrative paragraph stays static while only the number cells update
- After all four sub-tasks, open the file in Edge and verify all tabs switch correctly
  and the default open state shows "The Value Story"
