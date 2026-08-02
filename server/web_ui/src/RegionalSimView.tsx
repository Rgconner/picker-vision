/**
 * RegionalSimView — 📊 Stores tab for the Supervisor UI.
 *
 * Three panels:
 *   1. RS Control  — preset selector, Generate button, past simulations list
 *   2. Capacity    — per-store ARCH-003 signal panels with Sterling JSON preview
 *   3. Gantt Grid  — rows=stores, columns=time buckets, σ colour-coded cells
 */

import React, { useEffect, useRef, useState } from 'react';
import type { AuthState } from './useAuth';
import type { CapacitySignal, GanttCell, GanttData, RSSummary } from './useRegionalSim';
import { useRegionalSim } from './useRegionalSim';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function sigmaColor(sigma: number, green: number, yellow: number): string {
  if (sigma < green)  return '#22c55e';
  if (sigma < yellow) return '#f1c21b';
  return '#ef4444';
}

function sigmaOpacity(picks: number): number {
  // Normalise pick volume to opacity range [0.25, 1.0]
  return Math.min(1.0, 0.25 + (picks / 60) * 0.75);
}

function bucketLabel(iso: string, granularity: string): string {
  try {
    const d = new Date(iso);
    if (granularity === 'hour') return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
    if (granularity === 'week') return `Wk ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.75 ? '#22c55e' : score >= 0.5 ? '#f1c21b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#2d3142', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 13, minWidth: 34 }}>{(score).toFixed(2)}</span>
    </div>
  );
}

function CapacityPanel({ signal }: { signal: CapacitySignal }) {
  const [showJson, setShowJson] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const jsonStr = JSON.stringify(signal, null, 2);

  function copyJson() {
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const borderColor = signal.accept_new ? '#22c55e' : '#ef4444';

  return (
    <div style={{
      background: '#1a1d27',
      border: `1px solid ${borderColor}33`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 8,
      padding: '14px 16px',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>
          {signal.store_id}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 12, padding: '2px 10px',
          background: signal.accept_new ? '#22c55e22' : '#ef444422',
          color:      signal.accept_new ? '#22c55e'   : '#ef4444',
          border:     `1px solid ${signal.accept_new ? '#22c55e44' : '#ef444444'}`,
        }}>
          {signal.accept_new ? '✓ Accept new' : '✗ At capacity'}
        </span>
      </div>

      <ScoreBar score={signal.capacity_score} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10, fontSize: 12 }}>
        <div>
          <div style={{ color: '#57606a' }}>Pickers active</div>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{signal.pickers_active}</div>
        </div>
        <div>
          <div style={{ color: '#57606a' }}>Avg pick time</div>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{signal.avg_pick_time_min.toFixed(1)} min</div>
        </div>
        <div>
          <div style={{ color: '#57606a' }}>Carrier cutoff</div>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{signal.next_carrier_cutoff}</div>
        </div>
        <div>
          <div style={{ color: '#57606a' }}>Est. clear</div>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{signal.estimated_clear_time}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={() => setShowJson(v => !v)}
          style={{
            background: '#2d3142', border: '1px solid #3d4255', borderRadius: 6,
            color: '#94a3b8', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
          }}
        >
          {'{ } Sterling JSON'}
        </button>
        <button
          onClick={copyJson}
          style={{
            background: '#2d3142', border: '1px solid #3d4255', borderRadius: 6,
            color: copied ? '#22c55e' : '#94a3b8', fontSize: 11, padding: '3px 10px', cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>

      {showJson && (
        <pre style={{
          marginTop: 10, padding: 10, background: '#0f1117',
          borderRadius: 6, fontSize: 11, color: '#94a3b8',
          overflowX: 'auto', maxHeight: 200,
        }}>
          {jsonStr}
        </pre>
      )}
    </div>
  );
}

function GanttGrid({
  gantt,
  granularity,
  sigmaThresholds,
}: {
  gantt: GanttData;
  granularity: string;
  sigmaThresholds: { green: number; yellow: number };
}) {
  const { stores, buckets, cells, std_dev_thresholds: defaults } = gantt;
  const green  = sigmaThresholds.green  ?? defaults.green;
  const yellow = sigmaThresholds.yellow ?? defaults.yellow;

  // Limit displayed buckets for readability (max 30 columns)
  const displayBuckets = buckets.slice(0, 30);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 10px', color: '#57606a', fontWeight: 600, minWidth: 90 }}>
              Store
            </th>
            {displayBuckets.map((b) => (
              <th key={b} style={{ padding: '4px 3px', color: '#57606a', fontWeight: 500, minWidth: 44, textAlign: 'center' }}>
                {bucketLabel(b, granularity)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.store_id}>
              <td style={{ padding: '4px 10px', color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {s.store_id}
                <span style={{ color: '#57606a', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{s.name}</span>
              </td>
              {displayBuckets.map((b) => {
                const key = `${s.store_id}:${b}`;
                const cell: GanttCell | undefined = cells[key];
                if (!cell) {
                  return (
                    <td key={b} style={{ padding: '2px 3px', textAlign: 'center' }}>
                      <div style={{ width: 38, height: 22, background: '#1a1d27', borderRadius: 3 }} />
                    </td>
                  );
                }
                const color   = sigmaColor(cell.deviation_sigma, green, yellow);
                const opacity = sigmaOpacity(cell.actual_picks);
                const title   = `actual: ${cell.actual_picks} picks  predicted: ${cell.predicted_picks} picks  deviation: ${cell.deviation_sigma.toFixed(2)}σ`;
                return (
                  <td key={b} style={{ padding: '2px 3px', textAlign: 'center' }} title={title}>
                    <div style={{
                      width: 38, height: 22, borderRadius: 3,
                      background: color,
                      opacity,
                    }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────

interface Props {
  auth: AuthState;
}

export function RegionalSimView({ auth: _auth }: Props) {
  const {
    simList, loading, error,
    capacity, gantt,
    fetchList, generateSim, fetchCapacity, fetchGantt, deleteSim,
  } = useRegionalSim();

  // Panel 1 — generation controls
  const [preset,       setPreset]       = useState<string>('simple');
  const [months,       setMonths]       = useState<number>(3);
  const [generating,   setGenerating]   = useState(false);
  const [genResult,    setGenResult]    = useState<string | null>(null);

  // Panel 2/3 — selected RS
  const [activeRsId, setActiveRsId]   = useState<string | null>(null);

  // Panel 3 — Gantt controls
  const [granularity,  setGranularity]  = useState<string>('day');
  const [startDate,    setStartDate]    = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate,      setEndDate]      = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Sigma threshold controls
  const [sigmaGreen,   setSigmaGreen]   = useState(1.0);
  const [sigmaYellow,  setSigmaYellow]  = useState(2.0);

  // Load list on mount
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchList();
    }
  }, [fetchList]);

  // When activeRsId changes, fetch capacity + gantt
  useEffect(() => {
    if (!activeRsId) return;
    fetchCapacity(activeRsId);
    fetchGantt(activeRsId, granularity, startDate, endDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRsId]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    const result = await generateSim(preset, months);
    setGenerating(false);
    if (result) {
      setGenResult(`${result.rs_id} generated — ${result.pick_count.toLocaleString()} events in ${result.elapsed_sec}s`);
      setActiveRsId(result.rs_id);
    }
  }

  function handleApplyGantt() {
    if (!activeRsId) return;
    fetchGantt(activeRsId, granularity, startDate, endDate);
  }

  function handleView(rsId: string) {
    setActiveRsId(rsId);
    fetchCapacity(rsId);
    fetchGantt(rsId, granularity, startDate, endDate);
  }

  async function handleDelete(rsId: string) {
    if (!confirm(`Delete simulation ${rsId}? This cannot be undone.`)) return;
    await deleteSim(rsId);
    if (activeRsId === rsId) setActiveRsId(null);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const panel: React.CSSProperties = {
    background: '#1a1d27',
    border: '1px solid #2d3142',
    borderRadius: 10,
    padding: '18px 20px',
    marginBottom: 16,
  };

  const label: React.CSSProperties = {
    fontSize: 12, color: '#57606a', marginBottom: 4, display: 'block',
  };

  const select: React.CSSProperties = {
    background: '#0f1117', border: '1px solid #3d4255', borderRadius: 6,
    color: '#e2e8f0', padding: '5px 10px', fontSize: 13,
  };

  const btnPrimary: React.CSSProperties = {
    background: '#3b82d4', border: 'none', borderRadius: 7,
    color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 20px', cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    background: '#2d3142', border: '1px solid #3d4255', borderRadius: 6,
    color: '#94a3b8', fontSize: 12, padding: '4px 12px', cursor: 'pointer',
  };

  const btnDanger: React.CSSProperties = {
    background: 'transparent', border: '1px solid #ef444433', borderRadius: 6,
    color: '#ef4444', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 14,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif' }}>

      {/* ── Panel 1: RS Control ───────────────────────────────────────────── */}
      <div style={panel}>
        <div style={sectionTitle}>Generate New Simulation</div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <label style={label}>Preset</label>
            <select style={select} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="simple">Simple (3 stores)</option>
              <option value="busy">Busy (5 stores, high variance)</option>
              <option value="edge">Edge Case (overwhelmed vs. spare)</option>
            </select>
          </div>
          <div>
            <label style={label}>History</label>
            <select style={select} value={months} onChange={e => setMonths(Number(e.target.value))}>
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>
          <button
            style={{ ...btnPrimary, opacity: generating ? 0.6 : 1 }}
            disabled={generating}
            onClick={handleGenerate}
          >
            {generating ? '⏳ Generating…' : '▶ Generate'}
          </button>
          <button style={btnSecondary} onClick={fetchList} disabled={loading}>
            ⟳ Refresh
          </button>
        </div>

        {genResult && (
          <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 10 }}>✓ {genResult}</div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 10 }}>⚠ {error}</div>
        )}

        {/* Past simulations table */}
        {simList.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: 16 }}>Past Simulations</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#57606a', borderBottom: '1px solid #2d3142' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>ID</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Preset</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Months</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Date range (historical ←)</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px' }}>Generated</th>
                  <th style={{ padding: '4px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {simList.map((s: RSSummary) => {
                  // Range is months×30 days back from generated_at date
                  const genD = new Date(s.generated_at);
                  const startD = new Date(genD);
                  startD.setDate(startD.getDate() - s.months * 30);
                  const rangeFmt = `${startD.toLocaleDateString()} → ${genD.toLocaleDateString()}`;
                  return (
                  <tr
                    key={s.rs_id}
                    style={{
                      borderBottom: '1px solid #1a1d27',
                      background: activeRsId === s.rs_id ? '#2d314233' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '5px 8px', fontWeight: 700, color: '#e2e8f0' }}>{s.rs_id}</td>
                    <td style={{ padding: '5px 8px', color: '#94a3b8' }}>{s.preset}</td>
                    <td style={{ padding: '5px 8px', color: '#94a3b8' }}>{s.months}</td>
                    <td style={{ padding: '5px 8px', color: '#3b82d4', fontVariantNumeric: 'tabular-nums' }}>{rangeFmt}</td>
                    <td style={{ padding: '5px 8px', color: '#57606a' }}>{fmtDate(s.generated_at)}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                      <button style={{ ...btnSecondary, marginRight: 6 }} onClick={() => handleView(s.rs_id)}>
                        View
                      </button>
                      <button style={btnDanger} onClick={() => handleDelete(s.rs_id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {!loading && simList.length === 0 && (
          <div style={{ color: '#57606a', fontSize: 12, marginTop: 8 }}>
            No simulations yet — generate one above.
          </div>
        )}
      </div>

      {/* ── Panel 2: Capacity Signals ─────────────────────────────────────── */}
      {activeRsId && capacity.length > 0 && (
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={sectionTitle}>
              Capacity Signals — {activeRsId}
            </div>
            <button style={btnSecondary} onClick={() => fetchCapacity(activeRsId)}>
              ⟳ Refresh
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
            {capacity.map((sig: CapacitySignal) => (
              <CapacityPanel key={sig.store_id} signal={sig} />
            ))}
          </div>
        </div>
      )}

      {/* ── Panel 3: Gantt Grid ───────────────────────────────────────────── */}
      {activeRsId && (
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={sectionTitle}>Gantt — {activeRsId}</div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <label style={label}>Granularity</label>
              <select style={select} value={granularity} onChange={e => setGranularity(e.target.value)}>
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
            </div>
            <div>
              <label style={label}>Start</label>
              <input
                type="date"
                style={{ ...select }}
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={label}>End</label>
              <input
                type="date"
                style={{ ...select }}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            <button style={btnPrimary} onClick={handleApplyGantt}>Apply</button>
          </div>

          {/* σ thresholds */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontSize: 12, color: '#57606a' }}>
            <span>σ thresholds:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#22c55e' }}>■</span> Green &lt;
              <input
                type="number" min={0.1} max={5} step={0.1}
                value={sigmaGreen}
                onChange={e => setSigmaGreen(Number(e.target.value))}
                style={{ ...select, width: 60, padding: '2px 6px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#f1c21b' }}>■</span> Yellow &lt;
              <input
                type="number" min={0.1} max={10} step={0.1}
                value={sigmaYellow}
                onChange={e => setSigmaYellow(Number(e.target.value))}
                style={{ ...select, width: 60, padding: '2px 6px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#ef4444' }}>■</span> Red ≥ {sigmaYellow.toFixed(1)}
            </label>
            <span style={{ marginLeft: 8, color: '#3d4255' }}>|</span>
            <span>Darker = more picks · Hover cell for details</span>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 11, alignItems: 'center' }}>
            {[0.3, 0.7, 1.5, 2.5].map((sigma) => (
              <div key={sigma} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: sigmaColor(sigma, sigmaGreen, sigmaYellow),
                  opacity: 0.8,
                }} />
                <span style={{ color: '#57606a' }}>{sigma}σ</span>
              </div>
            ))}
          </div>

          {/* Grid */}
          {gantt ? (
            <GanttGrid
              gantt={gantt}
              granularity={granularity}
              sigmaThresholds={{ green: sigmaGreen, yellow: sigmaYellow }}
            />
          ) : (
            <div style={{ color: '#57606a', fontSize: 12 }}>Loading Gantt data…</div>
          )}
        </div>
      )}

      {/* Empty state when nothing selected */}
      {!activeRsId && simList.length > 0 && (
        <div style={{ color: '#57606a', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
          Select a simulation above to view its capacity signals and Gantt grid.
        </div>
      )}
    </div>
  );
}
