/**
 * MobileLiteView — low-resource picker screen.
 *
 * Designed for older / low-end Android handhelds and environments where a
 * live camera feed is not practical (poor lighting, device constraints, or
 * simple USB/Bluetooth wedge scanner setups).
 *
 * What it replaces compared to the full AR mode:
 *   - No camera stream (no getUserMedia, no MediaStream, no video element)
 *   - No AR canvas / requestAnimationFrame draw loop
 *   - No BarcodeDetector / ZXing scanning engine
 *   - No debug snapshot
 *
 * What it keeps (identical behaviour):
 *   - Server session (WebSocket + POST /events/detection)
 *   - Pick list with live enriched detection status
 *   - Validation result modal
 *   - Start / Stop / Validate actions
 *   - Offline queue / coalescing publish path
 *
 * Scan input:
 *   A large auto-focused text field accepts barcode values typed or sent by
 *   a Bluetooth / USB HID wedge scanner (wedge scanners emit the value then
 *   a Return keystroke, which triggers the submit automatically).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from './types';
import { useMobilePickerSession } from './useMobilePickerSession';
import { MobileControls } from './MobileControls';
import { MobilePickList } from './MobilePickList';
import type { ScanResult } from './useBarcodeScanner';

interface Props {
  pickerId:   string;
  onChangeId: () => void;
}

export function MobileLiteView({ pickerId, onChangeId }: Props) {
  const [scanning, setScanning]         = useState(false);
  const [inputValue, setInputValue]     = useState('');
  const [orders, setOrders]             = useState<Order[]>([]);
  const [localValidation, setLocalValidation] = useState<ReturnType<typeof useMobilePickerSession>['validationResult']>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { connected, pickerState, validationResult, lastScan, publish, sendAction } =
    useMobilePickerSession(pickerId || null);

  useEffect(() => {
    if (validationResult) setLocalValidation(validationResult);
  }, [validationResult]);

  // Fetch orders whenever pickerState changes (same cadence as full mode)
  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) setOrders((await res.json()) as Order[]);
      } catch { /* ignore */ }
    }
    fetchOrders();
  }, [pickerState]);

  // Focus the scan field whenever scanning becomes active
  useEffect(() => {
    if (scanning) inputRef.current?.focus();
  }, [scanning]);

  // Submit a barcode value — mirrors the full-mode handleDetect path
  const submitBarcode = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value || !scanning) return;
    const isStaging = value.startsWith('STAGING:');
    const scan: ScanResult = {
      value,
      symbology: 'manual',
      type:        isStaging ? 'staging' : 'product',
      stagingCode: isStaging ? value.slice(8, 12).toUpperCase() : null,
      navAction:   null,
      bbox:        null,
      corners:     null,
    };
    publish(scan);
    setInputValue('');
  }, [scanning, publish]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submitBarcode(inputValue);
  }

  function handleStartStop(active: boolean) {
    setScanning(active);
    sendAction(active ? 'start' : 'stop');
    if (active) setTimeout(() => inputRef.current?.focus(), 50);
  }

  const handleConfirmPacked = useCallback(async (orderId: string) => {
    try { await fetch(`/api/orders/${orderId}/confirm-packed`, { method: 'POST' }); }
    catch { /* ignore */ }
  }, []);

  const detections     = pickerState?.detections     ?? [];
  const stagingRegions = pickerState?.staging_regions ?? [];
  void stagingRegions; // not rendered in lite mode (no camera frame to project onto)

  return (
    <div
      className="flex flex-col overflow-hidden bg-[#0f1117] text-[#e2e8f0]"
      style={{ height: '100dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[#2d3142] bg-[#1a1d27]">
        <span className="text-[#94a3b8] text-xs">Picker</span>
        <span className="font-semibold text-[#e2e8f0] text-sm flex-1 truncate">{pickerId}</span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#2d1f00] text-[#eab308] border border-[#eab308]/30">
          Lite
        </span>
        <button
          onClick={onChangeId}
          className="text-[#57606a] text-xs px-2 py-1 rounded hover:text-[#94a3b8]"
        >
          ✎ Edit
        </button>
      </div>

      {/* ── Scan input panel ── */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        <label className="block text-[#94a3b8] text-xs font-semibold mb-1.5 uppercase tracking-wider">
          Scan / Enter Barcode
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="none"          /* prefer hardware scanner; suppress software keyboard */
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!scanning}
            placeholder={scanning ? 'Scan or type barcode…' : 'Start scanning to enable'}
            className={`flex-1 rounded-xl px-4 py-3 text-base font-mono border transition-all focus:outline-none ${
              scanning
                ? 'bg-[#0f1117] border-[#06b6d4] text-[#e2e8f0] focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4]/40'
                : 'bg-[#0f1117] border-[#2d3142] text-[#57606a] cursor-not-allowed'
            }`}
          />
          <button
            onClick={() => submitBarcode(inputValue)}
            disabled={!scanning || !inputValue.trim()}
            className="px-4 py-3 rounded-xl bg-[#06b6d4] text-black font-bold text-sm disabled:opacity-30 active:brightness-90 transition-all shrink-0"
          >
            ↵
          </button>
        </div>

        {/* Last scan feedback */}
        {lastScan && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a1d27] border border-[#2d3142]">
            <span className="text-[#a78bfa] text-xs font-mono shrink-0">Last:</span>
            <span className="text-[#e2e8f0] text-xs font-mono font-semibold truncate flex-1">
              {lastScan.value}
            </span>
          </div>
        )}
      </div>

      {/* ── Scanning status strip ── */}
      {scanning && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1 bg-[#1a1d27] border-y border-[#2d3142]">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[#22c55e] text-xs font-semibold">Scanning…</span>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="shrink-0 pt-2">
        <MobileControls
          pickerId={pickerId}
          scanning={scanning}
          onStartStop={handleStartStop}
          onValidate={() => sendAction('validate')}
          validationResult={localValidation}
          onClearValidation={() => setLocalValidation(null)}
          lastScanValue={null}   /* rendered inline above instead */
          connected={connected}
        />
      </div>

      {/* ── Pick list ── */}
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
    </div>
  );
}
