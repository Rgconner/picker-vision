/**
 * PackWizard — step-based Pack & Verify overlay for Bob's Tiny Treasures.
 *
 * Flow:
 *   Step 1 — Overview: show number of totes, ask operator to place them.
 *   Step 2 — Per-tote header: show delivery zone, item summary.
 *   Step 3 — Per-layer: list items for this layer, offer Verify / Skip.
 *   Final  — All totes sealed → "Order packed" confirmation.
 *
 * The wizard is triggered externally by passing `orderId`.
 * It calls POST /orders/{id}/pack (idempotent), then drives
 * PATCH /orders/{id}/totes/{tote_id}/layers/{layer_id} for each layer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrderTote, PackPlan, ToteLayer } from './types';
import { qrSvg } from './qrSvg';

// ── API helpers ────────────────────────────────────────────────────────────────

const ORDER_API = (path: string) => `/api${path}`;

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(ORDER_API(path), {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => r.statusText);
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  orderId:    string;
  orderRef:   string;
  onClose:    () => void;
  onPacked:   () => void;  // called when order reaches 'packed'
}

type WizardStep =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'overview'; plan: PackPlan }
  | { kind: 'layer'; plan: PackPlan; toteIdx: number; layerIdx: number }
  | { kind: 'done' };

// ── Sub-components ─────────────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-[#2d3142] bg-[#1a1d27] flex flex-col overflow-hidden"
        style={{ maxHeight: '90dvh' }}
      >
        {children}
      </div>
    </div>
  );
}

function WizardHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-[#2d3142]">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[#f59e0b] font-bold text-base">{title}</span>
        </div>
        {subtitle && <p className="text-[#94a3b8] text-xs mt-0.5">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-[#57606a] hover:text-[#e2e8f0] text-lg leading-none mt-0.5"
        title="Close"
      >
        ✕
      </button>
    </div>
  );
}

function LayerItemRow({ name, qty }: { name: string; qty: number }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-[#0f1117] border border-[#2d3142]">
      <span className="w-7 h-7 shrink-0 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/40 flex items-center justify-center text-[#f59e0b] text-xs font-bold">
        ×{qty}
      </span>
      <span className="text-[#e2e8f0] text-sm flex-1">{name}</span>
    </div>
  );
}

function ToteProgressDots({ totes, activeToteIdx }: { totes: OrderTote[]; activeToteIdx: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {totes.map((tote, idx) => (
        <span
          key={tote.id}
          className={`w-2.5 h-2.5 rounded-full transition-all ${
            tote.status === 'sealed'
              ? 'bg-[#22c55e]'
              : idx === activeToteIdx
                ? 'bg-[#f59e0b]'
                : 'bg-[#2d3142]'
          }`}
          title={`Tote ${idx + 1}`}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PackWizard({ orderId, orderRef, onClose, onPacked }: Props) {
  const [step, setStep] = useState<WizardStep>({ kind: 'loading' });
  const [verifying, setVerifying] = useState(false);

  // ── Load/create pack plan ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function initPlan() {
      try {
        const plan = await apiFetch<PackPlan>(`/orders/${orderId}/pack`, { method: 'POST' });
        if (cancelled) return;
        const allSealed = plan.totes.every((t) => t.status === 'sealed');
        if (allSealed) {
          setStep({ kind: 'done' });
        } else {
          setStep({ kind: 'overview', plan });
        }
      } catch (e) {
        if (!cancelled) setStep({ kind: 'error', message: String(e) });
      }
    }
    initPlan();
    return () => { cancelled = true; };
  }, [orderId]);

  // ── Advance to first pending layer across all totes ──────────────────────────
  const advanceFromOverview = useCallback((plan: PackPlan) => {
    for (let ti = 0; ti < plan.totes.length; ti++) {
      const tote = plan.totes[ti];
      for (let li = 0; li < tote.layers.length; li++) {
        if (tote.layers[li].status === 'pending') {
          setStep({ kind: 'layer', plan, toteIdx: ti, layerIdx: li });
          return;
        }
      }
    }
    // All done
    setStep({ kind: 'done' });
  }, []);

  // ── Verify or skip a layer ────────────────────────────────────────────────────
  const handleVerifyLayer = useCallback(async (
    plan:    PackPlan,
    toteIdx: number,
    layerIdx: number,
    status:  'verified' | 'skipped',
  ) => {
    const tote  = plan.totes[toteIdx];
    const layer = tote.layers[layerIdx];
    setVerifying(true);
    try {
      const updated = await apiFetch<PackPlan>(
        `/orders/${orderId}/totes/${tote.id}/layers/${layer.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, verification_method: 'none' }),
        },
      );

      const allSealed = updated.totes.every((t) => t.status === 'sealed');
      if (allSealed) {
        setStep({ kind: 'done' });
        onPacked();
        return;
      }

      // Advance to the next pending layer
      let found = false;
      outer: for (let ti = 0; ti < updated.totes.length; ti++) {
        for (let li = 0; li < updated.totes[ti].layers.length; li++) {
          if (updated.totes[ti].layers[li].status === 'pending') {
            setStep({ kind: 'layer', plan: updated, toteIdx: ti, layerIdx: li });
            found = true;
            break outer;
          }
        }
      }
      if (!found) {
        setStep({ kind: 'done' });
        onPacked();
      }
    } catch (e) {
      setStep({ kind: 'error', message: String(e) });
    } finally {
      setVerifying(false);
    }
  }, [orderId, onPacked]);

  // ── Build item display name map from assignments (line_id → product name) ────
  // The pack-plan only carries line_ids; we piggyback on the already-fetched plan
  // since ToteLineAssignment doesn't embed product description directly.
  // For display, we use the assignment's line_id but the plan already groups them
  // by layer so we just show qty × "Item N" as a fallback if description absent.
  // (A richer version could fetch /orders/{id} for product descriptions.)

  // Derive the display items for the current layer from the plan
  const currentLayerDisplay = useMemo(() => {
    if (step.kind !== 'layer') return null;
    const tote  = step.plan.totes[step.toteIdx];
    const layer = tote.layers[step.layerIdx];
    // Group assignments by line_id
    const grouped = new Map<string, number>();
    for (const a of layer.assignments) {
      grouped.set(a.line_id, (grouped.get(a.line_id) ?? 0) + a.quantity_in_tote);
    }
    return { tote, layer, grouped };
  }, [step]);

  // ── Render ────────────────────────────────────────────────────────────────────

  if (step.kind === 'loading') {
    return (
      <Overlay>
        <div className="p-8 text-center text-[#94a3b8] text-sm">
          Calculating pack plan…
        </div>
      </Overlay>
    );
  }

  if (step.kind === 'error') {
    return (
      <Overlay>
        <WizardHeader title="Pack Wizard" onClose={onClose} />
        <div className="p-5 text-center">
          <p className="text-[#ef4444] text-sm mb-4">{step.message}</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#2d3142] text-[#e2e8f0] text-sm">
            Close
          </button>
        </div>
      </Overlay>
    );
  }

  if (step.kind === 'done') {
    return (
      <Overlay>
        <div className="p-8 flex flex-col items-center gap-4 text-center">
          <span className="text-4xl">✅</span>
          <p className="text-[#22c55e] font-bold text-lg">Order Packed!</p>
          <p className="text-[#94a3b8] text-sm">{orderRef} — all totes verified and sealed.</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-[#22c55e] text-black font-bold text-sm"
          >
            Done
          </button>
        </div>
      </Overlay>
    );
  }

  if (step.kind === 'overview') {
    const { plan } = step;
    const totalItems = plan.totes.reduce((sum, t) =>
      sum + t.layers.reduce((ls, l) => ls + l.assignments.reduce((as, a) => as + a.quantity_in_tote, 0), 0), 0);

    return (
      <Overlay>
        <WizardHeader
          title={`📦 Pack Order — ${orderRef}`}
          subtitle="Place labelled totes in the packing area, then tap Ready."
          onClose={onClose}
        />
        <div className="p-5 flex flex-col gap-4">
          <div className="rounded-xl bg-[#0f1117] border border-[#2d3142] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[#94a3b8] text-sm">Totes required</span>
              <span className="text-[#f59e0b] font-bold text-lg">{plan.totes.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#94a3b8] text-sm">Total items</span>
              <span className="text-[#e2e8f0] font-semibold">{totalItems}</span>
            </div>
            <div className="border-t border-[#2d3142] pt-3 flex flex-col gap-1.5">
              {plan.totes.map((tote) => (
                <div key={tote.id} className="flex items-center gap-2 text-xs text-[#94a3b8]">
                  <span className="font-mono text-[#f59e0b]">Tote {tote.tote_seq}</span>
                  <span>·</span>
                  <span>{Math.round(tote.assigned_weight_kg * 1000)} g</span>
                  {tote.staging_code && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{tote.staging_code}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => advanceFromOverview(plan)}
            className="w-full py-3 rounded-xl bg-[#f59e0b] text-black font-bold text-sm"
          >
            Ready — Start Packing
          </button>
        </div>
      </Overlay>
    );
  }

  // ── Layer verification step ───────────────────────────────────────────────────
  if (step.kind === 'layer' && currentLayerDisplay) {
    const { tote, layer, grouped } = currentLayerDisplay;
    const { plan, toteIdx, layerIdx } = step;
    const totalLayers = tote.layers.length;
    const isFinalTote = toteIdx === plan.totes.length - 1;
    const isFinalLayer = layerIdx === totalLayers - 1;

    return (
      <Overlay>
        <WizardHeader
          title={`Tote ${tote.tote_seq} of ${plan.totes.length}`}
          subtitle={
            tote.staging_code
              ? `Delivery zone: ${tote.staging_code}`
              : undefined
          }
          onClose={onClose}
        />

        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
          {/* Tote progress dots */}
          <div className="flex items-center justify-between">
            <ToteProgressDots totes={plan.totes} activeToteIdx={toteIdx} />
            <span className="text-[#57606a] text-xs">
              Layer {layer.layer_seq} of {totalLayers}
            </span>
          </div>

          {/* Delivery zone QR — scan this to confirm drop-off destination */}
          {tote.staging_code && (
            <div className="flex items-center gap-4 rounded-xl bg-[#0f1117] border border-[#2d3142] p-3">
              <div
                className="rounded overflow-hidden shrink-0"
                style={{ background: '#fff', padding: '4px', display: 'inline-block' }}
                dangerouslySetInnerHTML={{ __html: qrSvg(`STAGING:${tote.staging_code}`, 80) }}
              />
              <div>
                <p className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-0.5">
                  Delivery zone — scan to confirm
                </p>
                <p className="text-[#f59e0b] font-bold font-mono text-sm">
                  STAGING:{tote.staging_code}
                </p>
                <p className="text-[#57606a] text-xs mt-0.5">
                  Point your phone at this QR to confirm the drop-off location
                </p>
              </div>
            </div>
          )}

          {/* Layer instruction */}
          <div>
            <p className="text-[#e2e8f0] font-semibold text-sm mb-3">
              Place these items in the tote:
            </p>
            <div className="flex flex-col gap-2">
              {Array.from(grouped.entries()).map(([lineId, qty]) => (
                <LayerItemRow
                  key={lineId}
                  name={`Line item (${lineId.slice(0, 8)}…)`}
                  qty={qty}
                />
              ))}
            </div>
          </div>

          {/* Layer progress bar within tote */}
          <div className="flex gap-1">
            {tote.layers.map((l, idx) => (
              <div
                key={l.id}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  l.status === 'verified' || l.status === 'skipped'
                    ? 'bg-[#22c55e]'
                    : idx === layerIdx
                      ? 'bg-[#f59e0b]'
                      : 'bg-[#2d3142]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 p-5 pt-0 flex flex-col gap-2">
          <button
            disabled={verifying}
            onClick={() => handleVerifyLayer(plan, toteIdx, layerIdx, 'verified')}
            className="w-full py-3 rounded-xl bg-[#22c55e] text-black font-bold text-sm disabled:opacity-50"
          >
            {verifying ? 'Verifying…' : `✅ Layer ${layer.layer_seq} Verified`}
          </button>
          <button
            disabled={verifying}
            onClick={() => handleVerifyLayer(plan, toteIdx, layerIdx, 'skipped')}
            className="w-full py-2.5 rounded-xl bg-[#2d3142] text-[#94a3b8] text-sm disabled:opacity-50"
          >
            Skip layer
          </button>
          {isFinalLayer && !isFinalTote && (
            <p className="text-center text-[#57606a] text-xs mt-1">
              Next: Tote {plan.totes[toteIdx + 1].tote_seq} after this layer
            </p>
          )}
        </div>
      </Overlay>
    );
  }

  return null;
}
