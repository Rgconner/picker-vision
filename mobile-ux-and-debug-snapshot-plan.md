# Mobile UX Fixes & Debug Snapshot Plan

## Top-Level Overview

Three independent improvements identified during mobile QA testing on a phone in portrait mode:

1. **Portrait layout space** — Too much vertical space consumed by non-camera UI (header,
   controls, pick list), leaving the scan area cramped. Also affected by browser toolbar
   overlap (`100vh` vs `100dvh`) and missing safe-area insets on notched devices.

2. **Detection ghosting** — A valid scan stacks on top of itself multiple times. Two
   root causes: the purple local-scan overlay never clears after server enrichment, and
   concurrent native `BarcodeDetector.detect()` calls race past the debounce check.

3. **Diagnostic visibility** — No way to see what the phone camera is capturing to
   diagnose scan behaviour without physical access to the device. Added a debug snapshot
   feed that composites the live video + AR overlay into a JPEG and POSTs it to the
   server every 2 s when `?debug=1` is in the URL.

Scope:
- `server/web_ui/src/MobilePickerView.tsx`
- `server/web_ui/src/MobileCameraView.tsx`
- `server/web_ui/src/useBarcodeScanner.ts`
- `server/web_ui/src/useMobileCamera.ts`
- `server/web_ui/src/useMobilePickerSession.ts`
- `server/web_ui/src/useDebugSnapshot.ts` *(new)*
- `server/api_gateway/main.py`
- `k8s/overlays/test/nginx-tls-configmap-patch.yaml`

Version bump: `web-ui` 1.2.0 → 1.3.0, `api-gateway` 1.2.0 → 1.3.0

---

## Sub-Tasks

---

### Sub-Task 1 — Fix portrait layout: viewport height, camera area, safe-area, resolution

**Status:** [x] done

**Intent**

On Chrome mobile `100vh` includes the collapsible browser toolbar (~72px) which is not
part of the visible viewport. Combined with a hard-coded `maxHeight: 42vh` for the
camera, the camera was getting only ~290px of usable height on a typical phone, with the
pick list and controls consuming the rest. Notched iPhones also had content clipped
behind the home indicator.

**Expected Outcomes**

- Browser toolbar no longer causes layout overflow/clip.
- Camera occupies the majority of portrait screen (~55% dynamic viewport height).
- Home indicator and notch do not overlap content on iPhones.
- Controls auto-compact on narrow phones to recover additional vertical space.
- Camera requests portrait-optimised resolution so less of the frame is cropped.

**Changes Made**

| File | Change |
|---|---|
| `MobilePickerView.tsx:229` | Landscape root: `h-screen` → `height: 100dvh` |
| `MobilePickerView.tsx:255` | Portrait root: `h-screen` → `height: 100dvh` with safe-area padding |
| `MobilePickerView.tsx:258` | Camera panel: `maxHeight: 42vh` → `maxHeight: 55dvh` |
| `MobilePickerView.tsx:262` | Portrait controls: `compact` prop set when `innerWidth < 430` |
| `useMobileCamera.ts:82` | Constraints: request `720×1280` when portrait, `1280×720` when landscape |

---

### Sub-Task 2 — Fix detection ghosting: lastScan expiry and concurrent detect() guard

**Status:** [x] done

**Intent**

Two independent ghosting mechanisms:

**A — `lastScan` never clears:** `setLastScan(scan)` is called on every detection and
never reset. The purple local-scan bounding box is drawn on every animation frame
indefinitely after a scan, overlapping the server-enriched yellow/green boxes.

**B — Concurrent native detect() calls:** The rAF loop fires `scan()` (async) and
immediately schedules the next frame without awaiting the result. At 60fps, 5–7
`detect()` promises can be in-flight simultaneously. Each can independently satisfy
the debounce check before `lastValueRef` is updated, causing duplicate events.

**C — ZXing re-registration:** The ZXing continuous loop's `useEffect` included
`onDetect` in its dependency array. Because `onDetect` is a `useCallback` that depends
on `scanning` and `publish`, it recreates on each parent render, causing ZXing to
re-register and occasionally fire a fresh callback before the previous one completes.

**Expected Outcomes**

- Purple local-scan overlay disappears ≤1.5 s after a scan (or immediately when the
  server reply arrives).
- No duplicate detection events from concurrent `detect()` calls.
- ZXing continuous loop does not re-register on parent re-renders.

**Changes Made**

| File | Change |
|---|---|
| `useMobilePickerSession.ts:34` | Added `lastScanTimer` ref |
| `useMobilePickerSession.ts:91` | Clear `lastScan` immediately on WS server reply |
| `useMobilePickerSession.ts:114` | Clear `lastScanTimer` and `lastScan` on unmount |
| `useMobilePickerSession.ts:158` | Auto-expire `lastScan` after 1.5 s in `publish()` |
| `useBarcodeScanner.ts:108` | Added `inFlightRef` to guard concurrent native detect calls |
| `useBarcodeScanner.ts:113` | Added stable `onDetectRef` — updated via `useEffect` |
| `useBarcodeScanner.ts:149` | Both engines call `onDetectRef.current()` instead of `onDetect` |
| `useBarcodeScanner.ts:192` | Native rAF loop: `await scan()` before next `requestAnimationFrame` |
| `useBarcodeScanner.ts:197` | Removed `onDetect` from ZXing `useEffect` dependency array |

---

### Sub-Task 3 — Add debug snapshot feed for remote camera visibility

**Status:** [x] done

**Intent**

With no physical access to the device it is impossible to diagnose scan behaviour —
what the camera sees, which barcodes are being detected, whether AR overlay boxes
are positioned correctly. The `MobileCameraView` canvas already composites the raw
video frame and all AR overlays. Capturing that composite as a JPEG and posting it to
the server every 2 s gives complete ground-truth visibility with minimal overhead.

Activated by `?debug=1` in the URL so it has zero production overhead when not needed.

**Expected Outcomes**

- Appending `?debug=1` to the mobile URL activates snapshot posting while scanning.
- The phone posts a JPEG composite (video + AR boxes) every 2 s to
  `POST /api/debug/snapshot/{picker_id}`.
- Any browser, curl, or tooling can retrieve the latest snapshot via
  `GET /api/debug/snapshot/{picker_id}` as a raw `image/jpeg`.
- Snapshots expire from Redis automatically after 30 s when the phone stops posting.
- A debug info panel overlay appears on the camera view showing live detection counts,
  last scan value, and a note confirming the snapshot endpoint.
- No supervisor-view changes — tabled for a future iteration.

**Changes Made**

| File | Change |
|---|---|
| `src/useDebugSnapshot.ts` | New file: `captureSnapshot()` utility + `useDebugSnapshot()` hook |
| `MobileCameraView.tsx:32` | Added optional `canvasRef` and `debugMode` props |
| `MobileCameraView.tsx:54` | Canvas ref is now forwarded from parent when `canvasRef` prop provided |
| `MobileCameraView.tsx:225` | Debug mode badge in top-right of camera controls bar |
| `MobileCameraView.tsx:233` | Debug info panel overlay (bottom of camera, pointer-events: none) |
| `MobilePickerView.tsx:79` | Added `canvasRef` ref |
| `MobilePickerView.tsx:82` | Added `debugMode` computed from `?debug=1` URL param |
| `MobilePickerView.tsx:107` | Wired `useDebugSnapshot` with canvas ref and debug flag |
| `MobilePickerView.tsx:200` | Passed `canvasRef` and `debugMode` to `MobileCameraView` |
| `api_gateway/main.py:470` | New `POST /api/debug/snapshot/{picker_id}` endpoint |
| `api_gateway/main.py:487` | New `GET /api/debug/snapshot/{picker_id}` endpoint |
| `api_gateway/main.py:161` | API key middleware: prefix-match `/api/debug/` as exempt |
| `nginx-tls-configmap-patch.yaml` | Added `/api/debug/` proxy block to HTTP + HTTPS servers (2 MB body limit) |

**Usage**

```
# On phone — open with debug mode:
https://your-host/?debug=1

# From any machine — retrieve latest snapshot:
curl https://your-host/api/debug/snapshot/picker-1 --output latest.jpg

# Or open directly in browser:
https://your-host/api/debug/snapshot/picker-1
```

---

## Decisions

- **`100dvh` not `h-screen`:** Dynamic viewport height is the correct unit for mobile
  full-screen layouts. Supported on all modern mobile browsers (Chrome 108+, Safari 15.4+,
  Firefox 101+).
- **Camera at 55dvh in portrait:** Camera is the primary interaction surface; it should
  dominate the screen. Controls and pick list get the remaining 45 dvh.
- **Safe-area via `env()`:** Applied as inline `paddingBottom`/`paddingTop` on the root
  container so it works regardless of Tailwind version.
- **1.5 s lastScan expiry:** Long enough that the purple box is visible for the operator
  to see confirmation, short enough that it doesn't linger as a ghost.
- **Snapshot at 65% JPEG quality, 2 s interval:** Good enough for visual diagnosis, low
  enough bandwidth that it doesn't interfere with scan events on a mobile connection.
  Each snapshot is ~20–40 kB; 30 kB × 0.5 per second = ~15 kB/s — negligible.
- **No supervisor view for snapshots (tabled):** Deferred to a future iteration. The
  immediate need is developer/Bob diagnostic access, not operator visibility.
- **Nginx `client_max_body_size 2m`:** Base64 JPEG at 65% quality for 720×1280 is
  approximately 60–120 kB. 2 MB is a safe limit with headroom.
