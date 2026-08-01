/**
 * ConfirmOverlay — full-screen "place item in tray" gate shown after a
 * correct scan, before the pick is written to the server.
 *
 * web-demo:      large amber Confirm button
 * physical-demo: instruction text, waits for NAV:CONFIRM scan (no button)
 *                Falls back to showing a button after 10 s if no nav scan.
 */

import React, { useEffect, useState } from 'react';

interface Props {
  scenario:       'web-demo' | 'physical-demo';
  itemName:       string;
  barcode:        string;
  stagingCode:    string | null;
  onConfirm:      () => void;
  onSkip:         () => void;
  /** QOL-024: how many of this item have been picked so far (0-based) */
  quantityPicked?: number;
  /** QOL-024: total quantity required for this line */
  quantity?:       number;
}

export function ConfirmOverlay({ scenario, itemName, barcode, stagingCode, onConfirm, onSkip, quantityPicked = 0, quantity = 1 }: Props) {
  // physical-demo fallback: show button after 10 s if no nav card scanned
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
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[#57606a] text-xs font-semibold uppercase tracking-widest">
          Place in tray
        </span>
        <span className="text-[#e2e8f0] text-2xl font-bold leading-tight max-w-xs">
          {itemName}
        </span>
        <span className="text-[#94a3b8] text-sm font-mono">{barcode}</span>
        {stagingCode && (
          <span className="mt-1 px-3 py-1 rounded-full text-xs font-bold bg-[#0a1e2d] text-[#06b6d4] border border-[#06b6d4]/30">
            → {stagingCode}
          </span>
        )}
        {/* QOL-024: multi-qty subtitle */}
        {quantity > 1 && quantityPicked + 1 < quantity && (
          <span className="mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#1a1d27] text-[#f1c21b] border border-[#f1c21b]/30">
            {quantityPicked + 1} of {quantity} — scan again after confirming
          </span>
        )}
        {quantity > 1 && quantityPicked + 1 >= quantity && (
          <span className="mt-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#0a2d14] text-[#22c55e] border border-[#22c55e]/30">
            {quantity} of {quantity} — last one!
          </span>
        )}
      </div>

      {/* Confirm mechanism */}
      {scenario === 'web-demo' ? (
        <button
          onClick={onConfirm}
          className="w-full max-w-xs py-5 rounded-2xl text-xl font-bold text-[#161616] transition-all active:scale-95"
          style={{ background: '#f1c21b' }}
        >
          ✓ Confirm
        </button>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-20 h-20 rounded-2xl border-4 border-[#f1c21b]/40 flex items-center justify-center"
            style={{ background: 'rgba(241,194,27,0.08)' }}
          >
            <span className="text-4xl">⬛</span>
          </div>
          <span className="text-[#f1c21b] text-sm font-semibold">
            Scan NAV:CONFIRM corner of nav card
          </span>
          {showFallback && (
            <button
              onClick={onConfirm}
              className="mt-2 px-6 py-3 rounded-xl text-base font-bold text-[#161616] transition-all active:scale-95"
              style={{ background: '#f1c21b' }}
            >
              ✓ Confirm (button)
            </button>
          )}
        </div>
      )}

      {/* Skip — small, unobtrusive */}
      <button
        onClick={onSkip}
        className="text-[#57606a] text-xs underline underline-offset-2 hover:text-[#94a3b8] transition-colors"
      >
        Skip this item
      </button>
    </div>
  );
}
