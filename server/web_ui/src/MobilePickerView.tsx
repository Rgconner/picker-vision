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
import { useBarcodeScanner, type ScanResult } from './useBarcodeScanner';
import { useMobilePickerSession } from './useMobilePickerSession';
import { MobileCameraView } from './MobileCameraView';
import { MobilePickList } from './MobilePickList';
import { MobileControls } from './MobileControls';
import { useDebugSnapshot } from './useDebugSnapshot';

// ── Picker ID persistence ──────────────────────────────────────────────────────
const STORAGE_KEY = 'mobile_picker_id';

function savedPickerId(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}
function savePickerId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
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

export function MobilePickerView() {
  const [pickerId, setPickerId]   = useState<string>(savedPickerId);
  const [editId, setEditId]       = useState<string>(savedPickerId);
  const [editMode, setEditMode]   = useState<boolean>(!savedPickerId());
  const [scanning, setScanning]   = useState<boolean>(false);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [localValidation, setLocalValidation] = useState<ReturnType<typeof useMobilePickerSession>['validationResult']>(null);

  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const isLandscape = useIsLandscape();

  // Debug mode — activated by ?debug=1 in the URL
  const debugMode = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    [],
  );

  // ── Camera ──────────────────────────────────────────────────────────────────
  const camera = useMobileCamera();

  // ── Server session ──────────────────────────────────────────────────────────
  const { connected, pickerState, validationResult, lastScan, publish, sendAction } =
    useMobilePickerSession(pickerId || null);

  useEffect(() => {
    if (validationResult) setLocalValidation(validationResult);
  }, [validationResult]);

  // ── Barcode scanning ────────────────────────────────────────────────────────
  const handleDetect = useCallback((result: ScanResult) => {
    if (!scanning) return;
    publish(result);
  }, [scanning, publish]);

  useBarcodeScanner(videoRef as React.RefObject<HTMLVideoElement | null>, scanning, handleDetect);

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
  }

  const detections     = pickerState?.detections     ?? [];
  const stagingRegions = pickerState?.staging_regions ?? [];

  // ── Shared sub-sections ────────────────────────────────────────────────────

  const header = (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#2d3142] bg-[#1a1d27]">
      {editMode ? (
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
          <button
            onClick={() => setEditMode(true)}
            className="text-[#57606a] text-xs px-2 py-1 rounded hover:text-[#94a3b8]"
          >
            ✎ Edit
          </button>
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
      videoRef={videoRef as React.RefObject<HTMLVideoElement | null>}
      canvasRef={canvasRef as React.RefObject<HTMLCanvasElement | null>}
      debugMode={debugMode}
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

  // ── LANDSCAPE layout ───────────────────────────────────────────────────────
  if (isLandscape) {
    return (
      <div className="flex overflow-hidden bg-[#0f1117] text-[#e2e8f0]" style={{ height: '100dvh' }}>

        {/* Left column — camera + controls (55 %) */}
        <div className="flex flex-col overflow-hidden border-r border-[#2d3142]" style={{ width: '55%' }}>
          {header}
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
  // h-[100dvh]: dynamic viewport height — shrinks with browser chrome on mobile
  // Camera gets 55 dvh — the majority of screen since it is the primary surface
  // Controls use compact mode on narrow phones to recover vertical space
  const isCompact = window.innerWidth < 430;
  return (
    <div
      className="flex flex-col overflow-hidden bg-[#0f1117] text-[#e2e8f0]"
      style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {header}
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
