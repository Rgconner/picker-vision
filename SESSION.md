# Picker Vision — Session Handoff

> **Bob's debug rule #1:** When something stops working, start with "what did I change?" and work back from there to other grounded facts. Never jump to physical/environmental explanations when a code change just happened.

> Bob writes this at the end of every session and commits it.
> First action of every new session: read this file.

---

## Current State (2026-07-28)

**Branch:** `feature/bobs-tiny-treasures`  
**Last commit:** `6291536` — `feat(scanner): restore BarcodeDetector as primary engine with ZXing canvas fallback`  
**CI status:** Push sent — image rebuild in progress (watch Actions tab)

---

## What We Did This Session

1. **Restored `BarcodeDetector` as primary scanner engine** (`useBarcodeScanner.ts`)
   - Native `BarcodeDetector` (Chrome Android ML Kit) tried first — no `getSupportedFormats()` gate on `data_matrix`
   - ZXing canvas poll (480px short-side cap, 250ms) kept as fallback
   - Both paths emit `remoteLog` so engine selection is confirmed via `/api/debug/logs/{picker_id}`
   - This fixes BE-006: BarcodeDetector was removed without evidence it failed

2. **Investigated Graphify** (`graphify.net`) — installed, ran code-only graph on the repo
   - 871 nodes, 1524 edges, 51 communities from AST extraction
   - Graph HTML at `graphify-out/graphify-out/graph.html` — open in browser
   - Full multi-modal run (including plan docs + BACKLOG) needs `ANTHROPIC_API_KEY` set

3. **Created this SESSION.md** as permanent session handoff mechanism

---

## What's Next (ordered)

- [ ] **Test the scanner on the Samsung** — CI must finish first, then:
  1. Check `GET /api/debug/logs/Guest` for `[Scanner] engine=BarcodeDetector (native)`
  2. Point at a barcode — confirm `[Scanner] decoded:` line appears within 5s
  3. If engine=ZXing instead → `BarcodeDetector` not available on that Chrome build → investigate why
- [ ] **Run full Graphify with docs** — set `ANTHROPIC_API_KEY` and run:
  ```
  graphify . --output graphify-out --update
  ```
  This will add semantic extraction of all plan docs, BACKLOG.md, README into the graph
- [ ] **Observability plan sub-tasks 1–5** (`observability-plan.md`) — all still pending
  - Sub-task 1: Fix silent exception handlers
  - Sub-task 2: Add trace IDs to detection events
  - Sub-task 3: Structured logging in event_processor
  - Sub-task 4: Scan event ledger (backend)
  - Sub-task 5: Scan log UI

---

## Open Questions

- Does Samsung Chrome on `feature/bobs-tiny-treasures` expose `BarcodeDetector`?  
  Check via remote logs after next deploy, or ask user to open browser console and run `'BarcodeDetector' in window`
- Graphify full run: will the plan docs + BACKLOG add useful cross-links to code decisions?

---

## Key Facts (always true — do not re-derive)

| Fact | Value |
|------|-------|
| Production URL | `https://bobstinytreasures.snwbd.com` |
| K8s namespace | `picker-vision` |
| Active branch | `feature/bobs-tiny-treasures` |
| Pi node LAN IP | auto-detected via UDP socket probe |
| Redis key — debug logs | `debug:logs:{picker_id}` (TTL 30min) |
| Redis key — debug snapshot | `debug:snapshot:{picker_id}` (TTL 30s) |
| Bundle hash check | `(Invoke-WebRequest "https://bobstinytreasures.snwbd.com/mobile" -UseBasicParsing).Content \| Select-String "index-[A-Za-z0-9]+\.js"` |

---

## Decisions Made (permanent)

| Decision | Rationale |
|----------|-----------|
| `BarcodeDetector` primary, ZXing fallback | Native ML Kit outperforms ZXing on Samsung; ZXing kept for Firefox/Safari/Vuzix |
| No `getSupportedFormats()` gate | Some Samsung builds omit `data_matrix` from list even though hardware decodes it |
| ZXing uses canvas + 480px short-side cap | `decodeFromVideoElementContinuously` deprecated; canvas gives explicit resize control |
| Remote log shipping always on | `useRemoteLogger` posts to `/api/debug/logs/{picker_id}` — no `?debug=1` needed |
| Debug snapshot requires `?debug=1` | Production overhead — QOL-007 tracks making this server-side opt-in |

---

## BACKLOG Items to Know About

- **BE-006** — BarcodeDetector removed without evidence (fixed this session)
- **QOL-005** — Scan log lost on pod restart (persist `_scan_ledger` to Redis)
- **QOL-007** — Debug snapshot only on `?debug=1` (make server-side flag)
- **Observability plan** — 5 sub-tasks all pending (see `observability-plan.md`)
