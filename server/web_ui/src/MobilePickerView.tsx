/**
 * MobilePickerView — the top-level mobile picker screen.
 *
 * Layout (portrait-first, works landscape too):
 *
 *   ┌──────────────────────────────┐
 *   │  Header: picker ID selector  │
 *   ├──────────────────────────────┤
 *   │  Camera + AR overlay         │  ← 4:3 aspect, fills width
 *   ├──────────────────────────────┤
 *   │  Controls bar                │  ← Start/Stop · Validate
 *   ├──────────────────────────────┤
 *   │  Pick list (scrollable)      │
 *   └──────────────────────────────┘
 *
 * The camera feed occupies the top of the screen so the picker's thumb can
 * reach the controls without obscuring the camera view.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from './types';
import { useMobileCamera } from './useMobileCamera';
import { useBarcodeScanner, type ScanResult } from './useBarcodeScanner';
import { useMobilePickerSession } from './useMobilePickerSession';
import { MobileCameraView } from './MobileCameraView';
import { MobilePickList } from './MobilePickList';
import { MobileControls } from './MobileControls';

// ── Picker ID persistence ──────────────────────────────────────────────────────
const STORAGE_KEY = 'mobile_picker_id';

function savedPickerId(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}
function savePickerId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function MobilePickerView() {
  const [pickerId, setPickerId]   = useState<string>(savedPickerId);
  const [editId, setEditId]       = useState<string>(savedPickerId);
  const [editMode, setEditMode]   = useState<boolean>(!savedPickerId());
  const [scanning, setScanning]   = useState<boolean>(false);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [localValidation, setLocalValidation] = useState<ReturnType<typeof useMobilePickerSession>['validationResult']>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Camera ──────────────────────────────────────────────────────────────────
  const camera = useMobileCamera();

  // ── Server session ──────────────────────────────────────────────────────────
  const { connected, pickerState, validationResult, lastScan, publish, sendAction } =
    useMobilePickerSession(pickerId || null);

  // Sync validation result into local state so Controls can clear it
  useEffect(() => {
    if (validationResult) setLocalValidation(validationResult);
  }, [validationResult]);

  // ── Barcode scanning ────────────────────────────────────────────────────────
  const handleDetect = useCallback((result: ScanResult) => {
    if (!scanning) return;
    publish(result);
  }, [scanning, publish]);

  useBarcodeScanner(videoRef as React.RefObject<HTMLVideoElement | null>, scanning, handleDetect);

  // ── Orders fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) setOrders((await res.json()) as Order[]);
      } catch { /* ignore */ }
    }
    fetchOrders();
  }, [pickerState]); // re-fetch when state updates so pick status stays fresh

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

  const detections    = pickerState?.detections     ?? [];
  const stagingRegions = pickerState?.staging_regions ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-[#0f1117] text-[#e2e8f0] overflow-x-hidden">

      {/* ── Picker ID header ────────────────────────────────────────────── */}
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

      {/* ── Camera + AR overlay ─────────────────────────────────────────── */}
      <div className="shrink-0 w-full">
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
        />
      </div>

      {/* Scan indicator strip */}
      {scanning && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-[#1a1d27] border-b border-[#2d3142]">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[#22c55e] text-xs font-semibold">Scanning…</span>
        </div>
      )}

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div className="shrink-0 pt-2">
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

      {/* ── Pick list ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-6">
        <div className="px-3 pt-2 pb-1">
          <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">
            Pick List
          </span>
        </div>
        <MobilePickList
          orders={orders}
          orderCompletePending={pickerState?.order_complete_pending}
          onConfirmPacked={handleConfirmPacked}
        />
      </div>
    </div>
  );
}
