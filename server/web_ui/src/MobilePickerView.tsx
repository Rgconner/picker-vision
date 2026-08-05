/**
 * MobilePickerView — the top-level mobile picker screen.
 *
 * Layout adapts to orientation:
 *
 *  LANDSCAPE (tablet default — e.g. Samsung Tab A7 FE):
 *
 *   ┌──────────────────────────┬──────────────────┐
 *   │  Header: picker ID       │                  │
 *   ├──────────────────────────┤  Pick list       │
 *   │                          │  (scrollable)    │
 *   │  Camera + AR overlay     │                  │
 *   │  (fills column height)   │                  │
 *   │                          │                  │
 *   ├──────────────────────────┤                  │
 *   │  Controls bar            │                  │
 *   └──────────────────────────┴──────────────────┘
 *        55 % width                 45 % width
 *
 *  PORTRAIT (phone) — camera-first fullscreen HUD:
 *
 *   ┌──────────────────────────────┐
 *   │ [●Live] [picker-1]  [⟳ flip] │  floating top bar (44px, semi-transparent)
 *   │                              │
 *   │                              │
 *   │      CAMERA  (full screen)   │
 *   │                              │
 *   │  ┌────────────────────────┐  │
 *   │  │ SCAN NEXT              │  │  floating "next item" card, above bottom bar
 *   │  │ Widget A  ×2  [A-03]   │  │
 *   │  └────────────────────────┘  │
 *   │  [■ Stop Scanning] [≡ List]  │  floating bottom bar (thumb reach)
 *   └──────────────────────────────┘
 *
 *  Tap [≡ List] → bottom sheet slides up (50 % height), camera visible above.
 *  Tap camera → sheet dismisses.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order } from './types';
import { useMobileCamera } from './useMobileCamera';
import { useBarcodeScanner, DWELL_FRAMES, type ScanResult } from './useBarcodeScanner';
import type { WrongItem } from './MobileCameraView';
import { setRemoteLogPickerId } from './useRemoteLogger';
import { useMobilePickerSession } from './useMobilePickerSession';
import { MobileCameraView } from './MobileCameraView';
import { MobilePickList } from './MobilePickList';
import { MobileControls } from './MobileControls';
import { useDebugSnapshot } from './useDebugSnapshot';
import { ConfirmOverlay } from './ConfirmOverlay';
import { PackWizard } from './PackWizard';

// ── Next-item card — floating overlay, glove-first sizing ────────────────────
function NextItemCard({ orders }: { orders: Order[] }) {
  const nextLine = useMemo(() => {
    const active = orders.find((o) => o.status === 'picking' || o.status === 'pending');
    return active?.lines.find((l) => l.status !== 'picked') ?? null;
  }, [orders]);

  if (!nextLine) return null;
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 mx-3 rounded-2xl"
      style={{ background: 'rgba(12,14,22,0.94)', backdropFilter: 'blur(10px)', border: '1px solid rgba(45,49,66,0.9)' }}
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[#57606a] text-xs font-bold uppercase tracking-widest mb-1">
          Scan next
        </span>
        <span className="text-[#e2e8f0] text-2xl font-bold leading-tight">
          {nextLine.product_description ?? nextLine.product_barcode}
        </span>
        <span className="text-[#94a3b8] text-sm font-mono mt-1">{nextLine.product_barcode}</span>
      </div>
      {nextLine.staging_code && (
        <span className="shrink-0 text-lg font-mono font-bold px-4 py-2 rounded-2xl bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/40">
          {nextLine.staging_code}
        </span>
      )}
    </div>
  );
}

// ── Picker ID persistence ──────────────────────────────────────────────────────
const STORAGE_KEY = 'mobile_picker_id';

function savedPickerId(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}
function savePickerId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

// ── Active demo picker_id (for Join Demo banner) ───────────────────────────────
function useActiveDemoPickerId(): string | null {
  const [demoPickerId, setDemoPickerId] = React.useState<string | null>(null);
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/demo/status');
        if (!res.ok) return;
        const sessions: { picker_id: string }[] = await res.json();
        setDemoPickerId(sessions[0]?.picker_id ?? null);
      } catch { /* ignore */ }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);
  return demoPickerId;
}

// ── URL picker_id param (Option C — set by Join Demo QR scan) ─────────────────
function pickerIdFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('picker_id') ?? '';
  } catch { return ''; }
}

// ── Orientation hook ───────────────────────────────────────────────────────────
function useIsLandscape(): boolean {
  const query = '(orientation: landscape)';
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return landscape;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface MobilePickerViewProps {
  /** Pre-set from auth — overrides localStorage if provided */
  defaultPickerId?: string;
  /** When true the picker ID field is hidden (identity comes from auth) */
  lockedPickerId?: boolean;
}

export function MobilePickerView({ defaultPickerId, lockedPickerId = false }: MobilePickerViewProps) {
  const urlPickerId = pickerIdFromUrl();
  // QOL-029: savedPickerId() beats defaultPickerId when a non-empty saved value exists
  const initialId = urlPickerId || savedPickerId() || defaultPickerId || '';
  const [pickerId, setPickerId]   = useState<string>(initialId);
  const [editId, setEditId]       = useState<string>(initialId);
  const [editMode, setEditMode]   = useState<boolean>(!initialId && !lockedPickerId);

  // Option A: track active demo session for the Join Demo banner.
  // Auto-join: when a demo starts for a different picker_id and we are NOT
  // on the /mobile standalone page (i.e. defaultPickerId was supplied by auth),
  // switch to the demo picker ID automatically so the human flow "start demo on
  // laptop, pick up phone" just works without a manual tap.
  const demoPickerId = useActiveDemoPickerId();
  const showJoinBanner = demoPickerId && demoPickerId !== pickerId;

  // Auto-join when defaultPickerId is set (rendered inside /app with auth identity)
  // and a demo session starts for a different picker. Skip if picker ID is locked
  // (role=picker) or if we are already on the right ID.
  useEffect(() => {
    if (!demoPickerId) return;
    if (demoPickerId === pickerId) return;
    if (lockedPickerId) return;
    if (!defaultPickerId) return; // standalone /mobile — user set ID manually, don't override
    savePickerId(demoPickerId);
    setPickerId(demoPickerId);
    setEditId(demoPickerId);
    setEditMode(false);
  }, [demoPickerId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleJoinDemo() {
    if (!demoPickerId) return;
    savePickerId(demoPickerId);
    setPickerId(demoPickerId);
    setEditId(demoPickerId);
    setEditMode(false);
  }
  const [scanning, setScanning]   = useState<boolean>(false);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [localValidation, setLocalValidation] = useState<ReturnType<typeof useMobilePickerSession>['validationResult']>(null);

  // ── Workflow config (demo_scenario + control_layout) ─────────────────────
  const [demoScenario, setDemoScenario] = useState<'web-demo' | 'physical-demo'>('web-demo');
  // "auto" → guess from screen width at mount: ≥768px = mirrored, <768 = bottom
  const [controlLayout, setControlLayout] = useState<'mirrored' | 'bottom'>(
    () => window.innerWidth >= 768 ? 'mirrored' : 'bottom'
  );
  useEffect(() => {
    fetch('/api/workflow-config')
      .then((r) => r.ok ? r.json() : null)
      .then((cfg) => {
        if (cfg?.demo_scenario) setDemoScenario(cfg.demo_scenario);
        if (cfg?.control_layout && cfg.control_layout !== 'auto') {
          setControlLayout(cfg.control_layout as 'mirrored' | 'bottom');
        }
      })
      .catch(() => {});
  }, []);

  // ── Confirm overlay state ────────────────────────────────────────────────
  interface PendingConfirm { orderId: string; lineId: string; itemName: string; barcode: string; stagingCode: string | null; quantity: number; quantityPicked: number; }
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // QOL-017: 'confirmed' state — shown after confirm tap, before picker moves item away
  const [showMoveAway, setShowMoveAway] = useState(false);

  // QOL-025: 'order_complete' gate — shown after last pick before demo/advance
  interface OrderCompleteGate { orderId: string; reference: string; }
  const [orderCompleteGate, setOrderCompleteGate] = useState<OrderCompleteGate | null>(null);

  // PWZ-001: PackWizard target — set when Accept is tapped on order-complete gate
  interface PackTarget { orderId: string; reference: string; }
  const [packTarget, setPackTarget] = useState<PackTarget | null>(null);

  // QOL-028: 'demo ended' screen
  const [demoEnded, setDemoEnded] = useState(false);

  // QOL-014: local bbox store — populated when a scan fires, used if server says unexpected
  const pendingBboxRef = useRef<Map<string, ScanResult['bbox']>>(new Map());
  const [wrongItems, setWrongItems] = useState<WrongItem[]>([]);
  const wrongItemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks the most recently fired product barcode so the ConfirmOverlay gate
  // can match it against the order line without relying on pickerState.detections
  // (which is empty by the time the WS response arrives — scan loop already stopped).
  const lastFiredBarcodeRef = useRef<string | null>(null);

  // QOL-040 fix: pause scanner immediately on fire, before WS round-trip sets
  // pendingConfirm. Prevents second unit of a multi-qty item auto-confirming
  // in the background while the ConfirmOverlay is mounting.
  const scanFiredRef = useRef(false);

  // Recently-confirmed line IDs — populated by handleConfirm, cleared when
  // orders state refreshes.  Prevents the overlay re-firing on the same line
  // when the barcode stays in-frame after confirmation but before setOrders runs.
  const confirmedLinesRef = useRef<Set<string>>(new Set());

  // QOL-017: track the barcode currently in the 'move away' gate so the scan
  // loop gate can block re-fires on that same value while the overlay is shown.
  const moveAwayBarcodeRef = useRef<string | null>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isLandscape = useIsLandscape();

  // Debug mode — activated by ?debug=1 in the URL
  const debugMode = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    [],
  );

  // ── Camera ──────────────────────────────────────────────────────────────────
  // Wire remote logger to picker ID so camera logs reach the server
  useEffect(() => {
    setRemoteLogPickerId(pickerId || null);
    return () => setRemoteLogPickerId(null);
  }, [pickerId]);

  const camera = useMobileCamera();

  // ── Server session ──────────────────────────────────────────────────────────
  const { connected, pickerState, validationResult, lastScan, demoResetSeq, publish, sendAction, confirmPick } =
    useMobilePickerSession(pickerId || null);

  useEffect(() => {
    if (validationResult) setLocalValidation(validationResult);
  }, [validationResult]);

  // QOL-028: when demo_reset arrives, stop scan loop and show "Demo ended" screen
  useEffect(() => {
    if (demoResetSeq === 0) return; // ignore initial value
    setScanning(false);
    setShowMoveAway(false);
    scanFiredRef.current = false;
    setPendingConfirm(null);
    setOrderCompleteGate(null);
    setDemoEnded(true);
  }, [demoResetSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Barcode scanning ────────────────────────────────────────────────────────
  const handleDetect = useCallback((result: ScanResult) => {
    if (!scanning) return;

    // NAV:CONFIRM while confirm overlay is showing — trigger confirm
    if (result.type === 'nav' && result.navAction === 'CONFIRM' && pendingConfirm) {
      handleConfirm();
      return;
    }
    // NAV:SKIP while confirm overlay is showing — skip this item
    if (result.type === 'nav' && result.navAction === 'SKIP' && pendingConfirm) {
      scanFiredRef.current = false;
      setPendingConfirm(null);
      return;
    }
    // Ignore all scans while confirm overlay is open
    if (pendingConfirm) return;
    // Ignore NAV scans when no overlay is showing
    if (result.type === 'nav') return;

    // QOL-014: stash bbox so we can draw a local wrong-item overlay if server says unexpected
    if (result.type === 'product') {
      pendingBboxRef.current.set(result.value, result.bbox);
    }

    // Stash the fired barcode — the ConfirmOverlay gate reads this instead of
    // pickerState.detections (which is empty because the loop stops on fire).
    lastFiredBarcodeRef.current = result.value;

    // QOL-040: stop scanner immediately — don't wait for WS round-trip
    scanFiredRef.current = true;

    publish(result);

  }, [scanning, publish, pendingConfirm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the scan loop running while we wait for the WS confirmation — we need
  // the server's pickerState.detections to come back with status==='correct' so
  // the overlay gate can fire. The loop is paused only once pendingConfirm is set
  // (overlay is showing) to prevent re-fires during confirmation.
  const { unsupported: scannerUnsupported, candidates } =
    useBarcodeScanner(videoRef as React.RefObject<HTMLVideoElement | null>, scanning && !pendingConfirm && !scanFiredRef.current, handleDetect);

  // Debug snapshot — posts composite JPEG every 2 s when ?debug=1
  useDebugSnapshot(
    debugMode ? (pickerId || null) : null,
    videoRef as React.RefObject<HTMLVideoElement | null>,
    canvasRef as React.RefObject<HTMLCanvasElement | null>,
    debugMode && scanning,
  );

  // ── Orders fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) setOrders((await res.json()) as Order[]);
      } catch { /* ignore */ }
    }
    fetchOrders();
  }, [pickerState]);

  // ── Gate on correct scan from server WebSocket ───────────────────────────────
  // The scan loop stays running after a dwell-fire so the item remains visible
  // in the next frame — the event processor enriches it and sends back a WS
  // pickerState with detections[].status === 'correct'. We match on that signal
  // plus lastFiredBarcodeRef so we only raise the overlay for the barcode we
  // actually fired (not any other correct detection in frame).
  useEffect(() => {
    if (!pickerState || pendingConfirm) return;
    const fired = lastFiredBarcodeRef.current;
    if (!fired) return;
    // QOL-017: block re-fire if the move-away overlay is showing for this barcode
    if (moveAwayBarcodeRef.current === fired) return;
    const activeOrder = orders.find((o) => o.status === 'picking');
    if (!activeOrder) return;
    // Must see the fired barcode confirmed as 'correct' in this WS push
    const correct = pickerState.detections?.find(
      (d) => d.value === fired && d.status === 'correct' && d.order_id === activeOrder.id
    );
    if (!correct) return;
    const line = activeOrder.lines.find((l) => l.id === correct.line_id);
    if (!line) return;
    // Guard: skip if this line was already confirmed this session but orders
    // state hasn't refreshed yet — prevents the overlay re-firing on a
    // barcode that stays in-frame after confirmation.
    if (confirmedLinesRef.current.has(line.id)) return;
    lastFiredBarcodeRef.current = null;
    scanFiredRef.current = false; // overlay is up — scanner can re-arm for next pick
    setPendingConfirm({
      orderId:        activeOrder.id,
      lineId:         line.id,
      itemName:       line.product_description ?? fired,
      barcode:        fired,
      stagingCode:    line.staging_code ?? null,
      quantity:       line.quantity,
      quantityPicked: line.quantity_picked,
    });
  }, [pickerState, orders]); // eslint-disable-line react-hooks/exhaustive-deps

  // QOL-014: when pickerState arrives with unexpected detections, promote them
  // to local wrongItems using the bbox we stashed in handleDetect.
  // Auto-expire the overlay after 2 s so it doesn't linger indefinitely.
  useEffect(() => {
    if (!pickerState?.detections) return;
    const unexpected = pickerState.detections.filter((d) => d.status === 'unexpected');
    if (unexpected.length === 0) return;

    const items: WrongItem[] = unexpected.map((d) => ({
      value: d.value,
      // Prefer server bbox (tuple → object) when present, else local stash
      bbox: d.bbox && (d.bbox[2] > 0 || d.bbox[3] > 0)
        ? { x: d.bbox[0], y: d.bbox[1], w: d.bbox[2], h: d.bbox[3] }
        : (pendingBboxRef.current.get(d.value) ?? null),
    }));

    setWrongItems(items);

    if (wrongItemTimerRef.current) clearTimeout(wrongItemTimerRef.current);
    wrongItemTimerRef.current = setTimeout(() => setWrongItems([]), 2000);
  }, [pickerState]);

  const handleConfirm = useCallback(async () => {
    if (!pendingConfirm) return;
    const { orderId, lineId, barcode } = pendingConfirm;

    // Mark confirmed immediately so the overlay gate blocks re-fires while
    // confirmPick and the orders re-fetch are still in flight.
    confirmedLinesRef.current.add(lineId);

    // QOL-030: clear yellow bbox + lastScan immediately on confirm
    setWrongItems([]);

    // QOL-017: stop scan loop and show "move item away" overlay instead of
    // the 2-second blackout band-aid. Picker taps to resume scanning.
    scanFiredRef.current = false;
    setPendingConfirm(null);
    setScanning(false);
    moveAwayBarcodeRef.current = barcode;
    setShowMoveAway(true);

    await confirmPick(orderId, lineId);

    // Check if all lines are now picked — if so, show order-complete gate (QOL-025)
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        const order: Order = await res.json();
        // Clear confirmed-lines entries for this order now that orders state
        // is fresh — lines will correctly show as 'picked' going forward.
        order.lines.forEach((l) => confirmedLinesRef.current.delete(l.id));
        const allPicked = order.lines.every((l) => l.status === 'picked' || l.quantity_picked >= l.quantity);
        if (allPicked) {
          // QOL-025: do NOT auto-advance — show gate first
          setOrderCompleteGate({ orderId, reference: order.reference });
        }
        setOrders((prev) => prev.map((o) => o.id === orderId ? order : o));
      }
    } catch { /* ignore */ }
  }, [pendingConfirm, confirmPick, pickerId]);

  // PWZ-001: called when PackWizard closes (packed or dismissed)
  const handlePackedAndAdvance = useCallback(async (orderId: string) => {
    setPackTarget(null);
    setShowMoveAway(false);
    try {
      await fetch('/api/demo/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, picker_id: pickerId }),
      });
      const allRes = await fetch('/api/orders');
      if (allRes.ok) setOrders(await allRes.json());
    } catch { /* ignore */ }
    setScanning(true);
  }, [pickerId]);

  // QOL-025: Accept tap → open PackWizard; advance happens after packing
  const handleOrderCompleteAccept = useCallback(() => {
    if (!orderCompleteGate) return;
    const { orderId, reference } = orderCompleteGate;
    setOrderCompleteGate(null);
    setShowMoveAway(false);
    // PWZ-001: open wizard first; demo/advance fires in handlePackedAndAdvance
    setPackTarget({ orderId, reference });
  }, [orderCompleteGate]);

  // QOL-025: "Not yet" tap → back to idle, no new order
  const handleOrderCompleteNotYet = useCallback(() => {
    setOrderCompleteGate(null);
    setShowMoveAway(false);
    setScanning(false);
  }, []);

  // ── Confirm packed ──────────────────────────────────────────────────────────
  const handleConfirmPacked = useCallback(async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}/confirm-packed`, { method: 'POST' });
    } catch { /* ignore */ }
  }, []);

  // ── Picker ID save ──────────────────────────────────────────────────────────
  function handleSaveId() {
    const trimmed = editId.trim();
    if (!trimmed) return;
    savePickerId(trimmed);
    setPickerId(trimmed);
    setEditMode(false);
  }

  // ── Start / stop ────────────────────────────────────────────────────────────
  function handleStartStop(active: boolean) {
    setScanning(active);
    sendAction(active ? 'start' : 'stop');
    // Re-attempt video play on Start — provides the user gesture iOS requires
    // to unblock autoplay even when the stream is already attached.
    if (active && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }

  const detections     = pickerState?.detections     ?? [];
  const stagingRegions = pickerState?.staging_regions ?? [];

  // ── Portrait: bottom-sheet visibility state ────────────────────────────────
  const [listSheetOpen, setListSheetOpen] = useState(false);

  // ── Shared overlays (all layouts) ─────────────────────────────────────────

  // ── QOL-025: order-complete gate — full-width stacked buttons, glove-first ─
  const orderCompleteOverlay = orderCompleteGate ? (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: 'rgba(10,12,20,0.97)' }}
    >
      <span className="text-[#22c55e] text-7xl">✓</span>
      <span className="text-[#e2e8f0] text-3xl font-bold text-center">
        Order {orderCompleteGate.reference} complete
      </span>
      <span className="text-[#94a3b8] text-xl text-center">
        Ready for the next order?
      </span>
      <div className="flex flex-col gap-4 mt-2 w-full max-w-sm">
        <button
          onClick={handleOrderCompleteAccept}
          className="w-full py-6 rounded-3xl text-2xl font-bold text-[#161616] transition-all active:scale-95"
          style={{ background: '#22c55e' }}
        >
          ✓  Accept
        </button>
        <button
          onClick={handleOrderCompleteNotYet}
          className="w-full py-5 rounded-3xl text-xl font-bold text-[#e2e8f0] border-2 border-[#2d3142] transition-all active:scale-95"
          style={{ background: 'rgba(45,49,66,0.6)' }}
        >
          ✗  Not yet
        </button>
      </div>
    </div>
  ) : null;

  // ── QOL-028: demo ended — tap anywhere on full screen ────────────────────
  const demoEndedOverlay = demoEnded ? (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: 'rgba(10,12,20,0.97)' }}
      onClick={() => setDemoEnded(false)}
    >
      <span className="text-[#f1c21b] text-7xl">■</span>
      <span className="text-[#e2e8f0] text-2xl font-bold text-center">Demo ended by supervisor</span>
      <span className="text-[#94a3b8] text-lg text-center mt-1">
        Tap anywhere to dismiss
      </span>
    </div>
  ) : null;

  // ── QOL-017: move-away gate — tap anywhere ────────────────────────────────
  // 2-second enforced minimum before tap is honoured — Ma Window for reorientation.
  // Prevents the scanner immediately re-locking on a target still in frame.
  const moveAwayReadyRef = useRef(false);
  const [moveAwayCountdown, setMoveAwayCountdown] = useState(0);
  useEffect(() => {
    if (!showMoveAway) { moveAwayReadyRef.current = false; setMoveAwayCountdown(0); return; }
    moveAwayReadyRef.current = false;
    setMoveAwayCountdown(2);
    const t1 = setTimeout(() => setMoveAwayCountdown(1), 1000);
    const t2 = setTimeout(() => { moveAwayReadyRef.current = true; setMoveAwayCountdown(0); }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showMoveAway]);

  const moveAwayOverlay = showMoveAway && !orderCompleteGate ? (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8"
      style={{ background: 'rgba(10,12,20,0.97)' }}
      onClick={() => {
        if (!moveAwayReadyRef.current) return;
        setShowMoveAway(false); moveAwayBarcodeRef.current = null; setScanning(true);
      }}
    >
      <span className="text-[#22c55e] text-7xl">✓</span>
      <span className="text-[#e2e8f0] text-3xl font-bold text-center">Picked!</span>
      <span className="text-[#94a3b8] text-xl text-center">
        {moveAwayCountdown > 0
          ? `Move item away… (${moveAwayCountdown})`
          : 'Tap to continue'}
      </span>
    </div>
  ) : null;

  // ── PWZ-001: PackWizard — rendered once (fixed overlay, layout-agnostic) ──
  const packWizardOverlay = packTarget ? (
    <PackWizard
      orderId={packTarget.orderId}
      orderRef={packTarget.reference}
      onClose={() => handlePackedAndAdvance(packTarget.orderId)}
      onPacked={() => handlePackedAndAdvance(packTarget.orderId)}
    />
  ) : null;

  // ── Shared sub-components (both layouts) ──────────────────────────────────

  const cameraPanel = (
    <MobileCameraView
      stream={camera.stream}
      devices={camera.devices}
      activeDeviceId={camera.activeDeviceId}
      facing={camera.facing}
      error={camera.error}
      ready={camera.ready}
      onSwitch={camera.switchCamera}
      onToggleFacing={camera.toggleFacing}
      detections={detections}
      stagingRegions={stagingRegions}
      lastScan={lastScan}
      candidates={candidates}
      dwellFrames={DWELL_FRAMES}
      videoRef={videoRef as React.RefObject<HTMLVideoElement | null>}
      canvasRef={canvasRef as React.RefObject<HTMLCanvasElement | null>}
      debugMode={debugMode}
      wrongItems={wrongItems}
    />
  );

  const pickListPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-2 pb-1 shrink-0">
        <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">
          Pick List
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <MobilePickList
          orders={orders}
          detections={detections}
          orderCompletePending={pickerState?.order_complete_pending}
          onConfirmPacked={handleConfirmPacked}
        />
      </div>
    </div>
  );

  // ── LANDSCAPE layout ───────────────────────────────────────────────────────
  if (isLandscape) {
    // Shared overlays block used by both landscape variants
    const landscapeOverlays = (
      <>
        {packWizardOverlay}
        {pendingConfirm && (
          <ConfirmOverlay
            scenario={demoScenario}
            itemName={pendingConfirm.itemName}
            barcode={pendingConfirm.barcode}
            stagingCode={pendingConfirm.stagingCode}
            quantity={pendingConfirm.quantity}
            quantityPicked={pendingConfirm.quantityPicked}
            onConfirm={handleConfirm}
            onSkip={() => setPendingConfirm(null)}
          />
        )}
        {moveAwayOverlay}
        {orderCompleteOverlay}
        {demoEndedOverlay}
      </>
    );

    // Glove-sized header bar (shared)
    const landscapeHeader = (
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[#2d3142] bg-[#1a1d27]">
        <span className={`shrink-0 w-3 h-3 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[#94a3b8]'}`} />
        {!lockedPickerId && editMode ? (
          <>
            <input
              autoFocus type="text" value={editId}
              onChange={(e) => setEditId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveId(); }}
              placeholder="Enter picker ID"
              className="flex-1 bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-base rounded-xl px-4 py-2 focus:outline-none focus:border-[#06b6d4]"
            />
            <button onClick={handleSaveId} className="px-5 py-2 rounded-xl bg-[#06b6d4] text-black font-bold text-base shrink-0">Set</button>
          </>
        ) : (
          <>
            <span className="text-[#94a3b8] text-sm shrink-0">Picker</span>
            <span className="font-bold text-[#e2e8f0] text-base flex-1 truncate">{pickerId}</span>
            {!lockedPickerId && (
              <button onClick={() => setEditMode(true)} className="shrink-0 text-[#57606a] text-base px-3 py-2 rounded-xl hover:text-[#94a3b8]">✎</button>
            )}
          </>
        )}
        {scannerUnsupported && <span className="shrink-0 text-[#f1c21b] text-xl" title="Native scanner unavailable — use Chrome on Android">⚠</span>}
        {showJoinBanner && (
          <button
            onClick={handleJoinDemo}
            className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold bg-[#f1c21b] text-black active:brightness-90"
          >
            Join Demo
          </button>
        )}
      </div>
    );

    // Controls rail — used in both left and right rails for mirrored layout
    const controlsRail = (
      <div className="flex flex-col gap-3 px-4 py-4 justify-between h-full">
        <NextItemCard orders={orders} />
        <MobileControls
          pickerId={pickerId}
          scanning={scanning}
          onStartStop={handleStartStop}
          onValidate={() => sendAction('validate')}
          validationResult={localValidation}
          onClearValidation={() => setLocalValidation(null)}
          lastScanValue={lastScan?.value ?? null}
          connected={connected}
        />
      </div>
    );

    // ── MIRRORED: three-column — left rail | camera | right rail ─────────────
    if (controlLayout === 'mirrored') {
      return (
        <div className="flex overflow-hidden bg-[#0f1117] text-[#e2e8f0]" style={{ height: '100dvh' }}>
          {landscapeOverlays}

          {/* LEFT RAIL — 22% */}
          <div
            className="flex flex-col overflow-hidden border-r border-[#2d3142] bg-[#0f1117]"
            style={{ width: '22%' }}
          >
            {landscapeHeader}
            <div className="flex-1 min-h-0 overflow-hidden">
              {controlsRail}
            </div>
          </div>

          {/* CENTER — camera viewport, 56% */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              {cameraPanel}
            </div>
          </div>

          {/* RIGHT RAIL — 22% */}
          <div
            className="flex flex-col overflow-hidden border-l border-[#2d3142] bg-[#0f1117]"
            style={{ width: '22%' }}
          >
            {/* Spacer matching header height so rails align */}
            <div className="shrink-0 border-b border-[#2d3142]" style={{ height: 56 }} />
            <div className="flex-1 min-h-0 overflow-hidden">
              {controlsRail}
            </div>
          </div>
        </div>
      );
    }

    // ── BOTTOM: classic two-column — camera+controls | pick list ─────────────
    return (
      <div className="flex overflow-hidden bg-[#0f1117] text-[#e2e8f0]" style={{ height: '100dvh' }}>
        {landscapeOverlays}

        {/* Left column — camera + controls (55%) */}
        <div className="flex flex-col overflow-hidden border-r border-[#2d3142]" style={{ width: '55%' }}>
          {landscapeHeader}
          <NextItemCard orders={orders} />
          <div className="flex-1 min-h-0 overflow-hidden">
            {cameraPanel}
          </div>
          <div className="shrink-0 px-4 py-4 bg-[#0f1117]">
            <MobileControls
              pickerId={pickerId}
              scanning={scanning}
              onStartStop={handleStartStop}
              onValidate={() => sendAction('validate')}
              validationResult={localValidation}
              onClearValidation={() => setLocalValidation(null)}
              lastScanValue={lastScan?.value ?? null}
              connected={connected}
            />
          </div>
        </div>

        {/* Right column — pick list (45%) */}
        <div className="flex flex-col overflow-hidden" style={{ width: '45%' }}>
          {pickListPanel}
        </div>
      </div>
    );
  }

  // ── PORTRAIT layout — camera-first fullscreen HUD ─────────────────────────
  //
  //  Camera sits fixed behind everything.
  //  All UI elements float as absolute/fixed layers on top.
  //  Pick list slides up as a bottom sheet (50 % height) on demand.
  //
  const pendingCount = orders.reduce(
    (n, o) => n + o.lines.filter((l) => l.status !== 'picked').length,
    0,
  );

  return (
    <div
      className="fixed inset-0 bg-black text-[#e2e8f0] overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* ── Full-screen camera — always behind everything ── */}
      <div className="absolute inset-0">
        {cameraPanel}
      </div>

      {/* ── Fixed overlays ── */}
      {packWizardOverlay}
      {pendingConfirm && (
        <ConfirmOverlay
          scenario={demoScenario}
          itemName={pendingConfirm.itemName}
          barcode={pendingConfirm.barcode}
          stagingCode={pendingConfirm.stagingCode}
          quantity={pendingConfirm.quantity}
          quantityPicked={pendingConfirm.quantityPicked}
          onConfirm={handleConfirm}
          onSkip={() => setPendingConfirm(null)}
        />
      )}
      {moveAwayOverlay}
      {orderCompleteOverlay}
      {demoEndedOverlay}

      {/* ── TOP BAR — picker identity + connection + scanner warning ── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(10,12,20,0.75)', backdropFilter: 'blur(6px)' }}
      >
        {/* Connection dot */}
        <span className={`shrink-0 w-2 h-2 rounded-full ${connected ? 'bg-[#22c55e]' : 'bg-[#94a3b8]'}`} />

        {/* Picker ID — tap to edit */}
        {!lockedPickerId && editMode ? (
          <>
            <input
              autoFocus
              type="text"
              value={editId}
              onChange={(e) => setEditId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveId(); }}
              placeholder="picker-1"
              className="flex-1 min-w-0 bg-black/40 border border-[#2d3142] text-[#e2e8f0] text-sm rounded-lg px-3 py-1 focus:outline-none focus:border-[#06b6d4]"
            />
            <button
              onClick={handleSaveId}
              className="px-3 py-1 rounded-lg bg-[#06b6d4] text-black font-bold text-sm shrink-0"
            >
              Set
            </button>
          </>
        ) : (
          <>
            <span className="text-[#94a3b8] text-xs shrink-0">Picker</span>
            <span className="font-semibold text-[#e2e8f0] text-sm flex-1 truncate min-w-0">{pickerId}</span>
            {!lockedPickerId && (
              <button
                onClick={() => setEditMode(true)}
                className="shrink-0 text-[#57606a] text-xs px-2 py-1 rounded hover:text-[#94a3b8]"
              >
                ✎
              </button>
            )}
          </>
        )}

        {/* Scanner warning icon — shown inline in top bar to avoid stealing rows */}
        {scannerUnsupported && (
          <span
            className="shrink-0 text-[#f1c21b] text-base"
            title="Native barcode scanner not available — use Chrome on Android for best results."
          >
            ⚠
          </span>
        )}
      </div>

      {/* ── JOIN DEMO banner — tap anywhere on the banner to join ── */}
      {showJoinBanner && (
        <div
          className="absolute left-0 right-0 flex items-center gap-3 px-4 py-4 active:brightness-125"
          style={{ top: 44, background: 'rgba(241,194,27,0.15)', backdropFilter: 'blur(6px)', borderBottom: '1px solid rgba(241,194,27,0.3)', cursor: 'pointer' }}
          onClick={handleJoinDemo}
        >
          <span className="w-3 h-3 rounded-full bg-[#f1c21b] animate-pulse shrink-0" />
          <span className="text-[#f1c21b] text-base font-bold flex-1 truncate">
            Demo running as <span className="font-mono">{demoPickerId}</span> — tap to join
          </span>
        </div>
      )}

      {/* ── BOTTOM SHEET — pick list, slides up on demand ── */}
      {listSheetOpen && (
        <>
          {/* Tap-away backdrop — pressing camera area closes sheet */}
          <div
            className="absolute inset-0 z-20"
            onClick={() => setListSheetOpen(false)}
          />
          <div
            className="absolute left-0 right-0 bottom-0 z-30 flex flex-col rounded-t-2xl overflow-hidden"
            style={{
              height: '55dvh',
              background: 'rgba(15,17,23,0.97)',
              backdropFilter: 'blur(12px)',
              borderTop: '1px solid rgba(45,49,66,0.8)',
            }}
          >
            {/* Sheet handle — tap anywhere on the bar to dismiss */}
            <div
              className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#2d3142]"
              onClick={() => setListSheetOpen(false)}
            >
              <div className="w-10 h-1.5 rounded-full bg-[#2d3142] mx-auto absolute left-1/2 -translate-x-1/2 top-2.5" />
              <span className="text-[#57606a] text-sm font-bold uppercase tracking-wider flex-1">
                Pick List
              </span>
              <span className="text-[#57606a] text-2xl font-light leading-none ml-3">↓</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MobilePickList
                orders={orders}
                detections={detections}
                orderCompletePending={pickerState?.order_complete_pending}
                onConfirmPacked={handleConfirmPacked}
              />
            </div>
          </div>
        </>
      )}

      {/* ── BOTTOM HUD — next item card + action bar ── */}
      <div className="absolute left-0 right-0 bottom-0 flex flex-col gap-2 pb-3 z-10"
           style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))' }}>

        {/* Next item card — hidden when list sheet is open */}
        {!listSheetOpen && (
          <NextItemCard orders={orders} />
        )}

        {/* Action bar */}
        <div className="flex gap-3 px-3">
          <MobileControls
            pickerId={pickerId}
            scanning={scanning}
            onStartStop={handleStartStop}
            onValidate={() => sendAction('validate')}
            validationResult={localValidation}
            onClearValidation={() => setLocalValidation(null)}
            lastScanValue={lastScan?.value ?? null}
            connected={connected}
            onToggleList={() => setListSheetOpen((v) => !v)}
            listOpen={listSheetOpen}
            pendingCount={pendingCount}
          />
        </div>
      </div>
    </div>
  );
}
