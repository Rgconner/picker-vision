/**
 * DemoControls — demo loop management panel for the Supervisor view.
 *
 * Shown at the top of SupervisorView. Two tabs:
 *   Demo     — start/stop personal or presentation demo sessions
 *   Load Gen — start/stop N virtual pickers for stress testing / demo
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

interface Picker {
  picker_id: string;
  status: string;
}

interface LoadGenPickerStat {
  picker_id:        string;
  status:           string;
  orders_completed: number;
  scans_sent:       number;
  picks_confirmed:  number;
  errors:           number;
  current_order_id: string | null;
  uptime_seconds:   number;
}

interface LoadGenStatus {
  running: boolean;
  pickers: LoadGenPickerStat[];
  totals:  { scans_sent: number; picks_confirmed: number; errors: number };
}

interface Props {
  auth: AuthState;
}

export function DemoControls({ auth }: Props) {
  const [activeTab, setActiveTab]         = useState<'demo' | 'loadgen'>('demo');

  // ── Demo tab state ─────────────────────────────────────────────────────────
  const [sessions, setSessions]           = useState<DemoSession[]>([]);
  const [order, setOrder]                 = useState<Order | null>(null);
  const [starting, setStarting]           = useState(false);
  const [stopping, setStopping]           = useState(false);
  const [restarting, setRestarting]       = useState(false);
  const [resetting, setResetting]         = useState(false);
  const [scenario, setScenario]           = useState<'web-demo' | 'physical-demo'>('web-demo');
  const [pickers, setPickers]             = useState<Picker[]>([]);
  const [selectedPicker, setSelectedPicker] = useState<string>('');

  // ── Load Gen tab state ─────────────────────────────────────────────────────
  const [lgPickerCount, setLgPickerCount]         = useState(3);
  const [lgScanInterval, setLgScanInterval]       = useState(800);
  const [lgMistakePct, setLgMistakePct]           = useState(0);
  const [lgStatus, setLgStatus]                   = useState<LoadGenStatus | null>(null);
  const [lgStarting, setLgStarting]               = useState(false);
  const [lgStopping, setLgStopping]               = useState(false);

  const isGuest      = auth.user?.role === 'guest';
  const isSupervisor = auth.user?.role === 'supervisor';
  const canControl   = isSupervisor;

  // Load + persist scenario from workflow-config
  useEffect(() => {
    fetch('/api/workflow-config')
      .then((r) => r.ok ? r.json() : null)
      .then((cfg) => { if (cfg?.demo_scenario) setScenario(cfg.demo_scenario); })
      .catch(() => {});
  }, []);

  async function applyScenario(s: 'web-demo' | 'physical-demo') {
    setScenario(s);
    try {
      await fetch('/api/workflow-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_scenario: s }),
      });
    } catch { /* ignore */ }
  }

  // Poll demo status + pickers every 3 s
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/demo/status');
        if (res.ok) setSessions(await res.json());
      } catch { /* ignore */ }
    }
    async function fetchPickers() {
      try {
        const res = await fetch('/pickers');
        if (res.ok) {
          const list: Picker[] = await res.json();
          setPickers(list);
          setSelectedPicker((prev) => {
            if (prev) return prev;
            const online = list.find((p) => p.status === 'online' && p.picker_id !== auth.user?.name);
            return online?.picker_id ?? list[0]?.picker_id ?? '';
          });
        }
      } catch { /* ignore */ }
    }
    fetchStatus();
    fetchPickers();
    const interval = setInterval(() => { fetchStatus(); fetchPickers(); }, 3000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll load-gen /status every 2 s when the tab is active
  useEffect(() => {
    if (activeTab !== 'loadgen') return;
    async function fetchLgStatus() {
      try {
        const res = await fetch('/api/load-gen/status');
        if (res.ok) setLgStatus(await res.json());
      } catch { /* ignore */ }
    }
    fetchLgStatus();
    const interval = setInterval(fetchLgStatus, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // When a demo session is active, poll its current order
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

  // ── Demo actions ───────────────────────────────────────────────────────────

  async function startPersonal() {
    if (!canControl || !selectedPicker) return;
    setStarting(true);
    try {
      await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'personal', picker_id: selectedPicker }),
      });
      const res = await fetch('/api/demo/status');
      if (res.ok) setSessions(await res.json());
    } finally { setStarting(false); }
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
    } finally { setStarting(false); }
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
    } finally { setStopping(false); }
  }

  async function restartDemo() {
    if (!canControl) return;
    const active = sessions[0];
    if (!active) return;
    setRestarting(true);
    try {
      await fetch('/api/demo/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: active.session_id }),
      });
      const body = active.mode === 'personal'
        ? { mode: 'personal', picker_id: active.picker_id }
        : { mode: 'presentation' };
      await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await fetch('/api/demo/status');
      if (res.ok) setSessions(await res.json());
      setOrder(null);
    } finally { setRestarting(false); }
  }

  // ── Load Gen actions ───────────────────────────────────────────────────────

  async function startLoadGen() {
    if (!canControl) return;
    setLgStarting(true);
    try {
      const res = await fetch('/api/load-gen/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picker_count:        lgPickerCount,
          scan_interval_ms:    lgScanInterval,
          mistake_probability: lgMistakePct / 100,
          orders_per_picker:   0,
          picker_id_prefix:    'vp-',
        }),
      });
      if (res.ok) {
        const statusRes = await fetch('/api/load-gen/status');
        if (statusRes.ok) setLgStatus(await statusRes.json());
      }
    } finally { setLgStarting(false); }
  }

  async function stopLoadGen() {
    if (!canControl) return;
    setLgStopping(true);
    try {
      await fetch('/api/load-gen/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const res = await fetch('/api/load-gen/status');
      if (res.ok) setLgStatus(await res.json());
    } finally { setLgStopping(false); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const nextLine = order?.lines.find((l) => l.status !== 'picked') ?? null;
  const remainingLines = order?.lines
    .map((l) => ({
      desc: l.product_description ?? l.product_barcode,
      qty:  Math.max(0, l.quantity - l.quantity_picked),
    }))
    .filter((l) => l.qty > 0) ?? [];
  const activeSession = sessions[0] ?? null;
  const lgRunning     = lgStatus?.running ?? false;

  // ── Tab bar ────────────────────────────────────────────────────────────────
  return (
    <div className="border-b border-[#2d3142]" style={{ background: '#12151f' }}>
      {/* Tab strip */}
      <div className="flex gap-0 border-b border-[#2d3142]">
        {([
          { id: 'demo',    label: 'Demo',     dot: activeSession != null },
          { id: 'loadgen', label: '⚡ Load Gen', dot: lgRunning },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2 text-xs font-semibold transition-colors relative"
            style={{
              color:        activeTab === t.id ? '#e2e8f0' : '#57606a',
              borderBottom: activeTab === t.id ? '2px solid #6929c4' : '2px solid transparent',
              background:   'transparent',
            }}
          >
            {t.label}
            {t.dot && (
              <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e] align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* ── DEMO TAB ──────────────────────────────────────────────────────── */}
      {activeTab === 'demo' && !activeSession && (
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Scenario selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#57606a] text-xs font-semibold uppercase tracking-wider">Demo scenario</span>
            {([
              { id: 'web-demo',      label: 'Web Demo',     desc: 'On-screen ✓ button', color: '#be95ff', border: '#6929c4' },
              { id: 'physical-demo', label: 'Physical Demo', desc: 'Nav card scan',       color: '#f1c21b', border: '#a07800' },
            ] as const).map((s) => (
              <button
                key={s.id}
                onClick={() => canControl && applyScenario(s.id)}
                disabled={!canControl}
                title={isGuest ? 'Sign in as supervisor to change scenario' : s.desc}
                className="flex flex-col items-start px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderColor: scenario === s.id ? s.border : '#2d3142',
                  color:       scenario === s.id ? s.color  : '#57606a',
                  background:  scenario === s.id ? `${s.border}22` : 'transparent',
                }}
              >
                <span>{scenario === s.id ? '● ' : '○ '}{s.label}</span>
                <span className="font-normal opacity-70">{s.desc}</span>
              </button>
            ))}
          </div>

          {/* Start buttons + Reset */}
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={selectedPicker}
              onChange={(e) => setSelectedPicker(e.target.value)}
              disabled={!canControl}
              className="text-xs rounded-md px-2 py-1.5 border bg-transparent disabled:opacity-40"
              style={{ borderColor: '#2d3142', color: '#94a3b8' }}
              title="Which picker to start the personal demo for"
            >
              {pickers.length === 0 && <option value="">No pickers online</option>}
              {pickers.map((p) => (
                <option key={p.picker_id} value={p.picker_id} style={{ background: '#1a1d2e' }}>
                  {p.picker_id} {p.status === 'online' ? '●' : '○'}
                </option>
              ))}
            </select>
            <button
              onClick={startPersonal}
              disabled={!canControl || starting || resetting || !selectedPicker}
              title={isGuest ? 'Sign in as supervisor to start a demo' : `Start personal demo for ${selectedPicker}`}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: '#6929c4', color: '#be95ff', background: 'transparent' }}
            >
              {starting ? 'Starting…' : '▶ Personal'}
            </button>
            <button
              onClick={startPresentation}
              disabled={!canControl || starting || resetting}
              title={isGuest ? 'Sign in as supervisor to start a demo' : undefined}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: '#00b4d8', color: '#67e8f9', background: 'transparent' }}
            >
              {starting ? 'Starting…' : '▶ Presentation'}
            </button>
            <button
              onClick={async () => {
                if (!canControl) return;
                setResetting(true);
                try {
                  await fetch('/api/demo/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                  });
                } finally { setResetting(false); }
              }}
              disabled={!canControl || resetting || starting}
              title="Cancel all orphaned demo orders (run after a pod restart or stale session)"
              className="ml-auto px-3 py-1.5 rounded-md text-xs font-semibold border border-[#f1c21b]/40 text-[#f1c21b] hover:bg-[#f1c21b]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {resetting ? 'Clearing…' : '⟳ Reset'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'demo' && activeSession && (
        <>
          {/* Status bar */}
          <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">Demo running</span>
            <span
              className="text-[#57606a] text-xs px-1.5 py-0.5 rounded border"
              style={{ borderColor: scenario === 'physical-demo' ? '#a07800' : '#6929c4', color: scenario === 'physical-demo' ? '#f1c21b' : '#be95ff' }}
            >
              {scenario === 'physical-demo' ? 'Physical' : 'Web'}
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={restartDemo}
                disabled={!canControl || restarting || stopping}
                title="Stop current session and start a fresh one — fixes out-of-sync state"
                className="px-3 py-1 rounded-md text-xs font-semibold border border-[#f1c21b]/40 text-[#f1c21b] hover:bg-[#f1c21b]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {restarting ? 'Restarting…' : '⟳ Restart Demo'}
              </button>
              <button
                onClick={() => stopSession(activeSession.session_id)}
                disabled={!canControl || stopping || restarting}
                className="px-3 py-1 rounded-md text-xs font-semibold border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {stopping ? 'Stopping…' : '■ Stop Demo'}
              </button>
            </div>
          </div>

          {/* QR row: next-item barcode + join-demo link */}
          {nextLine ? (
            <div className="flex items-start gap-6 px-4 pb-3 flex-wrap">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="rounded-lg overflow-hidden border-2 border-[#6929c4]/40"
                  style={{ padding: '6px', background: '#fff', display: 'inline-block' }}
                  dangerouslySetInnerHTML={{ __html: qrSvg(nextLine.product_barcode, 160) }}
                />
                <span className="text-[#57606a] text-xs">Point your phone here →</span>
              </div>
              <div className="flex flex-col gap-1 justify-center">
                <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">Next item to scan</span>
                <span className="text-[#e2e8f0] text-base font-bold font-mono">{nextLine.product_barcode}</span>
                {nextLine.product_description && (
                  <span className="text-[#94a3b8] text-sm">{nextLine.product_description}</span>
                )}
                {remainingLines.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-1">
                    {remainingLines.map((l, i) => (
                      <span key={i} className="text-[#57606a] text-xs">
                        <span className="text-[#94a3b8] font-mono">×{l.qty}</span>{' '}{l.desc}
                      </span>
                    ))}
                  </div>
                )}
                {activeSession.mistake_probability > 0 && (
                  <span className="text-[#f1c21b] text-xs mt-1">
                    ⚠ This order may contain a deliberate mistake — watch for the error workflow
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-2 ml-auto">
                {(() => {
                  const joinUrl = `${window.location.origin}/mobile?picker_id=${encodeURIComponent(activeSession.picker_id)}`;
                  const fits = joinUrl.length <= 78;
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
        </>
      )}

      {/* ── LOAD GEN TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'loadgen' && (
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Controls row */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Picker count */}
            <div className="flex flex-col gap-1">
              <label className="text-[#57606a] text-xs font-semibold">
                Pickers <span className="text-[#94a3b8] font-mono">{lgPickerCount}</span>
              </label>
              <input
                type="range" min={1} max={20} value={lgPickerCount}
                onChange={(e) => setLgPickerCount(Number(e.target.value))}
                disabled={lgRunning || !canControl}
                className="w-28 accent-[#6929c4] disabled:opacity-40"
              />
            </div>

            {/* Scan interval */}
            <div className="flex flex-col gap-1">
              <label className="text-[#57606a] text-xs font-semibold">
                Scan interval <span className="text-[#94a3b8] font-mono">{lgScanInterval}ms</span>
              </label>
              <input
                type="range" min={200} max={3000} step={100} value={lgScanInterval}
                onChange={(e) => setLgScanInterval(Number(e.target.value))}
                disabled={lgRunning || !canControl}
                className="w-28 accent-[#6929c4] disabled:opacity-40"
              />
            </div>

            {/* Mistake % */}
            <div className="flex flex-col gap-1">
              <label className="text-[#57606a] text-xs font-semibold">
                Mistake % <span className="text-[#94a3b8] font-mono">{lgMistakePct}%</span>
              </label>
              <input
                type="range" min={0} max={30} step={5} value={lgMistakePct}
                onChange={(e) => setLgMistakePct(Number(e.target.value))}
                disabled={lgRunning || !canControl}
                className="w-28 accent-[#6929c4] disabled:opacity-40"
              />
            </div>

            {/* Start / Stop */}
            <div className="flex gap-2 items-center ml-auto">
              {!lgRunning ? (
                <button
                  onClick={startLoadGen}
                  disabled={!canControl || lgStarting}
                  title={isGuest ? 'Sign in as supervisor to run load gen' : `Start ${lgPickerCount} virtual pickers`}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: '#22c55e', color: '#22c55e', background: 'transparent' }}
                >
                  {lgStarting ? 'Starting…' : '▶ Start'}
                </button>
              ) : (
                <button
                  onClick={stopLoadGen}
                  disabled={!canControl || lgStopping}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {lgStopping ? 'Stopping…' : '■ Stop All'}
                </button>
              )}
            </div>
          </div>

          {/* Status table */}
          {lgStatus && lgStatus.pickers.length > 0 && (
            <div className="overflow-x-auto">
              {/* Totals row */}
              <div className="flex gap-4 mb-2 text-xs text-[#57606a]">
                <span>Scans: <span className="text-[#94a3b8] font-mono">{lgStatus.totals.scans_sent}</span></span>
                <span>Picks: <span className="text-[#94a3b8] font-mono">{lgStatus.totals.picks_confirmed}</span></span>
                {lgStatus.totals.errors > 0 && (
                  <span className="text-[#ef4444]">Errors: <span className="font-mono">{lgStatus.totals.errors}</span></span>
                )}
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-[#57606a] border-b border-[#2d3142]">
                    <th className="pb-1 pr-3 font-semibold">Picker</th>
                    <th className="pb-1 pr-3 font-semibold">Status</th>
                    <th className="pb-1 pr-3 font-semibold">Orders</th>
                    <th className="pb-1 pr-3 font-semibold">Scans</th>
                    <th className="pb-1 font-semibold">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {lgStatus.pickers.map((p) => (
                    <tr key={p.picker_id} className="border-b border-[#2d3142]/50">
                      <td className="py-1 pr-3 font-mono text-[#94a3b8]">{p.picker_id}</td>
                      <td className="py-1 pr-3">
                        <span style={{
                          color: p.status === 'picking' ? '#22c55e'
                               : p.status === 'advancing' ? '#67e8f9'
                               : p.status === 'error' ? '#ef4444'
                               : p.status === 'done' ? '#57606a'
                               : '#94a3b8',
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-1 pr-3 font-mono text-[#94a3b8]">{p.orders_completed}</td>
                      <td className="py-1 pr-3 font-mono text-[#94a3b8]">{p.scans_sent}</td>
                      <td className="py-1 font-mono" style={{ color: p.errors > 0 ? '#ef4444' : '#57606a' }}>
                        {p.errors}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lgStatus && !lgStatus.running && lgStatus.pickers.length === 0 && (
            <p className="text-[#57606a] text-xs">No virtual pickers running. Set parameters above and click Start.</p>
          )}
        </div>
      )}
    </div>
  );
}
