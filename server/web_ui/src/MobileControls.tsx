/**
 * MobileControls — action bar for the mobile picker view.
 *
 * Mirrors the desktop Controls component but is laid out for thumb reach
 * on a phone screen.  Buttons are full-width and touch-sized.
 *
 * Actions:
 *   Start    — re-register picker and clear local state; if no demo loop is
 *              running, also starts one (personal mode) for this picker.
 *   Stop     — clear local scan state
 *   Validate — trigger a validation snapshot against current order
 *
 * Demo button states (shown above the Start/Stop row when not scanning):
 *   No session for this picker → "▶ Start Demo"  → POST /api/demo/start
 *   Session exists, between orders → "↩ Resume"  → re-attaches to current order
 *   Session active + scanning → button hidden (already in flow)
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
  pickerId:         string;
  scanning:         boolean;
  onStartStop:      (scanning: boolean) => void;
  onValidate:       () => void;
  validationResult: ValidationResult | null;
  onClearValidation:() => void;
  lastScanValue:    string | null;
  connected:        boolean;
  /** Tighten padding + font sizes when rendered in the landscape left column */
  compact?:         boolean;
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
  compact = false,
}: Props) {
  const [loading, setLoading]         = useState(false);
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  // Poll demo status for this picker every 4 s
  useEffect(() => {
    if (!pickerId) return;
    async function fetchDemoStatus() {
      try {
        const res = await fetch('/api/demo/status');
        if (!res.ok) return;
        const sessions: DemoSession[] = await res.json();
        const mine = sessions.find((s) => s.picker_id === pickerId) ?? null;
        setDemoSession(mine);
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
      // Start scanning after demo loop is running
      onStartStop(true);
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleDemoResume() {
    // Re-attach by simply starting to scan — the server still has the order
    onStartStop(true);
  }

  async function handleValidate() {
    setLoading(true);
    try { onValidate(); }
    finally { setTimeout(() => setLoading(false), 800); }
  }

  // Demo button state
  const showDemoStart  = !scanning && !demoSession;
  const showDemoResume = !scanning && !!demoSession;

  return (
    <>
      {/* Demo action button — shown when not actively scanning */}
      {(showDemoStart || showDemoResume) && (
        <div className={`px-3 ${compact ? 'mb-1' : 'mb-2'}`}>
          {showDemoStart ? (
            <button
              onClick={handleDemoStart}
              disabled={demoLoading || !pickerId}
              className={`w-full ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} rounded-xl font-bold active:brightness-90 transition-all disabled:opacity-40`}
              style={{ background: '#6929c4', color: '#fff' }}
            >
              {demoLoading ? 'Starting…' : '▶ Start Demo'}
            </button>
          ) : (
            <button
              onClick={handleDemoResume}
              disabled={demoLoading}
              className={`w-full ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} rounded-xl font-bold active:brightness-90 transition-all disabled:opacity-40`}
              style={{ background: '#1a1d27', border: '1px solid #6929c4', color: '#be95ff' }}
            >
              ↩ Resume Demo · Order #{(demoSession?.orders_completed ?? 0) + 1}
            </button>
          )}
        </div>
      )}

      {/* Last scan feedback strip */}
      {lastScanValue && (
        <div className={`mx-3 ${compact ? 'mb-1 px-2 py-1' : 'mb-2 px-3 py-2'} rounded-lg bg-[#1a1d27] border border-[#2d3142] flex items-center gap-2`}>
          <span className="text-[#a78bfa] text-xs font-mono shrink-0">Last:</span>
          <span className="text-[#e2e8f0] text-xs font-mono font-semibold truncate flex-1">
            {lastScanValue}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className={`flex gap-2 px-3 ${compact ? 'pb-1' : 'pb-3'}`}>
        {/* Start / Stop toggle */}
        {scanning ? (
          <button
            onClick={() => onStartStop(false)}
            className={`flex-1 ${compact ? 'py-2' : 'py-3'} rounded-xl bg-[#ef4444] text-white font-bold text-sm active:brightness-90 transition-all`}
          >
            ■ Stop Scanning
          </button>
        ) : (
          <button
            onClick={() => onStartStop(true)}
            className={`flex-1 ${compact ? 'py-2' : 'py-3'} rounded-xl bg-[#22c55e] text-black font-bold text-sm active:brightness-90 transition-all`}
          >
            ▶ Scan Items
          </button>
        )}

        {/* Validate */}
        <button
          disabled={loading || !connected}
          onClick={handleValidate}
          className={`flex-1 ${compact ? 'py-2' : 'py-3'} rounded-xl bg-[#eab308] text-black font-bold text-sm disabled:opacity-40 active:brightness-90 transition-all`}
        >
          ✓ Validate
        </button>
      </div>

      {/* Connection badge */}
      <div className={`px-3 ${compact ? 'pb-1' : 'pb-2'} flex items-center gap-2`}>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          connected ? 'bg-[#0a2d14] text-[#22c55e]' : 'bg-[#2d3142] text-[#94a3b8]'
        }`}>
          {connected ? '● Live' : '○ Reconnecting…'}
        </span>
      </div>

      {/* Validation Result Modal */}
      {validationResult && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
          <div className="bg-[#1a1d27] border border-[#2d3142] rounded-t-2xl p-5 w-full max-w-md flex flex-col gap-4 pb-8">
            <h2 className="text-[#e2e8f0] font-bold text-lg">Validation Result</h2>

            {([
              { label: '✅ Correct',    colour: '#22c55e', bg: 'bg-[#0a2d14]', items: validationResult.correct },
              { label: '⚠️ Missing',    colour: '#eab308', bg: 'bg-[#2d1f00]', items: validationResult.missing },
              { label: '❌ Unexpected', colour: '#ef4444', bg: 'bg-[#2d0a0a]', items: validationResult.unexpected },
            ] as const).map(({ label, colour, bg, items }) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm" style={{ color: colour }}>{label}</span>
                  <span className="text-[#94a3b8] text-xs">({items.length})</span>
                </div>
                {items.length === 0
                  ? <p className="text-[#57606a] text-xs italic">None</p>
                  : <ul className="flex flex-col gap-1">
                      {items.map((bc) => (
                        <li key={bc} className={`text-xs font-mono px-2 py-1 rounded ${bg}`} style={{ color: colour }}>{bc}</li>
                      ))}
                    </ul>
                }
              </div>
            ))}

            <button
              onClick={onClearValidation}
              className="mt-1 py-3 px-4 rounded-xl bg-[#2d3142] text-[#e2e8f0] font-bold text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
