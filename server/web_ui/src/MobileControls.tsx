/**
 * MobileControls — action bar for the mobile picker view.
 *
 * PORTRAIT / fullscreen-HUD mode (onToggleList supplied):
 *   Two large glove-friendly buttons — primary action + list toggle.
 *   Minimum tap target: py-5 (80px+). Text xl minimum.
 *
 * LANDSCAPE mode (no onToggleList):
 *   Full controls rendered inside whatever column/rail the parent provides.
 *   Same glove sizing — py-5 text-xl throughout.
 *
 * Primary button logic (both modes):
 *   scanning        → ■ STOP  (red)
 *   demo session    → ▶ SCAN · Order #N  (purple outline)
 *   no session      → ▶ START DEMO  (purple solid)
 */

import React, { useEffect, useState } from 'react';
import type { ValidationResult } from './types';

interface DemoSession {
  session_id:       string;
  picker_id:        string;
  mode:             string;
  orders_completed: number;
  current_order_id: string | null;
}

interface Props {
  pickerId:          string;
  scanning:          boolean;
  onStartStop:       (scanning: boolean) => void;
  onValidate:        () => void;
  validationResult:  ValidationResult | null;
  onClearValidation: () => void;
  lastScanValue:     string | null;
  connected:         boolean;
  /** Portrait HUD: toggle the pick-list bottom sheet */
  onToggleList?:     () => void;
  /** Portrait HUD: whether the list sheet is currently open */
  listOpen?:         boolean;
  /** Portrait HUD: number of unpicked lines (badge on list button) */
  pendingCount?:     number;
}

export function MobileControls({
  pickerId,
  scanning,
  onStartStop,
  onValidate,
  validationResult,
  onClearValidation,
  lastScanValue,
  connected,
  onToggleList,
  listOpen = false,
  pendingCount = 0,
}: Props) {
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [validateLoading, setValidateLoading] = useState(false);

  useEffect(() => {
    if (!pickerId) return;
    async function fetchDemoStatus() {
      try {
        const res = await fetch('/api/demo/status');
        if (!res.ok) return;
        const sessions: DemoSession[] = await res.json();
        setDemoSession(sessions.find((s) => s.picker_id === pickerId) ?? null);
      } catch { /* ignore */ }
    }
    fetchDemoStatus();
    const interval = setInterval(fetchDemoStatus, 4000);
    return () => clearInterval(interval);
  }, [pickerId]);

  async function handleDemoStart() {
    if (!pickerId) return;
    setDemoLoading(true);
    try {
      await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'personal', picker_id: pickerId }),
      });
      const res = await fetch('/api/demo/status');
      if (res.ok) {
        const sessions: DemoSession[] = await res.json();
        setDemoSession(sessions.find((s) => s.picker_id === pickerId) ?? null);
      }
      onStartStop(true);
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleValidate() {
    setValidateLoading(true);
    try { onValidate(); }
    finally { setTimeout(() => setValidateLoading(false), 800); }
  }

  // ── Shared: primary button state ──────────────────────────────────────────
  let primaryLabel: string;
  let primaryStyle: React.CSSProperties;
  let primaryAction: () => void;
  let primaryDisabled = false;

  if (scanning) {
    primaryLabel   = '■  STOP';
    primaryStyle   = { background: '#ef4444', color: '#fff' };
    primaryAction  = () => onStartStop(false);
  } else if (demoSession) {
    primaryLabel   = demoLoading ? 'Starting…' : `▶  SCAN  ·  Order #${(demoSession.orders_completed ?? 0) + 1}`;
    primaryStyle   = { background: '#12151f', border: '3px solid #6929c4', color: '#be95ff' };
    primaryAction  = () => onStartStop(true);
    primaryDisabled = demoLoading;
  } else {
    primaryLabel   = demoLoading ? 'Starting…' : '▶  START DEMO';
    primaryStyle   = { background: '#6929c4', color: '#fff' };
    primaryAction  = handleDemoStart;
    primaryDisabled = demoLoading || !pickerId;
  }

  // ── Validation modal — layout-agnostic, always rendered as fixed overlay ──
  const validationModal = validationResult ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-[#1a1d27] border border-[#2d3142] rounded-t-3xl p-6 w-full max-w-lg flex flex-col gap-5 pb-10">
        <h2 className="text-[#e2e8f0] font-bold text-2xl">Validation Result</h2>
        {([
          { label: '✅ Correct',    colour: '#22c55e', bg: 'bg-[#0a2d14]', items: validationResult.correct },
          { label: '⚠️ Missing',    colour: '#eab308', bg: 'bg-[#2d1f00]', items: validationResult.missing },
          { label: '❌ Unexpected', colour: '#ef4444', bg: 'bg-[#2d0a0a]', items: validationResult.unexpected },
        ] as const).map(({ label, colour, bg, items }) => (
          <div key={label}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold text-base" style={{ color: colour }}>{label}</span>
              <span className="text-[#94a3b8] text-sm">({items.length})</span>
            </div>
            {items.length === 0
              ? <p className="text-[#57606a] text-sm italic">None</p>
              : <ul className="flex flex-col gap-1.5">
                  {items.map((bc) => (
                    <li key={bc} className={`text-sm font-mono px-3 py-2 rounded-xl ${bg}`} style={{ color: colour }}>{bc}</li>
                  ))}
                </ul>
            }
          </div>
        ))}
        <button
          onClick={onClearValidation}
          className="mt-2 py-5 px-4 rounded-2xl bg-[#2d3142] text-[#e2e8f0] font-bold text-xl active:brightness-90"
        >
          Close
        </button>
      </div>
    </div>
  ) : null;

  // ── PORTRAIT fullscreen-HUD mode ──────────────────────────────────────────
  if (onToggleList !== undefined) {
    return (
      <>
        <div className="flex gap-3 w-full">
          {/* Primary action — full height glove target */}
          <button
            onClick={primaryAction}
            disabled={primaryDisabled}
            className="flex-1 py-5 rounded-2xl font-bold text-xl tracking-wide active:brightness-90 transition-all disabled:opacity-40"
            style={primaryStyle}
          >
            {primaryLabel}
          </button>

          {/* List toggle — square glove target with pending badge */}
          <button
            onClick={onToggleList}
            className="flex flex-col items-center justify-center gap-1 px-6 py-5 rounded-2xl font-bold active:brightness-90 transition-all"
            style={{
              background:   listOpen ? 'rgba(106,41,196,0.3)' : 'rgba(26,29,39,0.95)',
              border:       listOpen ? '3px solid #6929c4'    : '3px solid rgba(45,49,66,0.9)',
              color:        listOpen ? '#be95ff'               : '#94a3b8',
              backdropFilter: 'blur(8px)',
              minWidth: 72,
            }}
          >
            <span className="text-2xl leading-none">≡</span>
            {pendingCount > 0 && (
              <span className="text-sm font-bold tabular-nums" style={{ color: listOpen ? '#be95ff' : '#e2e8f0' }}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>
        {validationModal}
      </>
    );
  }

  // ── LANDSCAPE mode — full controls, glove-sized ───────────────────────────
  const showDemoResume = !scanning && !!demoSession;
  const showDemoStart  = !scanning && !demoSession;

  return (
    <>
      {/* Primary / demo button */}
      {(showDemoStart || showDemoResume || scanning) && (
        <button
          onClick={primaryAction}
          disabled={primaryDisabled}
          className="w-full py-5 rounded-2xl font-bold text-xl tracking-wide active:brightness-90 transition-all disabled:opacity-40 mx-0"
          style={primaryStyle}
        >
          {primaryLabel}
        </button>
      )}

      {/* Last scan strip */}
      {lastScanValue && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-[#1a1d27] border border-[#2d3142] flex items-center gap-2">
          <span className="text-[#a78bfa] text-sm font-mono shrink-0">Last:</span>
          <span className="text-[#e2e8f0] text-sm font-mono font-semibold truncate flex-1">{lastScanValue}</span>
        </div>
      )}

      {/* Validate */}
      <button
        disabled={validateLoading || !connected}
        onClick={handleValidate}
        className="mt-3 w-full py-4 rounded-2xl bg-[#eab308] text-black font-bold text-lg disabled:opacity-40 active:brightness-90 transition-all"
      >
        ✓ Validate
      </button>

      {/* Connection badge */}
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${
          connected ? 'bg-[#0a2d14] text-[#22c55e]' : 'bg-[#2d3142] text-[#94a3b8]'
        }`}>
          {connected ? '● Live' : '○ Reconnecting…'}
        </span>
      </div>

      {validationModal}
    </>
  );
}
