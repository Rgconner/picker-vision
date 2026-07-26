# Picker Vision — Commit Log

> Auto-maintained by Bob `dev-estimator` skill. Updated on every estimator or daily-recap run.  
> **Do not edit table rows manually** — Bob re-derives them from git on each run.  
> Add context in the **Notes** column only — those entries are preserved across updates.

---

## Classification Key

| Category | Meaning | Typical git prefix |
|---|---|---|
| **Planning** | Docs, specs, plans, READMEs, API specs written | `chore` / `docs` |
| **Functionality** | New working feature delivered | `feat` |
| **Issue** | Non-trivial bug found and fixed (logic error, runtime defect) | `fix` (substantive) |
| **Iteration** | Incremental refinement of something already working (CI, config, polish, version bumps) | `fix` (minor) / `chore` / `ci` |

**Bob Effort Score** = `(files_changed × 3) + (lines_added ÷ 10) + (lines_deleted ÷ 20)`  
Higher = more structural change. A relative indicator, not an absolute measure.

**Human Direction Time** = estimated minutes of your active time for this commit,  
derived from the gap to the prior commit (capped at 60 min; gaps > 60 min = step-away, scored 0).

---

## Commit Log

| # | Date | SHA | Category | Subject | Files | +Lines | −Lines | Bob Score | Human Dir (min) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-07-24 15:15 | 4b5dd69 | **Functionality** | feat: initial commit — Picker Vision System | 50 | +4632 | −0 | 613.2 | 15 | Full system scaffold: Pi node, 4 server services, web UI, K8s |
| 2 | 2026-07-24 15:28 | bc1707e | **Iteration** | fix: correct workflow build context paths | 2 | +11 | −11 | 7.6 | 13 | |
| 3 | 2026-07-24 15:29 | d88e42a | **Iteration** | fix: correct workflow build context paths | 3 | +18 | −18 | 11.7 | 1 | |
| 4 | 2026-07-24 15:33 | e193a95 | **Iteration** | fix: correct workflow paths and update Node.js version | 1 | +13 | −12 | 4.9 | 4 | |
| 5 | 2026-07-24 15:37 | 84acea4 | **Iteration** | fix: correct workflow build context paths, image names and Node version | 1 | +2 | −2 | 3.3 | 4 | |
| 6 | 2026-07-24 16:15 | 3e5172f | **Iteration** | fix: workflow paths, image names, Node version, zxingcpp ARM64 build deps | 1 | +24 | −11 | 6.0 | 38 | Gap: 38 min active — CI debugging session |
| 7 | 2026-07-24 16:26 | f20059a | **Iteration** | fix: replace zxingcpp with OpenCV built-in barcode detection | 2 | +91 | −67 | 18.4 | 11 | Architectural pivot: dropped zxingcpp entirely |
| 8 | 2026-07-24 16:45 | fc25a4d | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s | 11 | +574 | −0 | 90.4 | 19 | |
| 9 | 2026-07-24 16:47 | 5185129 | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (cont.) | 3 | +207 | −2 | 29.8 | 2 | |
| 10 | 2026-07-24 18:56 | e65360b | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (cont.) | 3 | +348 | −58 | 46.7 | 0 | Gap >60 min — step-away |
| 11 | 2026-07-24 18:58 | 5df8641 | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (cont.) | 2 | +65 | −1 | 12.6 | 2 | |
| 12 | 2026-07-24 19:07 | 6def1b4 | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (cont.) | 1 | +232 | −0 | 26.2 | 9 | |
| 13 | 2026-07-24 19:55 | 44abd3e | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (cont.) | 4 | +34 | −3 | 15.6 | 48 | |
| 14 | 2026-07-24 20:45 | 7bb5b2c | **Iteration** | fix: replace zxingcpp with OpenCV + add k8s (final) | 2 | +25 | −3 | 8.6 | 50 | 7-commit OpenCV migration sequence ends here |
| 15 | 2026-07-24 21:07 | 13f4259 | **Issue** | fix: resolve flake8 lint warnings (E401, F401, F841) | 3 | +6 | −6 | 9.9 | 22 | Import cleanup |
| 16 | 2026-07-24 21:14 | 27f7bf2 | **Issue** | fix: log registration payload and HTTP error details on failure | 1 | +7 | −1 | 3.8 | 7 | |
| 17 | 2026-07-24 21:33 | ee37c4c | **Functionality** | feat: add service versioning, heartbeat loop, and online/offline status | 11 | +165 | −20 | 50.5 | 19 | |
| 18 | 2026-07-24 21:50 | 49450c9 | **Functionality** | feat(k8s): add service versions, nginx proxy config, simplify picker registry | 9 | +139 | −59 | 43.8 | 17 | |
| 19 | 2026-07-24 21:56 | 9cda1ea | **Planning** | chore(k8s): remove metallb-config from kustomization resources | 1 | +0 | −1 | 3.0 | 6 | |
| 20 | 2026-07-24 22:38 | 9a26073 | **Functionality** | feat: add telemetry, log ring buffers, versioning, and system UI tab | 32 | +1724 | −66 | 271.7 | 42 | Largest single commit — 32 files, full telemetry stack |
| 21 | 2026-07-24 22:59 | f386fac | **Issue** | fix(log-ring): add re-entrancy guard to prevent handleError recursion | 15 | +123 | −42 | 59.4 | 21 | Runtime recursion bug in log ring across all services |
| 22 | 2026-07-24 23:17 | 76ed6d6 | **Issue** | fix: resolve UnboundLocalError in capture loop and reduce picker TTL | 10 | +45 | −20 | 35.5 | 18 | |
| 23 | 2026-07-24 23:23 | ef90f57 | **Iteration** | chore: bump versions to 1.1.3 and update pi-node docs | 10 | +39 | −34 | 35.6 | 6 | |
| 24 | 2026-07-24 23:28 | d6d56d6 | **Functionality** | feat(web-ui): add direct stream URL support and real-time stream meter | 13 | +426 | −160 | 89.6 | 5 | |
| 25 | 2026-07-25 00:49 | f744956 | **Issue** | fix(web-ui): cast streamUrl to string to satisfy TypeScript | 1 | +1 | −1 | 3.2 | 0 | Gap >60 min before this — step-away |
| 26 | 2026-07-25 09:56 | 0e16f8f | **Functionality** | feat(mobile-web): add mobile picker web client with camera AR overlay | 9 | +1206 | −3 | 147.8 | 0 | Gap >6h overnight — not counted |
| 27 | 2026-07-25 16:35 | a2ac1a3 | **Functionality** | feat(k8s): add test namespace overlay and fix nginx /events/ proxy | 21 | +804 | −25 | 144.6 | 0 | Gap >6h — not counted |
| 28 | 2026-07-25 16:47 | 0285d00 | **Iteration** | fix(mobile): guard mediaDevices undefined on HTTP; add TLS to test overlay | 6 | +203 | −2 | 38.4 | 12 | |
| 29 | 2026-07-25 16:59 | 14ab98d | **Functionality** | feat(mobile): responsive landscape split layout for tablet | 4 | +175 | −104 | 34.7 | 12 | |
| 30 | 2026-07-25 17:06 | d876f7c | **Iteration** | fix(ci): deploy workflow pins SHA tags and targets correct namespace per branch | 1 | +58 | −14 | 9.5 | 7 | |
| 31 | 2026-07-25 17:10 | d116bd6 | **Functionality** | feat(mobile): live detection highlighting in pick list | 2 | +171 | −51 | 25.6 | 4 | |
| 32 | 2026-07-25 17:26 | f6ec963 | **Iteration** | chore: bump all components to v1.2.0 and add /mobile route | 11 | +44 | −24 | 38.6 | 16 | v1.2.0 release |
| 33 | 2026-07-25 17:45 | 44b46bf | **Iteration** | fix(ci): fix workflow_run trigger and manual dispatch branch selection | 2 | +17 | −9 | 8.2 | 19 | |
| 34 | 2026-07-25 17:46 | 01dad7e | **Functionality** | feat(mobile): add dev estimator rate scenarios config | 1 | +33 | −0 | 6.3 | 1 | |
| 35 | 2026-07-25 17:49 | b07438a | **Iteration** | fix(ci): add --validate=false to MetalLB kubectl apply steps | 1 | +6 | −2 | 3.7 | 3 | |
| 36 | 2026-07-25 17:51 | 569f86e | **Iteration** | chore(ci): trigger build for v1.2.0 + CI fixes | 1 | +1 | −0 | 3.1 | 2 | |
| 37 | 2026-07-25 17:57 | 7cd0298 | **Iteration** | fix(ci): fix buildkit Docker Hub timeout and k8s image tag update | 2 | +37 | −31 | 11.2 | 6 | |
| 38 | 2026-07-25 18:00 | 372ca98 | **Iteration** | chore(ci): promote workflow fixes to main | 3 | +104 | −36 | 21.2 | 3 | Backport of build/deploy workflow fixes from feature branch to main |
| 39 | 2026-07-25 18:02 | 3ff3d2d | **Planning** | docs(ci): clarify why kubectl set image is required for rollout trigger | 1 | +8 | −6 | 4.1 | 2 | |
| 40 | 2026-07-25 18:06 | cf7a898 | **Iteration** | fix(mobile): pass png bytes directly to reportlab image | 1 | +2 | −5 | 3.4 | 4 | |
| 41 | 2026-07-25 18:08 | 99646ff | **Iteration** | fix(mobile): replace QR Drawing with platypus Image flowable | 1 | +7 | −11 | 4.2 | 2 | |
| 42 | 2026-07-25 18:48 | 257decd | **Planning** | docs(mobile): add barcode multi-detect and print size plan | 3 | +178 | −17 | 27.6 | 40 | Plan file for next feature cycle |
| 43 | 2026-07-25 19:01 | d92b809 | **Functionality** | feat(mobile): coalesce burst scans into single batched event | 1 | +52 | −30 | 9.7 | 13 | |
| 44 | 2026-07-25 19:05 | cc3f4b9 | **Iteration** | fix(ci): fold deploy into build workflow — remove broken workflow_run trigger | 2 | +102 | −162 | 24.3 | 4 | |
| 45 | 2026-07-25 19:11 | cdaa701 | **Iteration** | fix(k8s): use shared sandbox MetalLB pool instead of conflicting sub-range | 2 | +9 | −17 | 7.8 | 6 | |
| 46 | 2026-07-25 19:12 | 3cd93ae | **Planning** | docs(mobile): add picker vision development estimate | 1 | +145 | −0 | 17.5 | 1 | Value story HTML + estimator output |

---

## Summary

| Metric | Value |
|---|---|
| Total commits logged | 46 |
| Planning commits | 4 (9%) |
| Functionality commits | 11 (24%) |
| Issue commits | 5 (11%) |
| Iteration commits | 26 (57%) |
| Total lines added | 12,313 |
| Total lines deleted | 1,147 |
| Total Bob effort score | 2,092.5 |
| Avg Bob score per commit | 45.5 |
| Total human direction time | 539 min (~9.0 hrs) |

### Category Breakdown

```
Planning      ████ 4  (9%)   — docs, specs, plan files
Functionality ████████████ 11 (24%) — net-new features
Issue         █████ 5  (11%) — runtime bugs, logic errors
Iteration     ████████████████████████ 26 (57%) — CI, config, polish, version bumps
```

### Insight

The 56% Iteration rate reflects the CI/build pipeline being stabilized in parallel with feature
work — common in solo projects where infrastructure is set up alongside the application.
The 11% Issue rate (5 real bugs) is low relative to the volume delivered, indicating strong
first-pass code quality. The two largest Bob effort scores (commit #1 at 613.2 and commit #20
at 271.7) together account for 42% of total Bob output — both were major feature deliveries
in a single session.

---

*Generated by Bob `dev-estimator` skill — commit-log module. Last updated: 2026-07-25 (rev 2 — added missing commit #38, 46 total)*
