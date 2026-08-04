/**
 * MobilePickList — live pick list for the mobile picker view.
 *
 * Connects order lines to the real-time enriched detection state so the
 * picker sees immediately which items are in-frame and whether they are
 * correct or unexpected.
 *
 * Features:
 *  - Active order always floats to the top; complete orders sink to bottom
 *  - Per-order progress bar (picked / total)
 *  - Per-line live status dot driven by server-enriched detections:
 *      ● amber  — barcode is currently in-frame (active detection)
 *      ● green  — confirmed correct by event-processor
 *      ● red    — unexpected (wrong item scanned against this order)
 *      ● grey   — pending (not yet seen)
 *      ✓ muted  — already picked (collapsed row)
 *  - Picked lines collapse to a single compact row so attention stays on
 *    what is still outstanding
 *  - Confirm Packed CTA pulses green when all lines are picked
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { Detection, Order, PickerState } from './types';
import { PackWizard } from './PackWizard';

interface Props {
  orders:               Order[];
  detections:           Detection[];
  orderCompletePending: PickerState['order_complete_pending'] | undefined;
  onConfirmPacked:      (orderId: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a lookup: barcode → most-significant live detection */
function buildDetectionMap(detections: Detection[]): Map<string, Detection> {
  const map = new Map<string, Detection>();
  for (const det of detections) {
    if (det.type !== 'product') continue;
    const existing = map.get(det.value);
    // Prefer active > correct > unexpected > null; within same priority keep first
    if (!existing || (!existing.active && det.active)) {
      map.set(det.value, det);
    }
  }
  return map;
}

/** Order sort weight: in-progress first, then pending, then complete/packed */
function orderWeight(order: Order): number {
  if (order.status === 'picking') return 0;
  if (order.status === 'pending') return 1;
  return 2;
}

function stagingBadge(code: string, label: string | null) {
  return (
    <span className="shrink-0 text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
      {code}{label ? ` · ${label}` : ''}
    </span>
  );
}

/** Colour + label for a live detection status */
function detectionStyle(det: Detection | undefined): {
  dot: string;
  ring: string;
  label: string;
} | null {
  if (!det) return null;
  if (det.active)                   return { dot: 'bg-[#eab308]', ring: 'ring-[#eab308]/30', label: 'In frame' };
  if (det.status === 'correct')     return { dot: 'bg-[#22c55e]', ring: 'ring-[#22c55e]/30', label: 'Correct'  };
  if (det.status === 'unexpected')  return { dot: 'bg-[#ef4444]', ring: 'ring-[#ef4444]/30', label: 'Wrong item' };
  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ picked, total }: { picked: number; total: number }) {
  const pct = total > 0 ? Math.round((picked / total) * 100) : 0;
  const colour = pct === 100 ? '#22c55e' : pct > 0 ? '#06b6d4' : '#2d3142';
  return (
    <div className="h-1 w-full rounded-full bg-[#2d3142] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, background: colour }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MobilePickList({ orders, detections, orderCompletePending, onConfirmPacked }: Props) {
  const detMap = useMemo(() => buildDetectionMap(detections), [detections]);
  // {orderId, orderRef} for the order currently being packed (may be complete/absent from orders[])
  const [packingTarget, setPackingTarget] = useState<{ orderId: string; orderRef: string } | null>(null);

  // Auto-open PackWizard when WS signals order_complete_pending and the order
  // has already been filtered out of orders[] (status=complete)
  const prevCompleteRef = React.useRef<string | null>(null);
  useEffect(() => {
    const completePendingId = orderCompletePending?.order_id;
    if (!completePendingId) return;
    if (prevCompleteRef.current === completePendingId) return; // already handled
    prevCompleteRef.current = completePendingId;
    // Only auto-open if not already packing this order
    setPackingTarget((prev) => {
      if (prev?.orderId === completePendingId) return prev;
      // Find ref from current orders list if present; fall back to 'Order'
      const ref = orders.find((o) => o.id === completePendingId)?.reference ?? 'Order';
      return { orderId: completePendingId, orderRef: ref };
    });
  }, [orderCompletePending]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(
    () => [...orders].sort((a, b) => orderWeight(a) - orderWeight(b)),
    [orders],
  );

  return (
    <>
    {packingTarget && (
      <PackWizard
        orderId={packingTarget.orderId}
        orderRef={packingTarget.orderRef}
        onClose={() => setPackingTarget(null)}
        onPacked={() => setPackingTarget(null)}
      />
    )}
    <div className="flex flex-col gap-3 px-2 py-3">
      {sorted.length === 0 && (
        <div className="flex items-center justify-center py-10 text-[#57606a] text-base">
          No active orders
        </div>
      )}
      {sorted.map((order) => {
        const isPending    = orderCompletePending?.order_id === order.id;
        const pickedLines  = order.lines.filter((l) => l.status === 'picked');
        const pendingLines = order.lines.filter((l) => l.status !== 'picked');
        const pickedCount  = pickedLines.length;
        const totalCount   = order.lines.length;
        const allPicked    = pickedCount === totalCount && totalCount > 0;
        const isComplete   = order.status === 'complete' || order.status === 'packed';

        return (
          <div
            key={order.id}
            className={`rounded-2xl border overflow-hidden transition-all ${
              isPending
                ? 'border-[#22c55e] shadow-[0_0_0_1px_rgba(34,197,94,0.2)]'
                : isComplete
                  ? 'border-[#2d3142] opacity-60'
                  : 'border-[#2d3142]'
            } bg-[#1a1d27]`}
          >
            {/* ── Order header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2d3142]">
              {/* Status dot — larger for visibility */}
              <span className={`shrink-0 w-3 h-3 rounded-full ${
                allPicked    ? 'bg-[#22c55e]' :
                order.status === 'picking' ? 'bg-[#eab308]' :
                isComplete   ? 'bg-[#06b6d4]' :
                'bg-[#94a3b8]'
              }`} />
              <span className="font-bold text-[#e2e8f0] text-base flex-1 truncate min-w-0">
                {order.reference}
              </span>
              <span className="text-[#57606a] text-sm shrink-0 truncate max-w-[90px]">
                {order.customer}
              </span>
              <span className="text-sm font-mono font-semibold text-[#94a3b8] shrink-0 ml-1">
                {pickedCount}/{totalCount}
              </span>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-2 pb-1.5">
              <ProgressBar picked={pickedCount} total={totalCount} />
            </div>

            {/* ── Pending lines — glove-sized rows ── */}
            {pendingLines.length > 0 && (
              <div className="divide-y divide-[#1e2130]">
                {pendingLines.map((line) => {
                  const det   = detMap.get(line.product_barcode);
                  const style = detectionStyle(det);

                  return (
                    <div
                      key={line.id}
                      className={`flex items-center gap-3 px-4 py-4 transition-all ${
                        style ? `ring-inset ring-2 ${style.ring}` : ''
                      } ${line.status === 'error' ? 'bg-[#2d0a0a]' : ''}`}
                    >
                      {/* Live detection dot */}
                      <span className={`shrink-0 w-3.5 h-3.5 rounded-full border-2 ${
                        style
                          ? `${style.dot} border-transparent`
                          : 'border-[#2d3142] bg-transparent'
                      }`} />

                      {/* Product name — large readable text */}
                      <span className="flex-1 min-w-0 text-base font-semibold text-[#e2e8f0] leading-snug">
                        {line.product_description ?? line.product_barcode}
                      </span>

                      {/* Qty remaining */}
                      <span className="shrink-0 text-base tabular-nums font-bold text-[#e2e8f0]">
                        ×{line.quantity - line.quantity_picked}
                      </span>

                      {stagingBadge(line.staging_code, line.staging_label)}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Picked lines (collapsed) ── */}
            {pickedLines.length > 0 && (
              <div className="px-4 py-2 border-t border-[#1e2130] flex flex-wrap gap-2">
                {pickedLines.map((line) => (
                  <span
                    key={line.id}
                    className="text-sm text-[#57606a] line-through truncate max-w-[140px]"
                    title={line.product_description ?? line.product_barcode}
                  >
                    ✓ {line.product_description ?? line.product_barcode}
                  </span>
                ))}
              </div>
            )}

            {/* ── Pack CTA — glove-sized ── */}
            {(order.status === 'complete' || order.status === 'packing') && (
              <button
                onClick={() => setPackingTarget({ orderId: order.id, orderRef: order.reference })}
                className="w-full py-5 px-4 bg-[#f59e0b] text-black font-bold text-lg flex items-center justify-center gap-2"
              >
                📦  Pack Order
              </button>
            )}
            {/* ── Legacy confirm-packed CTA (non-BTT) ── */}
            {isPending && order.status !== 'complete' && order.status !== 'packing' && (
              <button
                onClick={() => onConfirmPacked(order.id)}
                className="w-full py-5 px-4 bg-[#22c55e] text-black font-bold text-lg flex items-center justify-center gap-2"
              >
                ✅  All picked — Confirm Packed
              </button>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
