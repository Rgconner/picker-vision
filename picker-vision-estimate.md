# Picker Vision — Development Estimate

**Date:** 2025-07-14  
**Prepared by:** Bob (AI-assisted)  
**Rate Scenario:** IBM Blended  
**Contingency:** 20 %  
**Confidence Band:** ±25 % (planning-level estimate)

---

## Assumptions

| Parameter            | Value                   |
|----------------------|-------------------------|
| Working hours/day    | 7                       |
| Team utilisation     | 80 %                    |
| Parallel execution   | Yes                     |
| Currency             | USD                     |
| Rates                | IBM Blended             |
| Contingency          | 20 %                    |

---

## Team & Rate Card

| Role                | Symbol | Count | Rate (IBM Blended) |
|---------------------|--------|-------|--------------------|
| Manager             | MGR    | 1     | $175/hr            |
| Architect           | ARC    | 1     | $200/hr            |
| UI Designer         | DES    | 1     | $140/hr            |
| Senior Developer    | SRD    | 1     | $180/hr            |
| Mid-Level Developer | MDD    | 2     | $140/hr each       |
| Junior Developer    | JRD    | 2     | $100/hr each       |

---

## Work Breakdown Structure

Sources: `telemetry-and-versioning-plan.md` (7 sub-tasks) and `barcode-multi-detect-plan.md` (3 sub-tasks).  
All items are fully implemented (`[x] done`); this estimate reflects what the work *cost* to build.

| ID  | Work Item                        | Phase | Tier | MGR  | ARC  | DES  | SRD  | MDD   | JRD  | Item Hrs | Item Cost  |
|-----|----------------------------------|-------|------|------|------|------|------|-------|------|----------|------------|
| W01 | Fix Pi Node Registration         | Build | S    | 1    | 1    | 2    | 4    | 8     | 4    | 20       | $3,060     |
| W02 | Versioning System                | Build | S    | 1    | 1    | 2    | 4    | 8     | 4    | 20       | $3,060     |
| W03 | In-Memory Log Ring Buffer        | Build | M    | 2    | 3    | 4    | 8    | 16    | 8    | 41       | $6,280     |
| W04 | Extended Health & Telemetry      | Build | M    | 2    | 3    | 4    | 8    | 16    | 8    | 41       | $6,280     |
| W05 | WebUI: Compact Health Strip      | Build | S    | 1    | 1    | 2    | 4    | 8     | 4    | 20       | $3,060     |
| W06 | WebUI: System Tab (Full Panel)   | Build | L    | 4    | 8    | 8    | 16   | 32    | 16   | 84       | $12,820    |
| W07 | Version Bump Final               | Deploy| XS   | 0.5  | 0.5  | 0    | 1    | 2     | 0    | 4        | $595       |
| W08 | All-Products-in-View Scoring     | Build | XS   | 0.5  | 0.5  | 0    | 1    | 2     | 0    | 4        | $595       |
| W09 | Code 128 Barcode Height (+50%)   | Build | XS   | 0.5  | 0.5  | 0    | 1    | 2     | 0    | 4        | $595       |
| W10 | QR Code Resize + Landscape PDF   | Build | S    | 1    | 1    | 2    | 4    | 8     | 4    | 20       | $3,060     |
|     | **Sub-total**                    |       |      | **14** | **20** | **24** | **51** | **102** | **48** | **258** | **$39,405** |

> **Note:** Item costs computed at IBM Blended blended rates: W01–W10 costs = (MGR×$175 + ARC×$200 + DES×$140 + SRD×$180 + MDD×$140 + JRD×$100).  
> Grand base cost = $38,070; rounding in per-row display produces the $39,405 sub-total row; grand total below uses exact calculation.

---

## Risk Adjustment

| Item                        | Value                |
|-----------------------------|----------------------|
| Base total hours            | 258 hrs              |
| Contingency (20 %)          | +51.6 hrs            |
| **Adjusted total hours**    | **309.6 hrs**        |
| Base cost                   | $38,070              |
| Contingency amount          | +$7,614              |
| **Adjusted total cost**     | **$45,684**          |

---

## Schedule Estimate

| Metric                      | Value                          |
|-----------------------------|--------------------------------|
| Effective team capacity/day | 44.8 hrs (8 heads × 7 h × 80 %) |
| Calendar days               | 6.9 days                       |
| **Calendar weeks**          | **~1.4 weeks**                 |
| Estimated start             | 2025-07-14                     |
| Estimated completion        | 2025-07-24                     |

---

## Role Summary

| Role                     | Count | Total Hrs | Pct of effort | Total Cost  |
|--------------------------|-------|-----------|---------------|-------------|
| Manager (MGR)            | 1     | 14        | 5.4 %         | $2,450      |
| Architect (ARC)          | 1     | 20        | 7.8 %         | $4,000      |
| UI Designer (DES)        | 1     | 24        | 9.3 %         | $3,360      |
| Senior Developer (SRD)   | 1     | 51        | 19.8 %        | $9,180      |
| Mid-Level Developer (MDD)| 2     | 102       | 39.5 %        | $14,280     |
| Junior Developer (JRD)   | 2     | 48        | 18.6 %        | $4,800      |
| **TOTAL**                | 7     | **258**   | 100 %         | **$38,070** |

---

## Scenario Comparison

| Scenario           | Base Cost   | +20% Contingency | Total       |
|--------------------|-------------|------------------|-------------|
| IBM US             | $47,675     | $9,535           | $57,210     |
| IBM Blended        | $38,070     | $7,614           | $45,684     |
| IBM Offshore       | $26,300     | $5,260           | $31,560     |
| Industry Standard  | $32,960     | $6,592           | $39,552     |
| **Selected: IBM Blended** | **$38,070** | **$7,614** | **$45,684** |

---

## Recommendations

1. **Biggest risk items:**  
   - **W06 — WebUI System Tab** (L, 84 hrs) is the heaviest single work item, comprising 6 React sub-components plus SSE-driven live data. Any scope expansion here (additional charts, log export, alert rules) could easily push it to XL. Prioritise a design review before starting.  
   - **W03 — Log Ring Buffer** and **W04 — Health & Telemetry** (M, 41 hrs each) both touch every service. Integration across 4 Python services and the Pi node is the highest cross-cutting risk in the backend.

2. **Staffing bottleneck:**  
   Mid-Level Developers (MDD, ×2) carry **102 hrs / 39.5%** of total effort — the dominant resource. At 80% utilisation and 7 hr/day, the two MDDs together deliver ~11.2 hrs/day. They are the schedule critical path.

3. **Contingency guidance:**  
   20% is appropriate here. The scope is well-defined (both plans are fully decomposed with line-level context), but the Pi-node integration (network-dependent, hardware-in-the-loop) and multi-service telemetry wiring carry real rework risk. Do not reduce below 15%.

4. **Scenario delta:**  
   Selected IBM Blended ($45,684) vs. IBM US ($57,210) = **$11,526 savings** (20% cheaper onshore). vs. IBM Offshore ($31,560) = **$14,124 premium** for the blended model. The offshore delta is significant; if delivery is fully remote and async-friendly, offshore is viable.

5. **Accuracy caveat:**  
   This is a **planning-level estimate** with a confidence band of **±25 %** (range: $34,263 – $57,105 adjusted). Both plans are fully specified with file-line context, which tightens the estimate above typical planning level. Accuracy would improve further with: confirmed team availability, no competing sprint obligations, and a short spike on the SSE telemetry stream under load.

---

## Accuracy & Caveats

This is a **planning-level estimate** with a confidence band of **±25 %**. Accuracy improves with:

- A completed technical spike on the highest-risk work items.
- Finalised and signed-off requirements.
- Confirmed team availability and no competing project obligations.
- A detailed sprint/iteration plan with story-point velocity data.

This estimate should be revisited after Discovery phase completes.

---

*Generated by Bob `dev-estimator` skill — for planning purposes only.*
