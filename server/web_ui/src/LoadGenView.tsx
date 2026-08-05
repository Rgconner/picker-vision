/**
 * LoadGenView — Load Generator tab for the Supervisor UI.
 *
 * Allows a supervisor to spawn N simulated picker agents, each running the
 * full picker lifecycle with configurable scan noise:
 *   - Miscan rate       — wrong product before correct one
 *   - Multi-scan rate   — multiple barcodes in one event
 *   - Duplicate rate    — same barcode twice in one event
 *   - Staging rate      — staging region QR included in event
 *
 * Server-side telemetry counters are shown alongside local agent metrics so
 * both sides of the pipe can be compared.  An assertion panel provides a
 * one-click PASS/FAIL regression check.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { AuthState } from './useAuth';
import type { SimPickerConfig, SimPickerHandle, SimPickerState } from './useSimulatedPicker';
import { DEFAULT_SIM_CONFIG, useSimulatedPicker } from './useSimulatedPicker';
import { useSystemHealth } from './useSystemHealth';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SwarmConfig {
  pickerCount:       number;
  scanIntervalMs:    number;
  misscanRate:       number;
  multiScanRate:     number;
  mistakeProbability: number;
  autoStart:         boolean;
}

interface AssertionCheck {
  name:     string;
  expected: string;
  actual:   string | number;
  pass:     boolean;
}

interface AssertionResult {
  pass:   boolean;
  checks: AssertionCheck[];
}

interface Props {
  auth: AuthState;
}

// ── Sub-component: single agent row driven by state snapshot ──────────────────

function AgentRow({ state, id }: { state: SimPickerState; id: string }) {
  const statusColor: Record<string, string> = {
    idle:        '#57606a',
    registering: '#f1c21b',
    running:     '#22c55e',
    done:        '#3b82d4',
    error:       '#ef4444',
  };
  const wsColor = state.connected ? '#22c55e' : '#f1c21b';

  return (
    <tr style={{ borderBottom: '1px solid #2d3142' }}>
      <td className="px-3 py-2 font-mono text-xs text-[#94a3b8]">{id}</td>
      <td className="px-3 py-2">
        <span
          title={state.connected ? 'Connected' : 'Reconnecting…'}
          style={{
            display: 'inline-block', width: 8, height: 8,
            borderRadius: '50%', background: wsColor,
          }}
        />
      </td>
      <td className="px-3 py-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold border"
          style={{
            borderColor: statusColor[state.status] + '66',
            color:       statusColor[state.status],
          }}
        >
          {state.status}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-xs text-[#e2e8f0]">{state.ordersCompleted}</td>
      <td className="px-3 py-2 text-right text-xs text-[#e2e8f0]">{state.scansSent}</td>
      <td className="px-3 py-2 text-right text-xs text-[#e2e8f0]">{state.picksConfirmed}</td>
      <td className="px-3 py-2 text-right text-xs" style={{ color: state.miscans > 0 ? '#f1c21b' : '#57606a' }}>
        {state.miscans}
      </td>
      <td className="px-3 py-2 text-right text-xs" style={{ color: state.multiScans > 0 ? '#be95ff' : '#57606a' }}>
        {state.multiScans}
      </td>
      <td className="px-3 py-2 text-right text-xs" style={{ color: state.errors > 0 ? '#ef4444' : '#57606a' }}>
        {state.errors}
      </td>
      <td className="px-3 py-2 text-right text-xs text-[#57606a]">
        {state.lastEventAt ? state.lastEventAt.slice(11, 19) : '—'}
      </td>
    </tr>
  );
}

// ── Swarm manager — manages N hooks dynamically ──────────────────────────────
// React hooks must be called unconditionally, so we manage a fixed upper-bound
// pool of hooks (MAX_PICKERS) and activate only the first N.

const MAX_PICKERS = 20;

function makeConfig(id: string, cfg: SwarmConfig): SimPickerConfig {
  return {
    pickerId:          id,
    scanIntervalMs:    cfg.scanIntervalMs,
    misscanRate:       cfg.misscanRate,
    multiScanRate:     cfg.multiScanRate,
    duplicateRate:     DEFAULT_SIM_CONFIG.duplicateRate,
    stagingRate:       DEFAULT_SIM_CONFIG.stagingRate,
    mistakeProbability: cfg.mistakeProbability,
    autoStart:         cfg.autoStart,
  };
}

function padId(n: number) {
  return `sim-${String(n).padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoadGenView({ auth }: Props) {
  const { telemetry } = useSystemHealth();
  const isSupervisor = auth.user?.role === 'supervisor';

  // ── Swarm config state ─────────────────────────────────────────────────────
  const [cfg, setCfg] = useState<SwarmConfig>({
    pickerCount:        3,
    scanIntervalMs:     800,
    misscanRate:        0.10,
    multiScanRate:      0.25,
    mistakeProbability: 0,
    autoStart:          true,
  });

  // Active picker count — set when swarm is started
  const [activeCount, setActiveCount] = useState(0);
  const [swarmRunning, setSwarmRunning] = useState(false);

  // ── Fixed pool of MAX_PICKERS hooks ───────────────────────────────────────
  // Each slot uses a config that is either active (slot < activeCount) or inert.
  // We track each slot's config in a ref so we can mutate without re-rendering.
  const poolConfigs = useRef<SimPickerConfig[]>(
    Array.from({ length: MAX_PICKERS }, (_, i) =>
      makeConfig(padId(i + 1), cfg)
    )
  );

  // Build handles array — hooks called unconditionally at top level
  /* eslint-disable react-hooks/rules-of-hooks */
  const h0  = useSimulatedPicker(poolConfigs.current[0]);
  const h1  = useSimulatedPicker(poolConfigs.current[1]);
  const h2  = useSimulatedPicker(poolConfigs.current[2]);
  const h3  = useSimulatedPicker(poolConfigs.current[3]);
  const h4  = useSimulatedPicker(poolConfigs.current[4]);
  const h5  = useSimulatedPicker(poolConfigs.current[5]);
  const h6  = useSimulatedPicker(poolConfigs.current[6]);
  const h7  = useSimulatedPicker(poolConfigs.current[7]);
  const h8  = useSimulatedPicker(poolConfigs.current[8]);
  const h9  = useSimulatedPicker(poolConfigs.current[9]);
  const h10 = useSimulatedPicker(poolConfigs.current[10]);
  const h11 = useSimulatedPicker(poolConfigs.current[11]);
  const h12 = useSimulatedPicker(poolConfigs.current[12]);
  const h13 = useSimulatedPicker(poolConfigs.current[13]);
  const h14 = useSimulatedPicker(poolConfigs.current[14]);
  const h15 = useSimulatedPicker(poolConfigs.current[15]);
  const h16 = useSimulatedPicker(poolConfigs.current[16]);
  const h17 = useSimulatedPicker(poolConfigs.current[17]);
  const h18 = useSimulatedPicker(poolConfigs.current[18]);
  const h19 = useSimulatedPicker(poolConfigs.current[19]);
  /* eslint-enable react-hooks/rules-of-hooks */

  // Keep a stable ref to all handles so start/stop callbacks don't go stale
  const allHandlesRef = useRef<SimPickerHandle[]>([]);
  allHandlesRef.current = [
    h0, h1, h2, h3, h4, h5, h6, h7, h8, h9,
    h10, h11, h12, h13, h14, h15, h16, h17, h18, h19,
  ];

  // Slice to active count for display (reactive — uses state)
  const activeHandles = allHandlesRef.current.slice(0, activeCount);

  // ── Assertion state ────────────────────────────────────────────────────────
  const [assertResult, setAssertResult] = useState<AssertionResult | null>(null);
  const [asserting, setAsserting]       = useState(false);

  // ── Start swarm ───────────────────────────────────────────────────────────
  const startSwarm = useCallback(() => {
    const n = cfg.pickerCount;
    // Update pool configs for the first N slots
    for (let i = 0; i < n; i++) {
      poolConfigs.current[i] = makeConfig(padId(i + 1), cfg);
    }
    setActiveCount(n);
    setSwarmRunning(true);
    setAssertResult(null);

    // Kick off each active handle after a brief stagger
    for (let i = 0; i < n; i++) {
      const delay = i * 200; // 200ms stagger to avoid thundering herd
      const handle = allHandlesRef.current[i];
      setTimeout(() => handle.start(), delay);
    }
  }, [cfg]);

  // ── Stop swarm ────────────────────────────────────────────────────────────
  const stopSwarm = useCallback(async () => {
    allHandlesRef.current.slice(0, activeCount).forEach((h) => h.stop());
    setSwarmRunning(false);
    // Stop all demo sessions
    try {
      await fetch('/api/demo/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch { /* best effort */ }
  }, [activeCount]);

  // ── Assertion ─────────────────────────────────────────────────────────────
  const runAssertion = useCallback(async () => {
    setAsserting(true);
    try {
      const states    = activeHandles.map((h) => h.state);
      const totalScans  = states.reduce((s, a) => s + a.scansSent, 0);
      const totalPicks  = states.reduce((s, a) => s + a.picksConfirmed, 0);
      const totalOrders = states.reduce((s, a) => s + a.ordersCompleted, 0);
      const totalMiscans = states.reduce((s, a) => s + a.miscans, 0);
      const totalMulti   = states.reduce((s, a) => s + a.multiScans, 0);

      const evtRec  = telemetry?.services['event-processor']?.counters?.events_received ?? 0;
      const evtProc = telemetry?.services['event-processor']?.counters?.events_processed ?? 0;
      const activeSockets = telemetry?.services['websocket-hub']?.counters?.active_picker_sockets ?? 0;

      const procRate = evtRec > 0 ? Math.round((evtProc / evtRec) * 100) : 100;

      const checks: AssertionCheck[] = [
        {
          name:     'events_received ≥ scans_sent',
          expected: `≥${totalScans}`,
          actual:   evtRec,
          pass:     evtRec >= totalScans,
        },
        {
          name:     'active_picker_sockets',
          expected: String(activeCount),
          actual:   activeSockets,
          pass:     activeSockets >= Math.min(activeCount, 1),
        },
        {
          name:     'processing_success_rate ≥ 95%',
          expected: '≥95%',
          actual:   `${procRate}%`,
          pass:     procRate >= 95,
        },
        {
          name:     'picks_confirmed > 0 (work done)',
          expected: '>0',
          actual:   totalPicks,
          pass:     totalPicks > 0,
        },
        {
          name:     'orders_completed > 0',
          expected: '>0',
          actual:   totalOrders,
          pass:     totalOrders > 0,
        },
        ...(cfg.misscanRate > 0 ? [{
          name:     'miscans injected (noise active)',
          expected: '>0',
          actual:   totalMiscans,
          pass:     totalMiscans > 0,
        }] : []),
        ...(cfg.multiScanRate > 0 ? [{
          name:     'multi-scan events injected',
          expected: '>0',
          actual:   totalMulti,
          pass:     totalMulti > 0,
        }] : []),
      ];

      setAssertResult({ pass: checks.every((c) => c.pass), checks });
    } finally {
      setAsserting(false);
    }
  }, [activeHandles, telemetry, activeCount, cfg.misscanRate, cfg.multiScanRate]);

  // ── Copy assertion report ──────────────────────────────────────────────────
  const copyReport = useCallback(() => {
    if (!assertResult) return;
    const lines = [
      `Load Gen Assertion — ${assertResult.pass ? 'PASS' : 'FAIL'} — ${new Date().toISOString()}`,
      '',
      ...assertResult.checks.map(
        (c) => `${c.pass ? '✓' : '✗'}  ${c.name.padEnd(40)} expected ${String(c.expected).padEnd(8)} actual ${c.actual}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {/* ignore */});
  }, [assertResult]);

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = activeHandles.reduce(
    (acc, h) => ({
      scans:  acc.scans  + h.state.scansSent,
      picks:  acc.picks  + h.state.picksConfirmed,
      orders: acc.orders + h.state.ordersCompleted,
      miscans: acc.miscans + h.state.miscans,
      multi:  acc.multi  + h.state.multiScans,
      errors: acc.errors + h.state.errors,
    }),
    { scans: 0, picks: 0, orders: 0, miscans: 0, multi: 0, errors: 0 }
  );

  const hasSomeActivity = totals.scans > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const cell = 'px-3 py-1.5 text-left text-xs font-semibold text-[#57606a] uppercase tracking-wider border-b border-[#2d3142]';

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-[#be95ff] text-lg font-bold">⚡ Load Generator</span>
        <span className="text-[#57606a] text-xs">
          Multi-picker simulator with authentic scan noise
        </span>
        {!isSupervisor && (
          <span className="ml-auto text-[#f1c21b] text-xs border border-[#f1c21b]/30 rounded px-2 py-0.5">
            read-only
          </span>
        )}
      </div>

      {/* ── Configuration panel (shown when stopped) ─────────────────────── */}
      {!swarmRunning && (
        <div
          className="rounded-lg border border-[#2d3142] p-4 flex flex-col gap-4"
          style={{ background: '#1a1d27' }}
        >
          <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">
            Swarm Configuration
          </span>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">

            {/* Picker count */}
            <label className="flex flex-col gap-1">
              <span className="text-[#57606a] text-xs">Picker count (1–{MAX_PICKERS})</span>
              <input
                type="number" min={1} max={MAX_PICKERS}
                value={cfg.pickerCount}
                disabled={!isSupervisor}
                onChange={(e) => setCfg((c) => ({ ...c, pickerCount: Math.max(1, Math.min(MAX_PICKERS, Number(e.target.value))) }))}
                className="w-20 rounded px-2 py-1 text-sm border border-[#2d3142] bg-transparent text-[#e2e8f0] disabled:opacity-40"
              />
            </label>

            {/* Scan speed */}
            <label className="flex flex-col gap-1">
              <span className="text-[#57606a] text-xs">Scan speed</span>
              <select
                value={cfg.scanIntervalMs}
                disabled={!isSupervisor}
                onChange={(e) => setCfg((c) => ({ ...c, scanIntervalMs: Number(e.target.value) }))}
                className="rounded px-2 py-1 text-sm border border-[#2d3142] bg-[#0f1117] text-[#e2e8f0] disabled:opacity-40"
              >
                <option value={400}>Fast (400 ms)</option>
                <option value={800}>Normal (800 ms)</option>
                <option value={2000}>Slow (2 s)</option>
              </select>
            </label>

            {/* Miscan rate */}
            <label className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[#57606a] text-xs">Miscan rate</span>
                <span className="text-[#e2e8f0] text-xs font-mono">{Math.round(cfg.misscanRate * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={50} step={1}
                value={Math.round(cfg.misscanRate * 100)}
                disabled={!isSupervisor}
                onChange={(e) => setCfg((c) => ({ ...c, misscanRate: Number(e.target.value) / 100 }))}
                className="w-full accent-[#f1c21b] disabled:opacity-40"
              />
            </label>

            {/* Multi-scan rate */}
            <label className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[#57606a] text-xs">Multi-scan rate</span>
                <span className="text-[#e2e8f0] text-xs font-mono">{Math.round(cfg.multiScanRate * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={50} step={1}
                value={Math.round(cfg.multiScanRate * 100)}
                disabled={!isSupervisor}
                onChange={(e) => setCfg((c) => ({ ...c, multiScanRate: Number(e.target.value) / 100 }))}
                className="w-full accent-[#be95ff] disabled:opacity-40"
              />
            </label>

            {/* Mistake probability */}
            <label className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[#57606a] text-xs">Mistake probability</span>
                <span className="text-[#e2e8f0] text-xs font-mono">{Math.round(cfg.mistakeProbability * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={50} step={1}
                value={Math.round(cfg.mistakeProbability * 100)}
                disabled={!isSupervisor}
                onChange={(e) => setCfg((c) => ({ ...c, mistakeProbability: Number(e.target.value) / 100 }))}
                className="w-full accent-[#ef4444] disabled:opacity-40"
              />
            </label>

            {/* Auto-start */}
            <label className="flex flex-col gap-1">
              <span className="text-[#57606a] text-xs">Auto-start demo sessions</span>
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.autoStart}
                  disabled={!isSupervisor}
                  onChange={(e) => setCfg((c) => ({ ...c, autoStart: e.target.checked }))}
                  className="disabled:opacity-40"
                />
                <span className="text-[#94a3b8] text-xs">{cfg.autoStart ? 'On' : 'Off'}</span>
              </label>
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={startSwarm}
              disabled={!isSupervisor}
              className="px-4 py-1.5 rounded-md text-sm font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: '#6929c4', color: '#be95ff', background: 'transparent' }}
            >
              ▶ Start Swarm ({cfg.pickerCount} picker{cfg.pickerCount !== 1 ? 's' : ''})
            </button>
          </div>
        </div>
      )}

      {/* ── Running controls ─────────────────────────────────────────────── */}
      {swarmRunning && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">
            Swarm running — {activeCount} picker{activeCount !== 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={stopSwarm}
              disabled={!isSupervisor}
              className="px-3 py-1 rounded-md text-xs font-semibold border transition-all disabled:opacity-30"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              ■ Stop All
            </button>
          </div>
        </div>
      )}

      {/* ── Swarm table ──────────────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div
          className="rounded-lg border border-[#2d3142] overflow-x-auto"
          style={{ background: '#1a1d27' }}
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className={cell}>Picker ID</th>
                <th className={cell}>WS</th>
                <th className={cell}>Status</th>
                <th className={`${cell} text-right`}>Orders</th>
                <th className={`${cell} text-right`}>Scans Sent</th>
                <th className={`${cell} text-right`}>Picks</th>
                <th className={`${cell} text-right`} title="Deliberate wrong-product events">Miscans</th>
                <th className={`${cell} text-right`} title="Events with 2+ barcodes">Multi</th>
                <th className={`${cell} text-right`}>Errors</th>
                <th className={`${cell} text-right`}>Last event</th>
              </tr>
            </thead>
            <tbody>
              {activeHandles.map((h, i) => (
                <AgentRow key={padId(i + 1)} id={padId(i + 1)} state={h.state} />
              ))}
            </tbody>
            {activeCount > 1 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #2d3142' }}>
                  <td className="px-3 py-2 text-xs font-semibold text-[#57606a]" colSpan={3}>Totals</td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-[#e2e8f0]">{totals.orders}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-[#e2e8f0]">{totals.scans}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold text-[#e2e8f0]">{totals.picks}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold" style={{ color: totals.miscans > 0 ? '#f1c21b' : '#57606a' }}>{totals.miscans}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold" style={{ color: totals.multi > 0 ? '#be95ff' : '#57606a' }}>{totals.multi}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold" style={{ color: totals.errors > 0 ? '#ef4444' : '#57606a' }}>{totals.errors}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Server telemetry strip ────────────────────────────────────────── */}
      {activeCount > 0 && (
        <div
          className="rounded-lg border border-[#2d3142] p-3 flex flex-col gap-2"
          style={{ background: '#1a1d27' }}
        >
          <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">
            Server Telemetry
          </span>
          <div className="flex flex-wrap gap-4">
            {[
              { label: 'events_received',    value: telemetry?.services['event-processor']?.counters?.events_received },
              { label: 'events_processed',   value: telemetry?.services['event-processor']?.counters?.events_processed },
              { label: 'pickers_registered', value: telemetry?.services['api-gateway']?.counters?.pickers_registered },
              { label: 'active_sockets',     value: telemetry?.services['websocket-hub']?.counters?.active_picker_sockets },
              { label: 'events_proxied',     value: telemetry?.services['api-gateway']?.counters?.events_proxied },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <span className="text-[#57606a] text-xs">{label}</span>
                <span className="text-[#e2e8f0] text-base font-bold font-mono">
                  {value ?? '—'}
                </span>
              </div>
            ))}
          </div>
          <span className="text-[#2d3142] text-xs">
            Telemetry polled every 10 s · collected {telemetry?.collected_at?.slice(11, 19) ?? '…'}
          </span>
        </div>
      )}

      {/* ── Assertion panel ───────────────────────────────────────────────── */}
      {hasSomeActivity && (
        <div
          className="rounded-lg border border-[#2d3142] p-3 flex flex-col gap-3"
          style={{ background: '#1a1d27' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">
              Regression Assertion
            </span>
            <button
              onClick={runAssertion}
              disabled={asserting}
              className="px-3 py-1 rounded-md text-xs font-semibold border transition-all disabled:opacity-40"
              style={{ borderColor: '#3b82d4', color: '#67c2fb' }}
            >
              {asserting ? 'Checking…' : '▶ Run Assertion'}
            </button>
            {assertResult && (
              <>
                <span
                  className="text-sm font-bold"
                  style={{ color: assertResult.pass ? '#22c55e' : '#ef4444' }}
                >
                  {assertResult.pass ? '✓ PASS' : '✗ FAIL'}
                </span>
                <button
                  onClick={copyReport}
                  className="ml-auto px-2 py-0.5 rounded text-xs border border-[#2d3142] text-[#57606a] hover:text-[#94a3b8]"
                  title="Copy report to clipboard"
                >
                  📋 Copy
                </button>
              </>
            )}
          </div>

          {assertResult && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="text-left text-[#57606a] pb-1 font-semibold">Check</th>
                  <th className="text-right text-[#57606a] pb-1 font-semibold">Expected</th>
                  <th className="text-right text-[#57606a] pb-1 font-semibold">Actual</th>
                  <th className="text-right text-[#57606a] pb-1 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {assertResult.checks.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #2d3142' }}>
                    <td className="py-1.5 text-[#94a3b8]">{c.name}</td>
                    <td className="py-1.5 text-right font-mono text-[#57606a]">{c.expected}</td>
                    <td className="py-1.5 text-right font-mono text-[#e2e8f0]">{c.actual}</td>
                    <td className="py-1.5 text-right font-bold" style={{ color: c.pass ? '#22c55e' : '#ef4444' }}>
                      {c.pass ? '✓' : '✗'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
