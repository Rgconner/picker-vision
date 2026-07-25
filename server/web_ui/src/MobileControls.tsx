/**
 * MobileControls — action bar for the mobile picker view.
 *
 * Mirrors the desktop Controls component but is laid out for thumb reach
 * on a phone screen.  Buttons are full-width and touch-sized.
 *
 * Actions:
 *   Start    — re-register picker and clear local state
 *   Stop     — clear local scan state
 *   Validate — trigger a validation snapshot against current order
 */

import React, { useState } from 'react';
import type { ValidationResult } from './types';

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
  scanning,
  onStartStop,
  onValidate,
  validationResult,
  onClearValidation,
  lastScanValue,
  connected,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleValidate() {
    setLoading(true);
    try { onValidate(); }
    finally { setTimeout(() => setLoading(false), 800); }
  }

  return (
    <>
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
            ▶ Start Scanning
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
