# Demo Explainer Page — /demo Route

## Overview

A new standalone page at `/demo` that serves as a guided explainer for first-time visitors
(colleagues, prospects, demo audiences) arriving from the Welcome page via "See the App →".

The page explains what the system is, walks through the mobile pick flow step-by-step,
and provides a printable label sheet (product + staging + shelf) that a visitor can cut out
and use immediately to do a real scan. Two exit buttons at the bottom drop the user into
the live app as a guest: "Try scanning →" (mobile view) and "Browse the dashboard →"
(full supervisor view).

The Welcome page's "See the App →" button is updated to navigate to `/demo` instead of
logging in directly as guest.

The page is a single self-contained HTML-in-React component (`DemoPage.tsx`) rendered
from `main.tsx` on the `/demo` path. It uses the same dark IBM design language as
`WelcomePage.tsx` (Tailwind + inline style, IBM Plex Sans, `#0f1117` background).

---

## Sub-Tasks

---

### Sub-Task 1 — Update "See the App →" routing

**Intent**  
Change the `WelcomePage` "See the App →" button so it navigates to `/demo` instead of
calling `auth.loginAsGuest()` directly. The guest login now happens from the demo page.

**Expected Outcomes**
- Clicking "See the App →" on the Welcome page navigates to `/demo`
- No guest session is created until the user actively clicks through on the demo page
- `WelcomePage` no longer needs `auth` prop for the "See the App" button (it is now just
  `window.location.href = '/demo'`)

**Todo List**
1. In `WelcomePage.tsx`, change `seeTheApp()` to set `window.location.href = '/demo'`
2. Remove the `auth` prop and `Props` interface from `WelcomePage` (no longer needed for
   this button — `loginAsGuest` is called from DemoPage instead)
3. Update `main.tsx` — remove the `WelcomeRoot` wrapper and restore direct `<WelcomePage />`
   render (no auth needed at that render site)
4. Add `/demo` route to `main.tsx` routing block → renders `<DemoPage />`

**Relevant Context**
- `picker-vision/server/web_ui/src/WelcomePage.tsx` — `seeTheApp()` function, `Props` interface
- `picker-vision/server/web_ui/src/main.tsx` — path routing block, `WelcomeRoot` component

**Status** — `[ ] pending`

---

### Sub-Task 2 — Build DemoPage.tsx

**Intent**  
Create the new `DemoPage.tsx` component. This is the main deliverable: a rich, single-scroll
explainer page that tells a first-time mobile user exactly what to do and gives them
everything they need to try the demo.

**Page Sections (in order)**

1. **Top bar** — same as WelcomePage (BTT logo + "Powered by IBM Bob" link)

2. **Hero** — headline "Try the Demo", sub-line explains this is a live warehouse picking
   system they can try right now on their phone

3. **What you need** — three icon+text cards:
   - A smartphone (any modern browser, no app install)
   - The printed labels below (or just use the page on screen)
   - ~2 minutes

4. **How it works — 4 steps** — numbered step cards:
   1. Print (or view on screen) the labels below
   2. Open the scanner on your phone — "Try scanning →" button drops into `/mobile` as guest
   3. Point your camera at any product label — it lights up and gets added to your pick list
   4. Scan a staging label to confirm where the tote goes — then hit Validate

5. **The products** — visual grid of all 9 products, each showing:
   - Product name + SKU
   - Size dot (S=green, M=blue, L=red) 
   - A live QR code (generated inline via the same vanilla-JS QR engine from btt-print-labels.html,
     inlined as a `<script>` block — same approach used in that file)

6. **Printable labels** — single section with three sub-grids, all labels sized 1×1 inch
   (via CSS `width: 1in; height: 1in`) with dashed cut borders, intended to print at 100%
   on Letter paper:
   - **9 product labels** — QR code + barcode value + product short name + size dot
   - **3 staging zone labels** — QR code (`STAGING:TINY` etc.) + zone name + colour accent
   - **9 shelf location labels** (A1–C3) — QR code (`SHELF:A1` etc.) + shelf code

   A "Print labels →" button triggers `window.print()`. Print CSS hides everything
   except the label grids.

7. **Two CTA buttons** at the bottom:
   - Primary (purple): "Try scanning →" → `auth.loginAsGuest()` then navigate to `/mobile`
   - Secondary (outline): "Browse the dashboard →" → `auth.loginAsGuest()` then navigate to `/app`

8. **Footer** — same as WelcomePage

**Visual Design**
- Dark background `#0f1117`, same IBM Plex Sans font stack
- Step cards: numbered circles + short description, horizontal on desktop / vertical on mobile
- Label grid uses `display: flex; flex-wrap: wrap; gap: 8pt` so it reflows naturally
- Print media query: `body { background: white }`, hide everything except `#label-sheet`

**Expected Outcomes**
- `/demo` renders the full explainer with no login required
- All 21 labels (9 product + 3 staging + 9 shelf) are visible and print-ready at 1×1 inch
- Both CTA buttons create a guest session and navigate to the correct view
- Page is fully self-contained — no extra API calls required to render

**Todo List**
1. Create `picker-vision/server/web_ui/src/DemoPage.tsx`
2. Inline the QR generation logic (copy from `btt-print-labels.html` `<script>` block,
   wrapped as a TypeScript module or inline IIFE in the component)
3. Build the 5-section layout with Tailwind + inline styles matching WelcomePage aesthetic
4. Implement all 21 labels at exactly 1×1 inch with dashed borders
5. Wire "Try scanning →" and "Browse the dashboard →" to `auth.loginAsGuest()` +
   `window.location.href`
6. Add print CSS that isolates just the `#label-sheet` div

**Relevant Context**
- `picker-vision/btt-print-labels.html` — QR generation JS, label CSS patterns, product/tote data
- `picker-vision/server/web_ui/src/WelcomePage.tsx` — design language to match
- `picker-vision/fixtures/bobs-tiny-treasures/seed_btt.py` — authoritative product/staging/shelf data
- `picker-vision/server/web_ui/src/useAuth.ts` — `loginAsGuest()` + `AuthState`
- Size dots: S=`#0e6027`, M=`#0043ce`, L=`#a2191f` (from btt-print-labels.html)
- Staging codes: `TINY`, `WOND`, `CHRM`; shelf codes: A1–C3 (3×3 grid)

**Status** — `[ ] pending`

---

### Sub-Task 3 — Wire DemoPage into main.tsx and build

**Intent**  
Register the `/demo` route in `main.tsx`, confirm the full routing table is correct,
and produce a clean production build.

**Expected Outcomes**
- `/` → WelcomePage (no auth wrapper needed)
- `/demo` → DemoPage (standalone, auth instantiated inside the component)
- `/app`, `/app/*` → full App
- `/mobile`, `/mobile/*` → standalone MobilePickerView
- `npm run build` completes with zero TypeScript errors

**Todo List**
1. Import `DemoPage` in `main.tsx`
2. Add `else if (path === '/demo')` branch rendering `<DemoPage />`
3. Restore `<WelcomePage />` (no `WelcomeRoot` wrapper)
4. Run `npm run build` and fix any type errors

**Relevant Context**
- `picker-vision/server/web_ui/src/main.tsx` — current routing block
- `picker-vision/server/web_ui/src/WelcomePage.tsx` — Props interface to be removed

**Status** — `[ ] pending`
