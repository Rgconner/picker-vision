/**
 * ConfirmOverlay — full-screen "place item in tray" gate shown after a
 * correct scan, before the pick is written to the server.
 *
 * Glove-first: confirm button is full-width, 96px tall, text-2xl.
 * Skip is a full-width secondary button — still large enough to tap with gloves.
 *
 * web-demo:      large amber Confirm button
 * physical-demo: instruction text, waits for NAV:CONFIRM scan (no button)
 *                Falls back to showing a button after 10 s if no nav scan.
 */

import React, { useEffect, useState } from 'react';

interface Props {
  scenario:        'web-demo' | 'physical-demo';
  itemName:        string;
  barcode:         string;
  stagingCode:     string | null;
  onConfirm:       () => void;
  onSkip:          () => void;
  /** QOL-024: how many of this item have been picked so far (0-based) */
  quantityPicked?: number;
  /** QOL-024: total quantity required for this line */
  quantity?:       number;
}

export function ConfirmOverlay({
  scenario, itemName, barcode, stagingCode, onConfirm, onSkip,
  quantityPicked = 0, quantity = 1,
}: Props) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (scenario !== 'physical-demo') return;
    const t = setTimeout(() => setShowFallback(true), 10_000);
    return () => clearTimeout(t);
  }, [scenario]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6"
      style={{ background: 'rgba(10,12,20,0.97)' }}
    >
      {/* Item identity */}
      <div className="flex flex-col items-center gap-3 text-center w-full max-w-sm">
        <span className="text-[#57606a] text-sm font-semibold uppercase tracking-widest">
          Place in tray
        </span>
        <span className="text-[#e2e8f0] text-3xl font-bold leading-tight">
          {itemName}
        </span>
        <span className="text-[#94a3b8] text-base font-mono">{barcode}</span>

        {stagingCode && (
          <span className="mt-1 px-5 py-2 rounded-2xl text-base font-bold bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
            → {stagingCode}
          </span>
        )}

        {/* QOL-024: multi-qty counter */}
        {quantity > 1 && quantityPicked + 1 < quantity && (
          <span className="mt-2 text-[#f1c21b] text-2xl font-bold text-center">
            {quantityPicked + 1} of {quantity} — scan again after confirming
          </span>
        )}
        {quantity > 1 && quantityPicked + 1 >= quantity && (
          <span className="mt-2 text-[#22c55e] text-2xl font-bold text-center">
            {quantity} of {quantity} — last one!
          </span>
        )}
      </div>

      {/* Confirm mechanism */}
      <div className="w-full max-w-sm flex flex-col gap-4">
        {scenario === 'web-demo' ? (
          <button
            onClick={onConfirm}
            className="w-full py-6 rounded-3xl text-2xl font-bold text-[#161616] transition-all active:scale-95"
            style={{ background: '#f1c21b' }}
          >
            ✓  Confirm
          </button>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
            <div
              className="w-24 h-24 rounded-3xl border-4 border-[#f1c21b]/40 flex items-center justify-center"
              style={{ background: 'rgba(241,194,27,0.08)' }}
            >
              <span className="text-5xl">⬛</span>
            </div>
            <span className="text-[#f1c21b] text-lg font-semibold">
              Scan NAV:CONFIRM corner of nav card
            </span>
            {showFallback && (
              <button
                onClick={onConfirm}
                className="w-full py-6 rounded-3xl text-2xl font-bold text-[#161616] transition-all active:scale-95"
                style={{ background: '#f1c21b' }}
              >
                ✓  Confirm
              </button>
            )}
          </div>
        )}

        {/* Skip — large enough for gloves, clearly secondary */}
        <button
          onClick={onSkip}
          className="w-full py-4 rounded-2xl text-base font-semibold text-[#57606a] border border-[#2d3142] active:brightness-125 transition-all"
          style={{ background: 'rgba(45,49,66,0.4)' }}
        >
          Skip this item
        </button>
      </div>
    </div>
  );
}
