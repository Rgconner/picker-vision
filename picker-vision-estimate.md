# Picker Vision — Development Estimate (Last 4 Days: July 30 – August 2, 2026)

**Date:** 2026-08-02  
**Prepared by:** Bob (AI-assisted)  
**Scope:** Sessions 7–14 — QOL hardening, load generator, regional simulation engine  
**Rate Scenario:** IBM Blended  
**Contingency:** 20 %  
**Confidence Band:** ±25 % (planning-level estimate)

---

## Why This Estimate May Differ from Plan-Based Expectations

The regional-simulation-plan.md covered ST-1 through ST-5 (the simulation engine).
However the 4-day period included **19 additional deliverables** not in any plan doc —
the QOL batch, PackWizard hardening, full load-gen service, k8s/CI wiring, THA audit,
architecture planning docs, code review response, and GitHub Project setup.

- Plan items found: **5** (ST-1 through ST-5 of regional-simulation-plan.md)
- Code-only (unplanned) items: **15**
- Plan coverage ratio: **26 %** of total hours

This is expected — plan docs describe the major build; the surrounding hardening,
tooling, and ops work is structurally invisible to plans but very present in the code.

---

## Assumptions

| Parameter            | Value          |
|----------------------|----------------|
| Working hours/day    | 7              |
| Team utilisation     | 80 %           |
| Parallel execution   | Yes            |
| Currency             | USD            |
| Rates                | IBM Blended    |
| Contingency          | 20 %           |

---

## Team & Rate Card

| Role                | Symbol | Count | Rate (IBM Blended) |
|---------------------|--------|-------|---------------------|
| Manager             | MGR    | 1     | $175/hr             |
| Architect           | ARC    | 1     | $200/hr             |
| UI Designer         | DES    | 1     | $140/hr             |
| Senior Developer    | SRD    | 1     | $180/hr             |
| Mid-Level Developer | MDD    | 2     | $140/hr each        |
| Junior Developer    | JRD    | 2     | $100/hr each        |

---

## Work Breakdown Structure

| ID  | Work Item | Source | Tier | MGR | ARC | DES | SRD | MDD | JRD | Item Hrs | Item Cost |
|-----|-----------|--------|------|-----|-----|-----|-----|-----|-----|----------|-----------|
| W01 | QOL batch — scan log Redis, nav card generator, CI hardening, 6 backlog fixes | code | M | 2 | 3 | 0 | 8 | 16 | 8 | 37 | $6,010 |
| W02 | PackWizard — product names, auto-open, orphan cleanup | code | M | 2 | 3 | 4 | 8 | 16 | 4 | 37 | $5,450 |
| W03 | QOL-017/023/024/025/027/028/029/030 — 8 pick-flow UX fixes | code | L | 4 | 8 | 8 | 16 | 32 | 16 | 84 | $13,360 |
| W04 | Load Gen UI tab — swarm config, agent table, telemetry strip, assertion panel | code | L | 4 | 8 | 8 | 16 | 32 | 8 | 76 | $11,960 |
| W05 | Load Gen service — virtual picker agent, FastAPI control API | code | L | 4 | 8 | 0 | 16 | 32 | 16 | 76 | $12,520 |
| W06 | Load Gen k8s + CI matrix wiring | code | S | 1 | 1 | 0 | 4 | 8 | 4 | 18 | $2,860 |
| W07 | Load Gen regression assert endpoint + CI script | code | S | 1 | 1 | 0 | 4 | 8 | 4 | 18 | $2,860 |
| W08 | SQLite contention fix + k8s CPU tuning (20-picker load) | code | S | 1 | 1 | 0 | 4 | 8 | 0 | 14 | $2,260 |
| W09 | Regional Simulation data model (rs_models.py — 3 Postgres tables) | plan+code | M | 2 | 3 | 0 | 8 | 16 | 4 | 33 | $5,290 |
| W10 | RS batch generator (simulator.py — presets, fatigue model, bulk insert) | plan+code | L | 4 | 8 | 0 | 16 | 32 | 8 | 68 | $11,240 |
| W11 | Capacity query layer (capacity.py — ARCH-003 signal, Gantt σ deviation) | plan+code | L | 4 | 8 | 0 | 16 | 32 | 8 | 68 | $11,240 |
| W12 | Load-gen RS endpoints (POST/GET/DELETE /simulations/*) | plan+code | S | 1 | 1 | 0 | 4 | 8 | 4 | 18 | $2,860 |
| W13 | API-gateway RS proxy routes + ARCH-003 Sterling endpoint | plan+code | S | 1 | 1 | 0 | 4 | 8 | 2 | 16 | $2,580 |
| W14 | RegionalSimView + useRegionalSim (RS panel, capacity panels, Gantt grid) | plan+code | L | 4 | 8 | 8 | 16 | 32 | 8 | 76 | $11,960 |
| W15 | Postgres BTT overlay (manifest, PVC, svc, configmap, load-gen env) | plan+code | S | 1 | 1 | 0 | 4 | 8 | 2 | 16 | $2,580 |
| W16 | Redis AOF persistence + PVC | code | XS | 0.5 | 0.5 | 0 | 1 | 2 | 0 | 4 | $640 |
| W17 | THA live-ammo audit — idempotency guard, UX hardening, sign-off prep | code | S | 1 | 1 | 2 | 4 | 8 | 4 | 20 | $3,140 |
| W18 | Code review response — Pi removal, staging lock, cross-picker scoping, credentials | code | S | 1 | 1 | 0 | 4 | 8 | 2 | 16 | $2,580 |
| W19 | Architecture planning — ARCH-003/004/005/006/007, 3 plan docs, prompt.md | code | M | 2 | 3 | 0 | 8 | 0 | 0 | 13 | $2,150 |
| W20 | GitHub Project — 45 issues, 14 labels, 5 milestones, setup script | code | S | 1 | 1 | 0 | 4 | 0 | 0 | 6 | $1,030 |
|  | **Plan items sub-total (W09–W15)** | | | 17 | 30 | 8 | 68 | 136 | 36 | 295 | $47,750 |
|  | **Code-only sub-total (W01–W08, W16–W20)** | | | 24 | 30 | 22 | 97 | 160 | 66 | 399 | $60,360 |
|  | **Grand Total** | | | **41** | **60** | **30** | **165** | **296** | **102** | **694** | **$108,110** |

**Plan coverage ratio: 43% of hours** (295 of 694) — plan docs captured the simulation engine but not the hardening, operations, and tooling layer that made it production-ready.

---

## Risk Adjustment

| Item                        | Value              |
|-----------------------------|--------------------|
| Base total hours            | 694 hrs            |
| Contingency (20 %)          | +139 hrs           |
| **Adjusted total hours**    | **833 hrs**        |
| Base cost (IBM Blended)     | $108,110           |
| Contingency amount          | +$21,622           |
| **Adjusted total cost**     | **$129,732**       |

---

## Schedule Estimate

| Metric                      | Value                         |
|-----------------------------|-------------------------------|
| Effective team capacity/day | 31.4 hrs (7 roles × 7 hrs × 0.8) |
| Calendar days               | 26.5 days                     |
| **Calendar weeks**          | **5.3 weeks**                 |
| Estimated start             | 2026-07-30                    |
| Estimated completion        | 2026-09-10 (projected)        |

---

## Role Summary

| Role | Count | Total Hrs | Pct | Total Cost |
|------|-------|-----------|-----|------------|
| Manager (MGR)            | 1 | 41  | 6 %  | $7,175  |
| Architect (ARC)          | 1 | 60  | 9 %  | $12,000 |
| UI Designer (DES)        | 1 | 30  | 4 %  | $4,200  |
| Senior Developer (SRD)   | 1 | 165 | 24 % | $29,700 |
| Mid-Level Developer (MDD)| 2 | 296 | 43 % | $41,440 |
| Junior Developer (JRD)   | 2 | 102 | 15 % | $10,200 |
| **TOTAL**                | 7 | **694** | 100 % | **$104,715** |

---

## Scenario Comparison

| Scenario           | Base Cost    | +20% Contingency | Total        |
|--------------------|--------------|------------------|--------------|
| IBM US             | $144,365     | $28,873          | $173,238     |
| IBM Blended        | $104,715     | $20,943          | $125,658     |
| IBM Offshore       | $69,830      | $13,966          | $83,796      |
| Industry Standard  | $91,990      | $18,398          | $110,388     |
| **Selected: IBM Blended** | **$104,715** | **$20,943** | **$125,658** |

---

## Recommendations

1. **Biggest risk items:** W03 (8 QOL fixes, UI breadth) and W14 (RegionalSimView, 3 panels) are L-tier UI items — most likely to require design iteration. W10/W11 (simulator + capacity layer) are L-tier backend items with data correctness risk.

2. **Staffing bottleneck:** MDD at 43% of all hours is the critical-path resource. A team with only 2 MDD heads would be the scheduling constraint; parallel execution across W09–W15 partially relieves this.

3. **Contingency guidance:** 20% is appropriate given the breadth of the work and that significant scope (57%) was unplanned. Would not reduce below 20%.

4. **Plan coverage gap:** Plans covered 43% of delivered hours. The unplanned 57% is primarily hardening, operations, and tooling work that is structurally invisible to feature-level plans. Future plan docs should include explicit "hardening and ops" work items.

5. **Accuracy caveat:** ±25% confidence band. The WBS is derived from 57 commits across 4 days — high granularity gives reasonable accuracy, but individual tier assignments carry ±1 tier uncertainty.

6. **Value headline:** *"This demo was built by 1 IBM Architect working with Bob AI in 11.5 active hours at a total investment of $3,013 — delivering $125,658 of equivalent professional value at IBM Blended rates. That is a 42× value multiplier on every dollar invested."*

---

## ROI & Value — Art of the Possible

> *Art of the Possible: you bring deep IBM product knowledge, industry expertise, and a precise vision of what your client needs. Bob translates that vision into production-quality code, demos, and documentation — multiplying the value you deliver to IBM customers.*

### Session Summary (July 30 – August 2)

| Metric | Value |
|---|---|
| Your active time (git-derived) | 11.5 hrs |
| Step-aways / dead-time excluded | ~5.5 hrs |
| Session date range | 2026-07-30 → 2026-08-02 |
| Bob Coins used (est. 24 coins/hr) | 276 coins |

### Your Investment

| Item | Hrs | Rate | Value |
|---|---|---|---|
| Your time (IBM Architect) | 11.5 | $250/hr | $2,875 |
| Bob Coins (276 × $0.50) | — | — | $138 |
| **Total investment** | | | **$3,013** |

### Value Delivered — Three-Way Comparison

| | **You + Bob** | **IBM Dev Team (7-person)** | **Industry Standard** |
|---|---|---|---|
| Total investment | $3,013 | $125,658 | $110,388 |
| Professional value delivered | $125,658 | $125,658 | $110,388 |
| Your active time | 11.5 hrs | — | — |
| Calendar duration | 4 days actual | 5.3 weeks | 5.3 weeks |
| Team size | 2 (you + Bob) | 7 | varies |
| Domain expertise | ✅ You own it | ❌ Full briefing needed | ❌ Full briefing needed |
| IBM product knowledge | ✅ Native | ⚠ Partial | ❌ None |
| **Value multiplier vs IBM Dev Team** | **42×** | 1× | — |
| **Value multiplier vs Industry Std** | **37×** | — | 1× |

### What Makes This Partnership Valuable

| Dimension | You + Bob | Traditional Dev Team |
|---|---|---|
| **Speed to first demo** | Hours–days | Weeks–months |
| **Total investment** | $3,013 | $125,658 |
| **Who holds the vision** | You — directly translated | PM/BA layer required |
| **IBM product narrative** | Native — you live it | Must be taught |
| **Iteration speed** | Instant — ask Bob, get code | Sprint cycles |
| **Risk of vision drift** | Minimal | High — handoff gaps |

---

*Generated by Bob `dev-estimator` skill — for planning purposes only.*
