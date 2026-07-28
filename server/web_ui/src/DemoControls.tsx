/**
 * DemoControls — demo loop management panel for the Supervisor view.
 *
 * Shown at the top of SupervisorView. Two states:
 *   Idle    — "No demo running" + Start (Personal) + Start (Presentation) buttons
 *   Running — session info, next-item QR, items remaining, Stop button
 *
 * The next-item QR is a large (200×200 px) scannable code that a phone user can
 * point at directly from a laptop screen — no printed labels required.
 *
 * Guests can see the panel but cannot start/stop (buttons are disabled).
 */

import React, { useEffect, useState } from 'react';
import type { AuthState } from './useAuth';
import { qrSvg } from './qrSvg';

interface DemoSession {
  session_id:          string;
  picker_id:           string;
  mode:                string;
  orders_completed:    number;
  current_order_id:    string | null;
  mistake_probability: number;
}

interface OrderLine {
  id:              string;
  product_barcode: string;
  product_description: string | null;
  quantity:        number;
  quantity_picked: number;
  staging_code:    string;
  status:          string;
}

interface Order {
  id:        string;
  reference: string;
  status:    string;
  lines:     OrderLine[];
}

interface Props {
  auth: AuthState;
}

export function DemoControls({ auth }: Props) {
  const [sessions, setSessions]       = useState<DemoSession[]>([]);
  const [order, setOrder]             = useState<Order | null>(null);
  const [starting, setStarting]       = useState(false);
  const [stopping, setStopping]       = useState(false);

  const isGuest = auth.user?.role === 'guest';
  const isSupervisor = auth.user?.role === 'supervisor';
  const canControl = isSupervisor;  // guests and unauthenticated cannot start/stop

  // Poll demo status every 3 s
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/demo/status');
        if (res.ok) setSessions(await res.json());
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // When a session is active, poll its current order to find the next item
  useEffect(() => {
    const activeSession = sessions[0] ?? null;
    if (!activeSession?.current_order_id) { setOrder(null); return; }

    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${activeSession!.current_order_id}`);
        if (res.ok) setOrder(await res.json());
      } catch { /* ignore */ }
    }
    fetchOrder();
    const interval = setInterval(fetchOrder, 3000);
    return () => clearInterval(interval);
  }, [sessions]);

  async function startPersonal() {
    if (!canControl) return;
    setStarting(true);
    try {
      await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'personal',
          picker_id: auth.user?.name ?? 'demo-supervisor',
        }),
      });
      const res = await fetch('/api/demo/status');
      if (res.ok) setSessions(await res.json());
    } finally {
      setStarting(false);
    }
  }

  async function startPresentation() {
    if (!canControl) return;
    setStarting(true);
    try {
      await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'presentation' }),
      });
      const res = await fetch('/api/demo/status');
      if (res.ok) setSessions(await res.json());
    } finally {
      setStarting(false);
    }
  }

  async function stopSession(sessionId: string) {
    if (!canControl) return;
    setStopping(true);
    try {
      await fetch('/api/demo/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      setSessions([]);
      setOrder(null);
    } finally {
      setStopping(false);
    }
  }

  // Find the next unpicked line across the active order
  const nextLine = order?.lines.find((l) => l.status !== 'picked') ?? null;
  const remainingCount = order?.lines.filter((l) => l.status !== 'picked').length ?? 0;

  const activeSession = sessions[0] ?? null;

  // ── IDLE ──────────────────────────────────────────────────────────────────────
  if (!activeSession) {
    return (
      <div
        className="flex items-center gap-4 px-4 py-3 border-b border-[#2d3142] flex-wrap"
        style={{ background: '#12151f' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#57606a]" />
          <span className="text-[#57606a] text-sm">No demo running</span>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={startPersonal}
            disabled={!canControl || starting}
            title={isGuest ? 'Sign in as supervisor to start a demo' : undefined}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: '#6929c4', color: '#be95ff', background: 'transparent' }}
          >
            {starting ? 'Starting…' : '▶ Start Demo (Personal)'}
          </button>
          <button
            onClick={startPresentation}
            disabled={!canControl || starting}
            title={isGuest ? 'Sign in as supervisor to start a demo' : undefined}
            className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderColor: '#00b4d8', color: '#67e8f9', background: 'transparent' }}
          >
            {starting ? 'Starting…' : '▶ Start Demo (Presentation)'}
          </button>
        </div>
      </div>
    );
  }

  // ── RUNNING ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="border-b border-[#2d3142]"
      style={{ background: '#12151f' }}
    >
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
        <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">
          Demo running
        </span>
        <span className="text-[#57606a] text-xs">
          {activeSession.mode === 'presentation' ? 'Presentation' : `Personal · ${activeSession.picker_id}`}
          {' · '}Order #{activeSession.orders_completed + 1}
          {activeSession.current_order_id && order && (
            <> · <span className="text-[#94a3b8]">{order.reference}</span></>
          )}
        </span>
        {activeSession.mistake_probability > 0 && (
          <span className="text-[#f1c21b] text-xs border border-[#f1c21b]/30 rounded px-1.5 py-0.5">
            ⚠ Mistakes on ({Math.round(activeSession.mistake_probability * 100)}%)
          </span>
        )}
        <button
          onClick={() => stopSession(activeSession.session_id)}
          disabled={!canControl || stopping}
          className="ml-auto px-3 py-1 rounded-md text-xs font-semibold border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {stopping ? 'Stopping…' : '■ Stop Demo'}
        </button>
      </div>

      {/* QR row: next-item barcode + join-demo link */}
      {nextLine ? (
        <div className="flex items-start gap-6 px-4 pb-3 flex-wrap">
          {/* Next item to scan */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="rounded-lg overflow-hidden border-2 border-[#6929c4]/40"
              style={{ padding: '6px', background: '#fff', display: 'inline-block' }}
              dangerouslySetInnerHTML={{ __html: qrSvg(nextLine.product_barcode, 160) }}
            />
            <span className="text-[#57606a] text-xs">Point your phone here →</span>
          </div>
          <div className="flex flex-col gap-1 justify-center">
            <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">
              Next item to scan
            </span>
            <span className="text-[#e2e8f0] text-base font-bold font-mono">
              {nextLine.product_barcode}
            </span>
            {nextLine.product_description && (
              <span className="text-[#94a3b8] text-sm">{nextLine.product_description}</span>
            )}
            <span className="text-[#57606a] text-xs mt-1">
              {remainingCount} item{remainingCount !== 1 ? 's' : ''} remaining in this order
            </span>
            {activeSession.mistake_probability > 0 && (
              <span className="text-[#f1c21b] text-xs mt-1">
                ⚠ This order may contain a deliberate mistake — watch for the error workflow
              </span>
            )}
          </div>

          {/* Join Demo QR — phone scans this to open the mobile view pre-joined */}
          <div className="flex flex-col items-center gap-2 ml-auto">
            {(() => {
              const joinUrl = `/mobile?picker_id=${encodeURIComponent(activeSession.picker_id)}`;
              const fits = joinUrl.length <= 62;
              return fits ? (
                <>
                  <div
                    className="rounded-lg overflow-hidden border-2 border-[#f1c21b]/40"
                    style={{ padding: '6px', background: '#fff', display: 'inline-block' }}
                    dangerouslySetInnerHTML={{ __html: qrSvg(joinUrl, 120) }}
                  />
                  <span className="text-[#f1c21b] text-xs text-center">Scan to join demo<br />on your phone</span>
                </>
              ) : (
                <>
                  <span className="text-[#f1c21b] text-xs font-semibold">Join as picker:</span>
                  <span className="font-mono text-[#e2e8f0] text-xs break-all max-w-[140px]">{activeSession.picker_id}</span>
                  <span className="text-[#57606a] text-xs">(set manually in Mobile tab)</span>
                </>
              );
            })()}
          </div>
        </div>
      ) : order ? (
        <div className="px-4 pb-3 text-[#22c55e] text-sm">
          ✓ All items scanned — order complete, next order loading…
        </div>
      ) : null}
    </div>
  );
}
