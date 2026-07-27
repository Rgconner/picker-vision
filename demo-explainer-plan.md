# Demo Explainer Page — /demo Route

## Overview

Build a new `/demo` route that serves as the guided front door for first-time visitors
(colleagues, prospects, IBM demo audiences). The page explains the system, walks through
the mobile pick flow step-by-step, provides scannable QR labels on-screen (no printer
needed — a phone can scan a laptop screen), and offers two paths into the live app.

A **single contextual button** on the mobile view manages the demo loop:
- No loop running → "Start Demo" → starts loop + assigns first order to current user
- Loop running + order assigned → normal scan flow (button not shown / scanning active)
- Loop running + between orders (e.g. came back from lunch) → "Resume" → resumes current order

The demo loop is server-side, scoped per picker_id for concurrent demos. A separate
"presentation mode" shares one loop (picker_id = `demo-presenter`) for audience demos.

The pack wizard keeps its multi-step flow. Each step displays the **expected QR code
large on-screen** so the user knows exactly what to scan next. A configurable mistake
probability (~20% default) randomly introduces a wrong item so the error workflow can
be demonstrated live. This is flagged clearly in a `demo_mode` field.

Six new demo picker users are added alongside Sprinkle and Glimmer.

---

## Decisions Log

| # | Decision |
|---|----------|
| 1 | QR codes rendered inline JS — phone can scan laptop screen, no printer needed |
| 2 | Supervisor dashboard shows QR of next item to pick so phone can scan from screen |
| 3 | Staging labels: distinct accent colours (TINY=orange, WOND=teal, CHRM=purple) |
| 4 | Guest enters as "Demo User" (picker_id="demo-user") — named pickers stay intact |
| 5 | "See the App →" on WelcomePage navigates to /demo first |
| 6 | Demo loop: server-side, scoped per picker_id; presentation mode uses "demo-presenter" |
| 7 | Demo loop button is ONE contextual button on mobile: "Start Demo" / "Resume" |
| 8 | Pack wizard kept multi-step; each step shows expected QR large on-screen |
| 9 | Delivery zone drop-off: show zone QR large when it is time to scan it |
| 10 | Intentional mistakes: ~20% probability seeded into demo orders (configurable, off by default) |
| 11 | Add 6 new demo picker users to seed_btt.py and demoCredentials.ts |
| 12 | Mobile picker identity tied to logged-in user — no separate picker name prompt |

---

## Architecture

```
/ (WelcomePage)
  └─ "See the App →" → /demo

/demo (DemoPage — no login required)
  ├─ 21 on-screen scannable labels (9 product + 3 staging + 9 shelf)
  ├─ "Try scanning →"          → guest login (demo-user) → /mobile
  └─ "Browse the dashboard →"  → guest login → /app

/mobile (MobilePickerView — picker_id = logged-in user or "demo-user")
  └─ Contextual button:
       • "Start Demo"  → POST /api/demo/start if no loop; assigns first order
       • "Resume"      → re-attaches to existing loop order for this picker

/app (App — Supervisor dashboard)
  └─ DemoControls panel: next-item QR, session status, Stop button
       └─ POST /api/demo/start (personal or presentation mode)

Pack wizard (existing multi-step flow, enhanced):
  └─ Each step shows expected QR large → user scans it → step advances
  └─ Delivery zone step shows zone QR large
  └─ Demo mistake: ~20% chance one order line has a wrong barcode injected
```

---

## Sub-Tasks

---

### Sub-Task 1 — Add 6 new picker users to seed data

**Intent**
Expand the demo roster from 2 pickers to 8 so live demos feel populated and multiple
concurrent demo sessions can run without sharing a picker_id.

**New Users**

| Name    | picker_id        | PIN  | UUID suffix |
|---------|-----------------|------|-------------|
| Twinkle | picker-twinkle  | 1111 | 000000000003 |
| Dazzle  | picker-dazzle   | 2222 | 000000000004 |
| Pebble  | picker-pebble   | 3333 | 000000000005 |
| Fizz    | picker-fizz     | 4444 | 000000000006 |
| Cosmo   | picker-cosmo    | 5555 | 000000000007 |
| Blaze   | picker-blaze    | 6666 | 000000000008 |

(Sprinkle=7777 and Glimmer=8888 remain unchanged.)

**Expected Outcomes**
- `seed_btt.py` USERS list contains all 9 entries (Bob + 8 pickers)
- `demoCredentials.ts` pickers array lists all 8 pickers
- Seed remains idempotent (guards on existing user IDs)

**Todo List**
1. Add 6 new entries to USERS list in `fixtures/bobs-tiny-treasures/seed_btt.py`
   following the btt-pick-NNNN-... UUID pattern
2. Update `server/web_ui/src/demoCredentials.ts` pickers array with all 8 entries

**Relevant Context**
- `picker-vision/fixtures/bobs-tiny-treasures/seed_btt.py` lines 57–80 — USERS pattern
- `picker-vision/server/web_ui/src/demoCredentials.ts` — pickers array

**Status** — `[ ] pending`

---

### Sub-Task 2 — Backend: demo loop endpoints

**Intent**
Add three endpoints to the order service (proxied through the API gateway) that manage
the demo auto-order loop. The loop creates randomized orders (2–8 lines from the 9 BTT
products) and assigns them to a specific picker_id. Two modes: personal (per-picker,
concurrent) and presentation (shared demo-presenter picker).

Optional intentional mistakes: when `mistake_probability` > 0, the loop randomly
substitutes one order line with a wrong product barcode ~N% of the time. This lets
the error workflow be demonstrated live. Default is 0 (off); suggested demo value is 0.2.

**New Endpoints (order_service/main.py)**

| Method | Path | Body / Response | Description |
|--------|------|-----------------|-------------|
| POST | `/demo/start` | `{ picker_id?, mode, mistake_probability? }` → `{ session_id, picker_id, mode }` | Start or restart a demo loop. Personal mode requires picker_id. |
| POST | `/demo/stop` | `{ session_id? }` → 204 | Stop a session. Omit session_id to stop presentation loop. |
| GET | `/demo/status` | → `[{ session_id, picker_id, mode, orders_completed, current_order_id, mistake_probability }]` | List active demo sessions. |

**Loop Logic**
- On start: pick 2–8 random products (without replacement), qty 1–2 each, random
  staging_code from [TINY, WOND, CHRM]. If mistake_probability > 0 and random() fires,
  swap one line's product_barcode with a non-matching product barcode.
- Order reference: `DEMO-{session_id[:6].upper()}-{seq:03d}`
- On order "complete" (all lines picked or validated): auto-create next order
- Presentation mode: picker_id = "demo-presenter", only one presentation loop at a time
- Safety cap: stop after 20 orders per session
- On stop: session removed, no new orders created (current order stays in DB)

**"Complete" trigger**
- After `PATCH /orders/{order_id}/lines/{line_id}` sets a line to "picked", check if
  all lines are picked. If so, mark order complete and fire next-order logic for any
  watching demo session.

**Gateway proxies to add (api_gateway/main.py)**
- `POST /api/demo/start`
- `POST /api/demo/stop`
- `GET /api/demo/status`

**Expected Outcomes**
- POST /api/demo/start creates first order and returns session
- All lines picked → order auto-completes → next order created automatically
- GET /api/demo/status reflects live state
- Mistake injection is visible in the order lines (wrong barcode present)
- Existing non-demo orders and users unaffected

**Todo List**
1. Add in-memory `_demo_sessions: dict` store to `order_service/main.py`
2. Add `_create_demo_order(session, db)` helper — random product selection + optional
   mistake injection
3. Implement `POST /demo/start`
4. Implement `GET /demo/status`
5. Implement `POST /demo/stop`
6. In `PATCH /orders/{order_id}/lines/{line_id}` handler — after updating, check if
   order is complete and call `_advance_demo_session(order_id, db)` if a session matches
7. Add three gateway proxy routes to `api_gateway/main.py`

**Relevant Context**
- `server/order_service/main.py` — `PATCH /orders/{order_id}/lines/{line_id}` handler
- `server/order_service/models.py` — Order, OrderLine, Product models
- `server/api_gateway/main.py` — httpx async proxy pattern
- All 9 BTT product barcodes: BTT-00101..BTT-00103, BTT-00201..BTT-00203, BTT-00301..BTT-00303
- Staging codes: TINY, WOND, CHRM

**Status** — `[ ] pending`

---

### Sub-Task 3 — Extract QR utility + build DemoControls for Supervisor view

**Intent**
Two things in one sub-task because they share the same QR utility:

1. Extract the vanilla-JS QR code generator from `btt-print-labels.html` into a
   TypeScript module `qrSvg.ts` that both the demo page and the supervisor controls can use.

2. Build `DemoControls.tsx` — a panel added to the top of the Supervisor tab that shows:
   - Demo idle: "No demo running" + "Start (Personal)" and "Start (Presentation)" buttons
   - Demo running: session info, current order ref, items remaining, "Stop" button
   - **Next item QR panel**: large (200×200 px) QR of the next pending line's product_barcode
     with product name + "Point your phone at this →" label
   - Auto-refreshes via 3s polling of `/api/demo/status` + `/api/orders/{id}`

**qrSvg.ts API**
```typescript
// Returns an SVG string encoding `text` at `px` × `px` pixels
export function qrSvg(text: string, px: number): string
```

**Expected Outcomes**
- `qrSvg.ts` produces identical output to the btt-print-labels.html inline QR engine
- Supervisor tab shows demo controls at all times
- Large next-item QR updates when a line is scanned
- Guest users see the panel read-only (Start/Stop buttons disabled)

**Todo List**
1. Create `server/web_ui/src/qrSvg.ts` — port the GF(256), rsGen, rsEnc, makeQR,
   and qrSVG functions from `btt-print-labels.html` to TypeScript, export `qrSvg()`
2. Create `server/web_ui/src/DemoControls.tsx`
3. Poll `GET /api/demo/status` every 3s for session state
4. Fetch `GET /api/orders/{current_order_id}` to find next pending line
5. Render next-item QR using `qrSvg(barcode, 200)` set as `dangerouslySetInnerHTML`
6. Wire Start (Personal) → `POST /api/demo/start { picker_id: auth.user.name, mode: "personal" }`
7. Wire Start (Presentation) → `POST /api/demo/start { mode: "presentation" }`
8. Wire Stop → `POST /api/demo/stop { session_id }`
9. Disable Start/Stop when `auth.user.role === 'guest'`
10. Insert `<DemoControls auth={auth} />` at top of `SupervisorView.tsx`

**Relevant Context**
- `btt-print-labels.html` lines 105–173 — QR engine to port
- `server/web_ui/src/SupervisorView.tsx` — insertion point
- `server/web_ui/src/useAuth.ts` — `auth.user.role`
- `server/web_ui/src/useSupervisorSocket.ts` — live pick events (optional enhancement)

**Status** — `[ ] pending`

---

### Sub-Task 4 — Contextual demo button in mobile view + pack wizard QR hints

**Intent**
Two mobile-facing changes:

1. **Contextual demo button** in `MobilePickerView.tsx` / `MobileControls.tsx`:
   - No demo loop for this picker → shows **"Start Demo"** button
   - Demo loop running + order assigned → normal scanning flow (button hidden or shows "Scanning…")
   - Demo loop running + no active order (e.g. returned from break) → shows **"Resume"**
   - On press: if no loop → `POST /api/demo/start { picker_id, mode: "personal" }`; 
     if loop exists → re-attach to current_order_id from status

2. **Pack wizard QR hints** in `PackWizard.tsx`:
   - At each step that requires scanning a specific item, display the expected QR code
     large (150×150 px) above the instruction text using `qrSvg()` from Sub-Task 3
   - For product scan steps: show the product barcode QR
   - For delivery zone step: show the staging zone QR (e.g. `STAGING:TINY`)
   - This keeps the full multi-step flow intact — just adds visual guidance

**Expected Outcomes**
- Mobile view shows single contextual button; state transitions cleanly
- Guest (demo-user) and named pickers both work via their own picker_id
- Pack wizard shows expected QR at every scan step
- Delivery zone QR displayed clearly when it is time to scan it

**Todo List**
1. In `MobileControls.tsx` — add demo button logic: poll `GET /api/demo/status` (or
   pass status as prop), render "Start Demo" / "Resume" / nothing based on state
2. Wire "Start Demo" press → `POST /api/demo/start`, then re-fetch order assignment
3. Wire "Resume" press → fetch current_order_id from status, assign to this picker view
4. In `PackWizard.tsx` — identify each step that requires a barcode scan
5. Add `<div dangerouslySetInnerHTML={{ __html: qrSvg(expectedBarcode, 150) }} />` above
   each scan instruction
6. For the delivery zone step, show `qrSvg('STAGING:' + stagingCode, 150)`

**Relevant Context**
- `server/web_ui/src/MobileControls.tsx` — Start/Stop Scanning button (to replace/extend)
- `server/web_ui/src/MobilePickerView.tsx` — picker_id source (`auth.user.picker_id ?? auth.user.name`)
- `server/web_ui/src/PackWizard.tsx` — existing multi-step pack UI
- `server/web_ui/src/qrSvg.ts` — from Sub-Task 3
- `server/web_ui/src/useAuth.ts` — `auth.user`

**Status** — `[ ] pending`

---

### Sub-Task 5 — Update "See the App →" routing on WelcomePage

**Intent**
Small re-wire: "See the App →" navigates to `/demo` instead of calling `loginAsGuest()`
directly. The `auth` prop and `WelcomeRoot` wrapper introduced in the previous session
are removed since they are no longer needed at the welcome route.

**Expected Outcomes**
- WelcomePage "See the App →" → `window.location.href = '/demo'`
- WelcomePage has no auth dependency
- `main.tsx` renders `<WelcomePage />` directly (no wrapper)

**Todo List**
1. In `WelcomePage.tsx` change `seeTheApp()` to `window.location.href = '/demo'`
2. Remove `Props` interface and `auth` prop from `WelcomePage`
3. In `main.tsx` remove `WelcomeRoot` function and restore direct `<WelcomePage />` render
4. Remove unused `useAuth` import from `main.tsx`

**Relevant Context**
- `server/web_ui/src/WelcomePage.tsx` — `seeTheApp()`, `Props` interface, `auth` prop
- `server/web_ui/src/main.tsx` — `WelcomeRoot` wrapper, `useAuth` import

**Status** — `[ ] pending`

---

### Sub-Task 6 — Build DemoPage.tsx

**Intent**
Create `DemoPage.tsx` — the `/demo` explainer page. No login required to view it.
A first-time visitor reads it, can scan QR codes on-screen with their phone, and
enters the live app via two CTA buttons.

**Page Sections (top to bottom)**

1. **Top bar** — BTT logo + "Powered by IBM Bob" link (matches WelcomePage)

2. **Hero** — "Try the Demo" headline; sub-line: "A live warehouse picking system you
   can try right now — on your phone, in two minutes, no install required."

3. **What you need** — three icon+text cards:
   - 📱 A smartphone (any modern browser)
   - 🏷️ These labels (on-screen is fine — point your phone at your laptop)
   - ⏱️ About 2 minutes

4. **How it works — 4 steps** — numbered step cards:
   1. Open the scanner on your phone with the button below
   2. Point your camera at any product label — it lights up on your screen
   3. Scan a staging zone label to confirm where the delivery goes
   4. Hit Validate — see your results in real time

5. **The labels** — section with "Print labels →" button + three grids.
   All labels 1×1 inch (`width:1in; height:1in`), dashed cut border.
   QR codes from `qrSvg.ts` (Sub-Task 3), rendered via `dangerouslySetInnerHTML`.

   **Grid A — 9 Product labels**:
   - Size dot (S=#0e6027, M=#0043ce, L=#a2191f)
   - QR (encodes product barcode e.g. BTT-00101)
   - Barcode value + short name

   **Grid B — 3 Staging zone labels** (distinct accents):
   - TINY → orange `#ff6b00`
   - WOND → teal `#00b4d8`
   - CHRM → purple `#6929c4`
   - QR encodes `STAGING:TINY` etc.

   **Grid C — 9 Shelf labels (A1–C3)**:
   - QR encodes `SHELF:A1` etc.
   - Shelf code below

6. **Two CTA buttons**:
   - Primary (purple): "Try scanning →" → `loginAsGuest()` then navigate to `/mobile`
   - Secondary (outline): "Browse the dashboard →" → `loginAsGuest()` then navigate to `/app`

7. **Footer** — same as WelcomePage

**Print CSS**
- `window.print()` on "Print labels →"
- `@media print`: hide everything except `#label-sheet`; `body { background: white }`
- Labels use physical CSS units (in, pt) for correct print sizing

**Expected Outcomes**
- `/demo` renders with no login required
- All 21 labels visible and scannable from a phone pointed at the screen
- Print produces a clean 1×1 inch label sheet
- Both CTA buttons create a guest session and navigate correctly
- Visual design matches WelcomePage (dark, #0f1117, IBM Plex Sans)

**Todo List**
1. Create `server/web_ui/src/DemoPage.tsx`
2. Import `qrSvg` from `./qrSvg` (Sub-Task 3)
3. Build all 7 sections with Tailwind + inline styles
4. Implement all 21 labels at 1×1 inch
5. Add print CSS via `<style>` tag injected in `useEffect` or as a `<GlobalStyles>`-style
   inline `<style>` element in the JSX
6. Wire both CTAs to `useAuth().loginAsGuest()` + navigate

**Relevant Context**
- `btt-print-labels.html` — label CSS, product data reference
- `server/web_ui/src/WelcomePage.tsx` — design language to match
- `fixtures/bobs-tiny-treasures/seed_btt.py` — authoritative product/staging/shelf data
- `server/web_ui/src/useAuth.ts` — `loginAsGuest()`
- `server/web_ui/src/qrSvg.ts` — from Sub-Task 3

**Status** — `[ ] pending`

---

### Sub-Task 7 — Wire DemoPage into main.tsx and full build

**Intent**
Register `/demo` route, clean up routing table, produce a clean build.

**Final routing table**

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `WelcomePage` | No auth wrapper |
| `/demo` | `DemoPage` | No auth required to view |
| `/app`, `/app/*` | `App` | Full supervisor/guest app |
| `/mobile`, `/mobile/*` | `MobilePickerView` | Standalone scanner |

**Expected Outcomes**
- All four routes render correctly
- `npm run build` passes with zero TypeScript errors

**Todo List**
1. Import `DemoPage` in `main.tsx`
2. Add `else if (path === '/demo')` branch rendering `<DemoPage />`
3. Confirm `WelcomeRoot` and stale `useAuth` import removed (Sub-Task 5)
4. Run `npm run build`, fix any type errors

**Relevant Context**
- `server/web_ui/src/main.tsx` — routing block

**Status** — `[ ] pending`

---

## Implementation Order

```
1  Seed data            — no build impact, safe to do first
2  Backend endpoints    — no frontend impact
3  qrSvg.ts + DemoControls — shared utility needed by Sub-Tasks 4 and 6
4  Mobile demo button + pack wizard QR hints
5  WelcomePage re-wire  — small isolated change
6  DemoPage.tsx         — depends on qrSvg.ts from Sub-Task 3
7  main.tsx + final build
```
