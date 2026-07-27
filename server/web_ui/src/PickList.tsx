import React, { useState } from 'react';
import type { Order, PickerState } from './types';
import { PackWizard } from './PackWizard';

interface Props {
  orders: Order[];
  orderCompletePending: PickerState['order_complete_pending'] | undefined;
  onConfirmPacked: (orderId: string) => void;
}

function orderStatusBadge(status: string): string {
  switch (status) {
    case 'pending': return 'bg-[#2d3142] text-[#94a3b8]';
    case 'picking': return 'bg-[#422d0a] text-[#eab308]';
    case 'complete': return 'bg-[#0a2d14] text-[#22c55e] pulse-green';
    case 'packed': return 'bg-[#0a1c2d] text-[#06b6d4]';
    default: return 'bg-[#2d3142] text-[#94a3b8]';
  }
}

export function PickList({ orders, orderCompletePending, onConfirmPacked }: Props) {
  const [packingOrderId, setPackingOrderId] = useState<string | null>(null);
  const packingOrder = packingOrderId ? orders.find((o) => o.id === packingOrderId) : null;

  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[#94a3b8] text-sm">
        No active orders
      </div>
    );
  }

  return (
    <>
    {packingOrder && (
      <PackWizard
        orderId={packingOrder.id}
        orderRef={packingOrder.reference}
        onClose={() => setPackingOrderId(null)}
        onPacked={() => setPackingOrderId(null)}
      />
    )}
    <div className="flex flex-col gap-3 overflow-y-auto">
      {orders.map((order) => {
        const isPending =
          orderCompletePending && orderCompletePending.order_id === order.id;

        return (
          <div
            key={order.id}
            className="rounded-lg border border-[#2d3142] bg-[#1a1d27] p-3 flex flex-col gap-2"
          >
            {/* Order header */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-[#e2e8f0] text-sm">{order.reference}</span>
                <span className="ml-2 text-[#94a3b8] text-xs">{order.customer}</span>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${orderStatusBadge(order.status)}`}
              >
                {order.status}
              </span>
            </div>

            {/* Order lines */}
            <div className="flex flex-col gap-1">
              {order.lines.map((line) => {
                const isPicked = line.status === 'picked';
                const remaining = line.quantity - line.quantity_picked;
                return (
                  <div
                    key={line.id}
                    className={`flex items-center gap-2 text-sm py-1 px-1 rounded ${
                      isPicked ? 'opacity-40' : ''
                    }`}
                  >
                    <span
                      className={`flex-1 ${isPicked ? 'line-through text-[#94a3b8]' : 'text-[#e2e8f0]'}`}
                    >
                      {line.product_description ?? line.product_barcode}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${isPicked ? 'text-[#94a3b8]' : 'text-[#e2e8f0]'}`}
                    >
                      {remaining}/{line.quantity}
                    </span>
                    <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
                      {line.staging_code}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pack Order button — BTT flow */}
            {(order.status === 'complete' || order.status === 'packing') && (
              <button
                onClick={() => setPackingOrderId(order.id)}
                className="mt-1 w-full py-2 px-3 rounded-lg bg-[#f59e0b] text-black font-bold text-sm flex items-center justify-center gap-2"
              >
                📦 Pack Order
              </button>
            )}
            {/* Confirm Packed CTA — legacy non-BTT flow */}
            {isPending && order.status !== 'complete' && order.status !== 'packing' && (
              <button
                onClick={() => onConfirmPacked(order.id)}
                className="mt-1 w-full py-2 px-3 rounded-lg bg-[#22c55e] text-black font-bold text-sm pulse-green flex items-center justify-center gap-2"
              >
                ✅ All items picked — Confirm Packed?
              </button>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
