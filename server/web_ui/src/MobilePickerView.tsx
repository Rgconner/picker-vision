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
 *  PORTRAIT (phone fallback):
 *
 *   ┌──────────────────────────────┐
 *   │  Header: picker ID           │
 *   ├──────────────────────────────┤
 *   │  Camera + AR  (max 42 vh)    │
 *   ├──────────────────────────────┤
 *   │  Controls bar                │
 *   ├──────────────────────────────┤
 *   │  Pick list (scrollable)      │
 *   └──────────────────────────────┘
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

// ── Next-item banner — shown above camera in the new scan-from-screen workflow ─
function NextItemBanner({ orders }: { orders: Order[] }) {
  const nextLine = useMemo(() => {
    const active = orders.find((o) => o.status === 'picking' || o.status === 'pending');
    return active?.lines.find((l) => l.status !== 'picked') ?? null;
  }, [orders]);

  if (!nextLine) return null;
  return (
    <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-[#2d3142] bg-[#12151f]">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[#57606a] text-[10px] font-semibold uppercase tracking-wider">
          Scan next
        </span>
        <span className="text-[#e2e8f0] text-sm font-bold truncate">
          {nextLine.product_description ?? nextLine.product_barcode}
        </span>
        <span className="text-[#94a3b8] text-xs font-mono">{nextLine.product_barcode}</span>
      </div>
      {nextLine.staging_code && (
        <span className="shrink-0 text-xs font-mono font-bold px-2 py-1 rounded-lg bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
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

  // ── Demo scenario ────────────────────────────────────────────────────────
  const [demoScenario, setDemoScenario] = useState<'web-demo' | 'physical-demo'>('web-demo');
  useEffect(() => {
    fetch('/api/workflow-config')
      .then((r) => r.ok ? r.json() : null)
      .then((cfg) => { if (cfg?.demo_scenario) setDemoScenario(cfg.demo_scenario); })
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

    publish(result);

  }, [scanning, publish, pendingConfirm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the scan loop running while we wait for the WS confirmation — we need
  // the server's pickerState.detections to come back with status==='correct' so
  // the overlay gate can fire. The loop is paused only once pendingConfirm is set
  // (overlay is showing) to prevent re-fires during confirmation.
  const { unsupported: scannerUnsupported, candidates } =
    useBarcodeScanner(videoRef as React.RefObject<HTMLVideoElement | null>, scanning && !pendingConfirm, handleDetect);

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

  // QOL-025: Accept tap → advance demo and clear gate
  const handleOrderCompleteAccept = useCallback(async () => {
    if (!orderCompleteGate) return;
    const { orderId } = orderCompleteGate;
    setOrderCompleteGate(null);
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
  }, [orderCompleteGate, pickerId]);

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

  // ── Shared sub-sections ────────────────────────────────────────────────────

  const scannerWarning = scannerUnsupported ? (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#f1c21b]/30"
         style={{ background: 'rgba(241,194,27,0.08)' }}>
      <span className="text-[#f1c21b] text-lg shrink-0">⚠</span>
      <span className="text-[#f1c21b] text-xs">
        Native barcode scanner not available on this device — scanning disabled.
        Performance may be compromised. Use Chrome on Android for best results.
      </span>
    </div>
  ) : null;

  const joinBanner = showJoinBanner ? (
    <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-[#f1c21b]/30 bg-[#f1c21b]/8"
         style={{ background: 'rgba(241,194,27,0.07)' }}>
      <span className="w-2 h-2 rounded-full bg-[#f1c21b] animate-pulse shrink-0" />
      <span className="text-[#f1c21b] text-xs flex-1">
        Demo running as <span className="font-mono font-semibold">{demoPickerId}</span>
      </span>
      <button
        onClick={handleJoinDemo}
        className="shrink-0 px-3 py-1 rounded-md text-xs font-bold bg-[#f1c21b] text-black active:brightness-90 transition-all"
      >
        Join Demo
      </button>
    </div>
  ) : null;

  const header = (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#2d3142] bg-[#1a1d27]">
      {!lockedPickerId && editMode ? (
        <>
          <input
            autoFocus
            type="text"
            value={editId}
            onChange={(e) => setEditId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveId(); }}
            placeholder="Enter picker ID (e.g. picker-1)"
            className="flex-1 bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#06b6d4]"
          />
          <button
            onClick={handleSaveId}
            className="px-4 py-2 rounded-lg bg-[#06b6d4] text-black font-bold text-sm shrink-0"
          >
            Set
          </button>
        </>
      ) : (
        <>
          <span className="text-[#94a3b8] text-xs">Picker</span>
          <span className="font-semibold text-[#e2e8f0] text-sm flex-1 truncate">{pickerId}</span>
          {!lockedPickerId && (
            <button
              onClick={() => setEditMode(true)}
              className="text-[#57606a] text-xs px-2 py-1 rounded hover:text-[#94a3b8]"
            >
              ✎ Edit
            </button>
          )}
        </>
      )}
    </div>
  );

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

  const scanStrip = scanning && (
    <div className="shrink-0 flex items-center justify-center gap-2 py-1 bg-[#1a1d27] border-b border-[#2d3142]">
      <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
      <span className="text-[#22c55e] text-xs font-semibold">Scanning…</span>
    </div>
  );

  const controls = (
    <MobileControls
      pickerId={pickerId}
      scanning={scanning}
      onStartStop={handleStartStop}
      onValidate={() => sendAction('validate')}
      validationResult={localValidation}
      onClearValidation={() => setLocalValidation(null)}
      lastScanValue={lastScan?.value ?? null}
      connected={connected}
      compact={isLandscape}
    />
  );

  const pickList = (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-3 pt-2 pb-1">
        <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">
          Pick List
        </span>
      </div>
      <MobilePickList
        orders={orders}
        detections={detections}
        orderCompletePending={pickerState?.order_complete_pending}
        onConfirmPacked={handleConfirmPacked}
      />
    </div>
  );

  // ── QOL-025: order-complete gate overlay ─────────────────────────────────
  const orderCompleteOverlay = orderCompleteGate ? (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: 'rgba(10,12,20,0.97)' }}
    >
      <span className="text-[#22c55e] text-5xl">✓</span>
      <span className="text-[#e2e8f0] text-2xl font-bold text-center">
        Order {orderCompleteGate.reference} complete
      </span>
      <span className="text-[#94a3b8] text-sm text-center">Ready for the next order?</span>
      <div className="flex gap-4 mt-2">
        <button
          onClick={handleOrderCompleteAccept}
          className="px-8 py-4 rounded-2xl text-lg font-bold text-[#161616] transition-all active:scale-95"
          style={{ background: '#22c55e' }}
        >
          ✓ Accept
        </button>
        <button
          onClick={handleOrderCompleteNotYet}
          className="px-8 py-4 rounded-2xl text-lg font-bold text-[#e2e8f0] border border-[#2d3142] transition-all active:scale-95"
          style={{ background: 'rgba(45,49,66,0.8)' }}
        >
          ✗ Not yet
        </button>
      </div>
    </div>
  ) : null;

  // ── QOL-028: demo ended overlay ───────────────────────────────────────────
  const demoEndedOverlay = demoEnded ? (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: 'rgba(10,12,20,0.97)' }}
    >
      <span className="text-[#f1c21b] text-5xl">■</span>
      <span className="text-[#e2e8f0] text-xl font-bold text-center">Demo ended by supervisor</span>
      <span className="text-[#94a3b8] text-sm text-center">Wait for the next demo session to begin</span>
      <button
        onClick={() => setDemoEnded(false)}
        className="mt-4 px-6 py-3 rounded-xl text-sm font-bold text-[#e2e8f0] border border-[#2d3142] active:brightness-90 transition-all"
        style={{ background: 'rgba(45,49,66,0.8)' }}
      >
        Dismiss
      </button>
    </div>
  ) : null;

  // ── LANDSCAPE layout ───────────────────────────────────────────────────────
  if (isLandscape) {
    return (
      <div className="flex overflow-hidden bg-[#0f1117] text-[#e2e8f0]" style={{ height: '100dvh' }}>
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
        {/* QOL-017: move-away gate — shown after confirm, before resuming scan */}
        {showMoveAway && !orderCompleteGate && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6"
            style={{ background: 'rgba(10,12,20,0.97)' }}
            onClick={() => { setShowMoveAway(false); moveAwayBarcodeRef.current = null; setScanning(true); }}
          >
            <span className="text-[#22c55e] text-5xl">✓</span>
            <span className="text-[#e2e8f0] text-xl font-bold text-center">Picked!</span>
            <span className="text-[#94a3b8] text-sm text-center">Move item away, then tap to continue scanning</span>
          </div>
        )}
        {orderCompleteOverlay}
        {demoEndedOverlay}

        {/* Left column — camera + controls (55 %) */}
        <div className="flex flex-col overflow-hidden border-r border-[#2d3142]" style={{ width: '55%' }}>
          {header}
          {scannerWarning}
          {joinBanner}
          <NextItemBanner orders={orders} />
          {/* Camera fills the remaining vertical space */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {cameraPanel}
          </div>
          {scanStrip}
          <div className="shrink-0">
            {controls}
          </div>
        </div>

        {/* Right column — pick list (45 %) */}
        <div className="flex flex-col overflow-hidden" style={{ width: '45%' }}>
          {pickList}
        </div>

      </div>
    );
  }

  // ── PORTRAIT layout (phone fallback) ───────────────────────────────────────
  const isCompact = window.innerWidth < 430;
  return (
    <div
      className="flex flex-col overflow-hidden bg-[#0f1117] text-[#e2e8f0]"
      style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
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
      {/* QOL-017: move-away gate — shown after confirm, before resuming scan */}
      {showMoveAway && !orderCompleteGate && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6"
          style={{ background: 'rgba(10,12,20,0.97)' }}
          onClick={() => { setShowMoveAway(false); moveAwayBarcodeRef.current = null; setScanning(true); }}
        >
          <span className="text-[#22c55e] text-5xl">✓</span>
          <span className="text-[#e2e8f0] text-xl font-bold text-center">Picked!</span>
          <span className="text-[#94a3b8] text-sm text-center">Move item away, then tap to continue scanning</span>
        </div>
      )}
      {orderCompleteOverlay}
      {demoEndedOverlay}
      {header}
      {scannerWarning}
      {joinBanner}
      <NextItemBanner orders={orders} />
      {/* Camera takes up to 55 dvh — leaves ~45 dvh for controls + pick list */}
      <div className="shrink-0 w-full overflow-hidden" style={{ maxHeight: '55dvh' }}>
        {cameraPanel}
      </div>
      {scanStrip}
      <div className="shrink-0">
        <MobileControls
          pickerId={pickerId}
          scanning={scanning}
          onStartStop={handleStartStop}
          onValidate={() => sendAction('validate')}
          validationResult={localValidation}
          onClearValidation={() => setLocalValidation(null)}
          lastScanValue={lastScan?.value ?? null}
          connected={connected}
          compact={isCompact}
        />
      </div>
      {pickList}
    </div>
  );
}
