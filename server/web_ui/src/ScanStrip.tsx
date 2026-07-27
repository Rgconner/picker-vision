/**
 * ScanStrip — compact last-5-scans strip for the Supervisor tab.
 *
 * Polls GET /api/scan-log?limit=5 every 3 s and renders a row of outcome
 * badges. Each badge shows: picker initials · barcode (truncated) · colour.
 */

import React, { useEffect, useState } from 'react';
import type { ScanLogEntry } from './types';

function outcomeColour(entry: ScanLogEntry): string {
  if (entry.error) return 'bg-[#2d1a1a] text-[#ef4444]';
  if (entry.barcodes.length === 0) return 'bg-[#2d3142] text-[#57606a]';
  const hasUnexpected = entry.outcomes.some((o) => o.result === 'unexpected');
  const hasUnknown    = entry.outcomes.some((o) => o.result === 'unknown');
  const allCorrect    = entry.outcomes.length > 0 && entry.outcomes.every((o) => o.result === 'correct');
  if (allCorrect)    return 'bg-[#0a2d14] text-[#22c55e]';
  if (hasUnexpected) return 'bg-[#2d1a1a] text-[#ef4444]';
  if (hasUnknown)    return 'bg-[#2d2510] text-[#f59e0b]';
  return 'bg-[#2d3142] text-[#94a3b8]';
}

function outcomeLabel(entry: ScanLogEntry): string {
  if (entry.error)                 return 'error';
  if (entry.barcodes.length === 0) return 'empty';
  const allCorrect = entry.outcomes.length > 0 && entry.outcomes.every((o) => o.result === 'correct');
  if (allCorrect) return 'ok';
  const hasUnexpected = entry.outcomes.some((o) => o.result === 'unexpected');
  if (hasUnexpected) return 'bad';
  return 'partial';
}

function pickerInitials(pickerId: string): string {
  return pickerId
    .split(/[-_\s]+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}

export function ScanStrip() {
  const [entries, setEntries] = useState<ScanLogEntry[]>([]);

  useEffect(() => {
    async function fetchLog() {
      try {
        const res = await fetch('/api/scan-log?limit=5');
        if (res.ok) setEntries(await res.json());
      } catch { /* ignore */ }
    }
    fetchLog();
    const id = setInterval(fetchLog, 3000);
    return () => clearInterval(id);
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2d3142] text-[#57606a] text-xs"
           style={{ background: '#12151f' }}>
        <span className="font-semibold uppercase tracking-wider text-[#2d3142]">Recent Scans</span>
        <span>No scan events yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2d3142] flex-wrap"
         style={{ background: '#12151f' }}>
      <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider shrink-0">
        Recent Scans
      </span>
      {entries.map((entry, i) => {
        const barcode = entry.barcodes[0] ?? '—';
        const trunc   = barcode.length > 10 ? barcode.slice(0, 8) + '…' : barcode;
        const colours = outcomeColour(entry);
        const label   = outcomeLabel(entry);
        return (
          <span
            key={i}
            className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold ${colours}`}
            title={`trace=${entry.trace_id} picker=${entry.picker_id} ${entry.processing_ms}ms${entry.error ? ' error=' + entry.error : ''}`}
          >
            {pickerInitials(entry.picker_id)} · {trunc} · {label}
          </span>
        );
      })}
    </div>
  );
}
