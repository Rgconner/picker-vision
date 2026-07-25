import React, { useEffect, useState } from 'react';
import type { PickerInfo } from './types';
import { useSupervisorSocket } from './useSupervisorSocket';
import { VideoPanel } from './VideoPanel';

export function SupervisorView() {
  const { states, connected } = useSupervisorSocket();
  const [pickers, setPickers] = useState<PickerInfo[]>([]);

  useEffect(() => {
    async function fetchPickers() {
      try {
        const res = await fetch('/api/pickers');
        if (!res.ok) return;
        const data = (await res.json()) as PickerInfo[];
        setPickers(data);
      } catch {
        // ignore
      }
    }
    fetchPickers();
    const interval = setInterval(fetchPickers, 10_000);
    return () => clearInterval(interval);
  }, []);

  function statusBadge(pickerId: string, pickerInfo?: PickerInfo) {
    const hasState = !!states[pickerId];
    const isOnline = pickerInfo?.status === 'online' || hasState;
    return isOnline
      ? 'bg-[#0a2d14] text-[#22c55e]'
      : 'bg-[#2d3142] text-[#94a3b8]';
  }

  function statusLabel(pickerId: string, pickerInfo?: PickerInfo) {
    const hasState = !!states[pickerId];
    return pickerInfo?.status === 'online' || hasState ? 'online' : 'offline';
  }

  // Merge picker info + any live state that came in without a registration entry
  const allPickerIds = Array.from(
    new Set([
      ...pickers.map((p) => p.picker_id),
      ...Object.keys(states),
    ]),
  );

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="text-[#e2e8f0] font-semibold">Supervisor View</span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            connected ? 'bg-[#0a2d14] text-[#22c55e]' : 'bg-[#2d3142] text-[#94a3b8]'
          }`}
        >
          {connected ? '● Connected' : '○ Connecting…'}
        </span>
        <span className="text-[#94a3b8] text-xs ml-auto">
          {allPickerIds.length} picker{allPickerIds.length !== 1 ? 's' : ''}
        </span>
      </div>

      {allPickerIds.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-[#94a3b8] text-sm border border-[#2d3142] rounded-xl bg-[#1a1d27]">
          No active pickers
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1rem',
          }}
        >
          {allPickerIds.map((pickerId) => {
            const info = pickers.find((p) => p.picker_id === pickerId);
            const pickerState = states[pickerId];
            const detections = pickerState?.detections ?? [];
            const stagingRegions = pickerState?.staging_regions ?? [];
            const badgeClasses = statusBadge(pickerId, info);
            const label = statusLabel(pickerId, info);

            return (
              <div
                key={pickerId}
                className="rounded-xl border border-[#2d3142] bg-[#1a1d27] overflow-hidden flex flex-col"
              >
                {/* Tile header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3142]">
                  <span className="text-[#e2e8f0] font-semibold text-sm">{pickerId}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClasses}`}>
                    {label}
                  </span>
                </div>

                {/* Compact video panel */}
                <VideoPanel
                  pickerId={pickerId}
                  streamUrl={info?.stream_url}
                  detections={detections}
                  stagingRegions={stagingRegions}
                  compact
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
