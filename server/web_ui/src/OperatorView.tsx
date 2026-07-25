import React, { useCallback, useEffect, useState } from 'react';
import type { Order, PickerInfo } from './types';
import { usePickerSocket } from './usePickerSocket';
import { VideoPanel } from './VideoPanel';
import { PickList } from './PickList';
import { Controls } from './Controls';

export function OperatorView() {
  const [pickers, setPickers] = useState<PickerInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  const { state, validationResult, connected } = usePickerSocket(selectedId);
  const [localValidation, setLocalValidation] = useState(validationResult);

  // Sync validationResult from the hook into local state so Controls can clear it
  useEffect(() => {
    if (validationResult !== null) setLocalValidation(validationResult);
  }, [validationResult]);

  // Fetch picker list on mount and every 10s
  useEffect(() => {
    async function fetchPickers() {
      try {
        const res = await fetch('/api/pickers');
        if (!res.ok) return;
        const data = (await res.json()) as PickerInfo[];
        setPickers(data);
        setSelectedId((prev) => {
          if (prev !== null) return prev;
          return data.length > 0 ? data[0].picker_id : null;
        });
      } catch {
        // ignore
      }
    }
    fetchPickers();
    const interval = setInterval(fetchPickers, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch orders on mount and when state changes (new detection events may update pick status)
  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch('/api/orders');
        if (!res.ok) return;
        const data = (await res.json()) as Order[];
        setOrders(data);
      } catch {
        // ignore
      }
    }
    fetchOrders();
  }, [state]);

  const handleConfirmPacked = useCallback(async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}/confirm-packed`, { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  const detections = state?.detections ?? [];
  const stagingRegions = state?.staging_regions ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Picker selector bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#2d3142] bg-[#1a1d27] shrink-0">
        <label className="text-[#94a3b8] text-sm font-medium" htmlFor="picker-select">
          Picker
        </label>
        <select
          id="picker-select"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
          className="bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#06b6d4]"
        >
          {pickers.length === 0 && (
            <option value="">No pickers available</option>
          )}
          {pickers.map((p) => (
            <option key={p.picker_id} value={p.picker_id}>
              {p.picker_id}
            </option>
          ))}
        </select>
        {selectedId && (() => {
          const selectedPicker = pickers.find((p) => p.picker_id === selectedId);
          return selectedPicker ? (
            <span className="text-xs text-[#94a3b8]">
              {selectedPicker.status} · {selectedPicker.version ?? 'unknown'}
            </span>
          ) : null;
        })()}
        <span
          className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${
            connected ? 'bg-[#0a2d14] text-[#22c55e]' : 'bg-[#2d3142] text-[#94a3b8]'
          }`}
        >
          {connected ? '● Live' : '○ Connecting…'}
        </span>
      </div>

      {/* Main layout: video (60%) + picklist (40%) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: video */}
        <div className="flex-[3] min-w-0 overflow-hidden bg-[#0f1117]">
          {selectedId ? (
            <VideoPanel
              pickerId={selectedId}
              streamUrl={pickers.find((p) => p.picker_id === selectedId)?.stream_url}
              detections={detections}
              stagingRegions={stagingRegions}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#94a3b8] text-sm">
              Select a picker to view stream
            </div>
          )}
        </div>

        {/* Right: pick list */}
        <div className="flex-[2] min-w-0 border-l border-[#2d3142] bg-[#0f1117] p-3 overflow-y-auto">
          <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
            Pick List
          </div>
          <PickList
            orders={orders}
            orderCompletePending={state?.order_complete_pending}
            onConfirmPacked={handleConfirmPacked}
          />
        </div>
      </div>

      {/* Bottom controls bar */}
      {selectedId && (
        <div className="shrink-0 border-t border-[#2d3142] bg-[#1a1d27] px-4 py-3">
          <Controls
            pickerId={selectedId}
            validationResult={localValidation}
            onClearValidation={() => setLocalValidation(null)}
          />
        </div>
      )}
    </div>
  );
}
