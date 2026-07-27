/**
 * SupervisorView — shows all active pickers with optional focus mode.
 *
 * Default:  grid of picker tiles (status + video feed)
 *           each tile has a [Focus] button
 *
 * Focused:  full-screen view for one picker showing:
 *           - Current item's Data Matrix code (large, scannable from screen)
 *           - Item name, barcode, order reference
 *           - Pick progress bar
 *           - Live updates via supervisor WebSocket
 *           - [← Back] to return to grid
 */

import React, { useEffect, useState } from 'react';
import type { Order, PickerInfo } from './types';
import type { AuthState } from './useAuth';
import { useSupervisorSocket } from './useSupervisorSocket';
import { VideoPanel } from './VideoPanel';
import { DemoControls } from './DemoControls';
import { ScanStrip } from './ScanStrip';
import { dmSvg } from './dmSvg';

interface Props {
  auth: AuthState;
}

// ── Focused picker view ────────────────────────────────────────────────────────

interface FocusedPickerProps {
  pickerId: string;
  onBack: () => void;
}

function FocusedPickerView({ pickerId, onBack }: FocusedPickerProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Poll the picker's current order every 2s
  useEffect(() => {
    let cancelled = false;

    async function fetchPickerOrder() {
      try {
        // Fetch all orders and find ones assigned to this picker that are active
        const res = await fetch('/api/orders');
        if (!res.ok || cancelled) return;
        const orders: Order[] = await res.json();
        // Find the first order that is picking or pending
        const active = orders.find(
          (o) => o.status === 'picking' || o.status === 'pending',
        ) ?? null;
        if (!cancelled) { setOrder(active); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPickerOrder();
    const interval = setInterval(fetchPickerOrder, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pickerId]);

  // Find the next unpicked line
  const nextLine  = order?.lines.find((l) => l.status !== 'picked') ?? null;
  const picked    = order?.lines.filter((l) => l.status === 'picked').length ?? 0;
  const total     = order?.lines.length ?? 0;
  const pct       = total > 0 ? Math.round((picked / total) * 100) : 0;
  const allPicked = total > 0 && picked === total;

  return (
    <div className="flex flex-col h-full bg-[#0f1117]">
      {/* Focus header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[#2d3142] bg-[#12151f]">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#94a3b8] hover:text-[#e2e8f0] text-sm font-medium transition-colors"
        >
          ← Back
        </button>
        <span className="text-[#2d3142]">|</span>
        <span className="text-[#e2e8f0] font-semibold text-sm">{pickerId}</span>
        {order && (
          <>
            <span className="text-[#2d3142]">|</span>
            <span className="text-[#94a3b8] text-sm font-mono">{order.reference}</span>
            <span className="text-[#57606a] text-xs truncate max-w-[120px]">{order.customer}</span>
          </>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8 overflow-auto">

        {loading && (
          <div className="text-[#57606a] text-sm">Loading order…</div>
        )}

        {!loading && !order && (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#1a1d27] border border-[#2d3142] flex items-center justify-center text-[#57606a] text-xl">○</div>
            <div className="text-[#94a3b8] text-sm">No active order for {pickerId}</div>
            <div className="text-[#57606a] text-xs">Waiting for an order to be assigned…</div>
          </div>
        )}

        {!loading && order && allPicked && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-5xl">✅</div>
            <div className="text-[#22c55e] font-bold text-xl">All items picked!</div>
            <div className="text-[#94a3b8] text-sm">{order.reference} — ready to pack</div>
          </div>
        )}

        {!loading && order && !allPicked && nextLine && (
          <>
            {/* DM code — large enough to scan from ~30cm screen distance */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="rounded-xl overflow-hidden border-4 border-[#be95ff]/30"
                style={{
                  padding: '10px',
                  background: '#fff',
                  display: 'inline-block',
                  boxShadow: '0 0 0 1px rgba(190,149,255,0.1)',
                }}
                dangerouslySetInnerHTML={{ __html: dmSvg(nextLine.product_barcode, 240) }}
              />
              <span className="text-[#57606a] text-xs tracking-wide uppercase">
                Point phone camera here to scan
              </span>
            </div>

            {/* Item details */}
            <div className="flex flex-col items-center gap-1 text-center max-w-xs">
              <span className="text-[#e2e8f0] text-xl font-bold">
                {nextLine.product_description ?? nextLine.product_barcode}
              </span>
              <span className="text-[#94a3b8] text-sm font-mono">{nextLine.product_barcode}</span>
              {nextLine.staging_code && (
                <span className="mt-1 px-3 py-1 rounded-full text-xs font-bold bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
                  Zone: {nextLine.staging_code}
                </span>
              )}
            </div>

            {/* Progress */}
            <div className="w-full max-w-xs flex flex-col gap-2">
              <div className="flex justify-between text-xs text-[#57606a]">
                <span>{picked} picked</span>
                <span>{total - picked} remaining</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#2d3142] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: pct === 100 ? '#22c55e' : pct > 0 ? '#be95ff' : '#2d3142',
                  }}
                />
              </div>
              <div className="text-center text-xs text-[#57606a]">
                {order.reference} · {total} items total
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main supervisor view ───────────────────────────────────────────────────────

export function SupervisorView({ auth }: Props) {
  const { states, connected } = useSupervisorSocket();
  const [pickers, setPickers] = useState<PickerInfo[]>([]);
  const [focusedPickerId, setFocusedPickerId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPickers() {
      try {
        const res = await fetch('/api/pickers');
        if (!res.ok) return;
        const data = (await res.json()) as PickerInfo[];
        setPickers(data);
      } catch { /* ignore */ }
    }
    fetchPickers();
    const interval = setInterval(fetchPickers, 10_000);
    return () => clearInterval(interval);
  }, []);

  function statusBadge(pickerId: string, pickerInfo?: PickerInfo) {
    const hasState = !!states[pickerId];
    const isOnline = pickerInfo?.status === 'online' || hasState;
    return isOnline ? 'bg-[#0a2d14] text-[#22c55e]' : 'bg-[#2d3142] text-[#94a3b8]';
  }

  function statusLabel(pickerId: string, pickerInfo?: PickerInfo) {
    const hasState = !!states[pickerId];
    return pickerInfo?.status === 'online' || hasState ? 'online' : 'offline';
  }

  const allPickerIds = Array.from(
    new Set([...pickers.map((p) => p.picker_id), ...Object.keys(states)]),
  );

  // ── Focused mode ─────────────────────────────────────────────────────────────
  if (focusedPickerId) {
    return (
      <div style={{ height: '100%' }}>
        <FocusedPickerView
          pickerId={focusedPickerId}
          onBack={() => setFocusedPickerId(null)}
        />
      </div>
    );
  }

  // ── Grid mode ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <DemoControls auth={auth} />
      <ScanStrip />

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
              const info         = pickers.find((p) => p.picker_id === pickerId);
              const pickerState  = states[pickerId];
              const detections   = pickerState?.detections   ?? [];
              const stagingRegions = pickerState?.staging_regions ?? [];
              const badgeClasses = statusBadge(pickerId, info);
              const label        = statusLabel(pickerId, info);

              return (
                <div
                  key={pickerId}
                  className="rounded-xl border border-[#2d3142] bg-[#1a1d27] overflow-hidden flex flex-col"
                >
                  {/* Tile header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d3142]">
                    <span className="text-[#e2e8f0] font-semibold text-sm">{pickerId}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeClasses}`}>
                        {label}
                      </span>
                      <button
                        onClick={() => setFocusedPickerId(pickerId)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#be95ff]/10 text-[#be95ff] border border-[#be95ff]/20 hover:bg-[#be95ff]/20 transition-all"
                      >
                        Focus
                      </button>
                    </div>
                  </div>

                  {/* Video panel */}
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
    </div>
  );
}
