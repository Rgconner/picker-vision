/**
 * MobilePickList — compact pick list optimised for a phone screen.
 *
 * Shows all orders with their lines.  Pending lines are highlighted,
 * picked lines are struck through.  Confirm Packed CTA is shown inline
 * when all items are picked and visible in staging.
 */

import React from 'react';
import type { Order, PickerState } from './types';

interface Props {
  orders:               Order[];
  orderCompletePending: PickerState['order_complete_pending'] | undefined;
  onConfirmPacked:      (orderId: string) => void;
}

function stagingBadge(code: string, label: string | null) {
  return (
    <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
      {code}{label ? ` ${label}` : ''}
    </span>
  );
}

function statusDot(status: string) {
  const colours: Record<string, string> = {
    pending:  'bg-[#94a3b8]',
    picking:  'bg-[#eab308]',
    complete: 'bg-[#22c55e]',
    packed:   'bg-[#06b6d4]',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colours[status] ?? 'bg-[#94a3b8]'}`} />;
}

export function MobilePickList({ orders, orderCompletePending, onConfirmPacked }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[#57606a] text-sm">
        No active orders
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-2">
      {orders.map((order) => {
        const isPending = orderCompletePending?.order_id === order.id;
        const pickedCount = order.lines.filter((l) => l.status === 'picked').length;
        const totalCount  = order.lines.length;

        return (
          <div
            key={order.id}
            className={`rounded-xl border ${isPending ? 'border-[#22c55e]' : 'border-[#2d3142]'} bg-[#1a1d27] overflow-hidden`}
          >
            {/* Order header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2d3142]">
              {statusDot(order.status)}
              <span className="font-semibold text-[#e2e8f0] text-sm flex-1 truncate">
                {order.reference}
              </span>
              <span className="text-[#57606a] text-xs truncate max-w-[100px]">{order.customer}</span>
              <span className="text-xs font-mono text-[#94a3b8] ml-1 shrink-0">
                {pickedCount}/{totalCount}
              </span>
            </div>

            {/* Lines */}
            <div className="divide-y divide-[#1e2130]">
              {order.lines.map((line) => {
                const picked    = line.status === 'picked';
                const remaining = line.quantity - line.quantity_picked;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-2 px-3 py-2 ${picked ? 'opacity-40' : ''}`}
                  >
                    <span className={`flex-1 text-sm ${picked ? 'line-through text-[#57606a]' : 'text-[#e2e8f0]'}`}>
                      {line.product_description ?? line.product_barcode}
                    </span>
                    <span className={`text-xs tabular-nums shrink-0 ${picked ? 'text-[#57606a]' : 'text-[#e2e8f0]'}`}>
                      ×{remaining}
                    </span>
                    {stagingBadge(line.staging_code, line.staging_label)}
                  </div>
                );
              })}
            </div>

            {/* Confirm packed CTA */}
            {isPending && (
              <button
                onClick={() => onConfirmPacked(order.id)}
                className="w-full py-3 px-3 bg-[#22c55e] text-black font-bold text-sm flex items-center justify-center gap-2 pulse-green"
              >
                ✅ All items picked — Confirm Packed?
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
