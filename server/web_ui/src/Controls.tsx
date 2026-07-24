import React, { useState } from 'react';
import type { ValidationResult } from './types';

interface Props {
  pickerId: string;
  validationResult: ValidationResult | null;
  onClearValidation: () => void;
}

type Action = 'start' | 'stop' | 'validate';

export function Controls({ pickerId, validationResult, onClearValidation }: Props) {
  const [loading, setLoading] = useState(false);

  async function postAction(action: Action) {
    setLoading(true);
    try {
      await fetch(`/control/${pickerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex gap-3 items-center">
        <button
          disabled={loading}
          onClick={() => postAction('start')}
          className="flex-1 py-2 px-4 rounded-lg bg-[#22c55e] text-black font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          ▶ Start
        </button>
        <button
          disabled={loading}
          onClick={() => postAction('stop')}
          className="flex-1 py-2 px-4 rounded-lg bg-[#ef4444] text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          ■ Stop
        </button>
        <button
          disabled={loading}
          onClick={() => postAction('validate')}
          className="flex-1 py-2 px-4 rounded-lg bg-[#eab308] text-black font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          ✓ Validate
        </button>
      </div>

      {/* Validation Result Modal */}
      {validationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[#1a1d27] border border-[#2d3142] rounded-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4">
            <h2 className="text-[#e2e8f0] font-bold text-lg">Validation Result</h2>

            {/* Correct */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#22c55e] font-semibold text-sm">✅ Correct</span>
                <span className="text-[#94a3b8] text-xs">({validationResult.correct.length})</span>
              </div>
              {validationResult.correct.length === 0 ? (
                <p className="text-[#94a3b8] text-xs italic">None</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {validationResult.correct.map((bc) => (
                    <li key={bc} className="text-[#22c55e] text-xs font-mono bg-[#0a2d14] px-2 py-1 rounded">
                      {bc}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Missing */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#eab308] font-semibold text-sm">⚠️ Missing</span>
                <span className="text-[#94a3b8] text-xs">({validationResult.missing.length})</span>
              </div>
              {validationResult.missing.length === 0 ? (
                <p className="text-[#94a3b8] text-xs italic">None</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {validationResult.missing.map((bc) => (
                    <li key={bc} className="text-[#eab308] text-xs font-mono bg-[#2d1f00] px-2 py-1 rounded">
                      {bc}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Unexpected */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#ef4444] font-semibold text-sm">❌ Unexpected</span>
                <span className="text-[#94a3b8] text-xs">({validationResult.unexpected.length})</span>
              </div>
              {validationResult.unexpected.length === 0 ? (
                <p className="text-[#94a3b8] text-xs italic">None</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {validationResult.unexpected.map((bc) => (
                    <li key={bc} className="text-[#ef4444] text-xs font-mono bg-[#2d0a0a] px-2 py-1 rounded">
                      {bc}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={onClearValidation}
              className="mt-2 py-2 px-4 rounded-lg bg-[#2d3142] text-[#e2e8f0] font-semibold text-sm hover:bg-[#3d4160] transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
