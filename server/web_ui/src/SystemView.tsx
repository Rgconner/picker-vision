import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LogLine, LogResponse, PickerInfo, ScanLogEntry, ServiceTelemetry, SystemTelemetry } from './types';
import { useStreamStats } from './useStreamStats';

// ── Helpers ───────────────────────────────────────────────────────────────────

function uptime(seconds?: number): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusBadge(svc: ServiceTelemetry): { bg: string; text: string; label: string } {
  const ok = svc.status === 'ok' && svc.reachable !== false;
  if (ok)                  return { bg: 'bg-[#0a2d14]', text: 'text-[#22c55e]', label: 'healthy' };
  if (svc.status === 'unreachable') return { bg: 'bg-[#2d1a1a]', text: 'text-[#ef4444]', label: 'unreachable' };
  return                            { bg: 'bg-[#2d2510]', text: 'text-[#f59e0b]', label: 'degraded' };
}

function logLevelColor(level: string): string {
  switch (level) {
    case 'ERROR':    return 'text-[#ef4444]';
    case 'WARNING':  return 'text-[#f59e0b]';
    case 'DEBUG':    return 'text-[#57606a]';
    default:         return 'text-[#e2e8f0]';
  }
}

const SERVICE_LABELS: Record<string, string> = {
  'api-gateway':     'API Gateway',
  'order-service':   'Order Service',
  'event-processor': 'Event Processor',
  'websocket-hub':   'WebSocket Hub',
};

// ── ServiceCard ───────────────────────────────────────────────────────────────

function ServiceCard({ name, svc }: { name: string; svc: ServiceTelemetry }) {
  const badge = statusBadge(svc);
  const label = SERVICE_LABELS[name] ?? name;

  return (
    <div className="rounded-xl border border-[#2d3142] bg-[#1a1d27] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[#e2e8f0] text-sm">{label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>
      <div className="text-xs text-[#94a3b8] grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-[#57606a]">Version</span>
        <span>{svc.version ?? '—'}</span>
        <span className="text-[#57606a]">Uptime</span>
        <span>{uptime(svc.uptime_seconds)}</span>
        {svc.started_at && (
          <>
            <span className="text-[#57606a]">Started</span>
            <span>{new Date(svc.started_at).toLocaleString()}</span>
          </>
        )}
        {svc.error && (
          <>
            <span className="text-[#57606a]">Error</span>
            <span className="text-[#ef4444] col-span-1 break-all">{svc.error}</span>
          </>
        )}
      </div>
      {svc.counters && Object.keys(svc.counters).length > 0 && (
        <div className="border-t border-[#2d3142] pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(svc.counters).map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-[#57606a]">{k.replace(/_/g, ' ')}</span>
              <span className="text-[#94a3b8] font-mono">{v.toLocaleString()}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PickerStreamBadge — inline stream health indicator for the table ──────────

function PickerStreamBadge({ streamUrl }: { streamUrl: string }) {
  const stats = useStreamStats(streamUrl);
  const colour =
    stats.status === 'streaming'  ? 'text-[#22c55e]' :
    stats.status === 'connecting' ? 'text-[#f59e0b]' :
    stats.status === 'stalled'    ? 'text-[#f97316]' : 'text-[#ef4444]';

  return (
    <span className={`ml-2 font-sans text-[10px] font-semibold ${colour}`}>
      {stats.status === 'streaming'
        ? `● ${stats.fps.toFixed(1)} fps · ${stats.kbps} kb/s`
        : `● ${stats.status}`}
    </span>
  );
}

// ── PickerTable ───────────────────────────────────────────────────────────────

function PickerTable({ pickers }: { pickers: PickerInfo[] }) {
  if (pickers.length === 0) {
    return (
      <div className="text-[#57606a] text-sm text-center py-6 border border-[#2d3142] rounded-xl bg-[#1a1d27]">
        No pickers registered
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2d3142] bg-[#1a1d27]">
      <table className="w-full text-xs text-[#94a3b8]">
        <thead>
          <tr className="border-b border-[#2d3142] text-[#57606a]">
            <th className="text-left px-3 py-2">Picker ID</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Version</th>
            <th className="text-left px-3 py-2">Stream URL</th>
            <th className="text-left px-3 py-2">Control URL</th>
            <th className="text-left px-3 py-2">Last Seen</th>
            <th className="text-left px-3 py-2">Registered</th>
          </tr>
        </thead>
        <tbody>
          {pickers.map((p) => (
            <tr key={p.picker_id} className="border-b border-[#2d3142] last:border-0">
              <td className="px-3 py-2 font-semibold text-[#e2e8f0]">{p.picker_id}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  p.status === 'online'
                    ? 'bg-[#0a2d14] text-[#22c55e]'
                    : 'bg-[#2d1a1a] text-[#ef4444]'
                }`}>
                  {p.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono">{p.version ?? '—'}</td>
              <td className="px-3 py-2 font-mono break-all">
                {p.stream_url
                  ? <>
                      <a href={p.stream_url} target="_blank" rel="noreferrer" className="text-[#3b82d4] hover:underline">{p.stream_url}</a>
                      <PickerStreamBadge streamUrl={p.stream_url} />
                    </>
                  : <span className="text-[#ef4444]">not registered</span>
                }
              </td>
              <td className="px-3 py-2 font-mono break-all text-[#57606a]">{p.control_url ?? '—'}</td>
              <td className="px-3 py-2 text-[#57606a]">
                {p.last_seen_at ? new Date(p.last_seen_at).toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2 text-[#57606a]">
                {p.registered_at ? new Date(p.registered_at).toLocaleString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DataFlowDiagram ───────────────────────────────────────────────────────────

function DataFlowDiagram({ telemetry }: { telemetry: SystemTelemetry }) {
  const gw   = telemetry.services['api-gateway'];
  const ep   = telemetry.services['event-processor'];
  const ws   = telemetry.services['websocket-hub'];

  const eventsProxied   = gw?.counters?.['events_proxied']     ?? '—';
  const eventsProcessed = ep?.counters?.['events_processed']   ?? '—';
  const msgsBroadcast   = ws?.counters?.['messages_broadcast'] ?? '—';
  const activeSockets   = (ws?.counters?.['active_picker_sockets'] ?? 0)
                        + (ws?.counters?.['active_supervisor_sockets'] ?? 0);

  const nodeStyle = "rounded-xl border border-[#2d3142] bg-[#1a1d27] px-4 py-2 text-xs text-[#e2e8f0] font-semibold text-center min-w-[90px]";
  const arrowStyle = "flex flex-col items-center justify-center text-[#57606a] text-xs min-w-[60px]";

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-3 px-1 flex-wrap justify-center">
      <div className={nodeStyle}>Pi Node(s)<br /><span className="text-[#57606a] font-normal">{telemetry.pickers.length} registered</span></div>
      <div className={arrowStyle}>
        <span className="text-[#3b82d4]">→</span>
        <span>detect events</span>
        <span className="font-mono text-[#94a3b8]">{String(eventsProxied)}</span>
      </div>
      <div className={nodeStyle}>API Gateway<br /><span className="text-[#57606a] font-normal">{gw?.version ?? '—'}</span></div>
      <div className={arrowStyle}>
        <span className="text-[#3b82d4]">→</span>
        <span>process</span>
        <span className="font-mono text-[#94a3b8]">{String(eventsProcessed)}</span>
      </div>
      <div className={nodeStyle}>Event Processor<br /><span className="text-[#57606a] font-normal">{ep?.version ?? '—'}</span></div>
      <div className={arrowStyle}>
        <span className="text-[#3b82d4]">→</span>
        <span>broadcast</span>
        <span className="font-mono text-[#94a3b8]">{String(msgsBroadcast)}</span>
      </div>
      <div className={nodeStyle}>WS Hub<br /><span className="text-[#57606a] font-normal">{ws?.version ?? '—'}</span></div>
      <div className={arrowStyle}>
        <span className="text-[#3b82d4]">→</span>
        <span>live sockets</span>
        <span className="font-mono text-[#94a3b8]">{activeSockets}</span>
      </div>
      <div className={nodeStyle}>Browser(s)<br /><span className="text-[#57606a] font-normal">operator / supervisor</span></div>
    </div>
  );
}

// ── LogViewer ─────────────────────────────────────────────────────────────────

const SERVER_SERVICES = ['api-gateway', 'order-service', 'event-processor', 'websocket-hub'];

function LogViewer({ pickers }: { pickers: PickerInfo[] }) {
  const [selected, setSelected] = useState<string>('api-gateway');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (source: string) => {
    try {
      const url = source.startsWith('pi:')
        ? `/api/logs/pi/${source.slice(3)}`
        : `/api/logs/${source}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LogResponse;
      setLines(data.lines.slice(-50));
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    fetchLogs(selected);
    const id = setInterval(() => fetchLogs(selected), 5000);
    return () => clearInterval(id);
  }, [selected, fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const allSources = [
    ...SERVER_SERVICES,
    ...pickers.map((p) => `pi:${p.picker_id}`),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded-md px-3 py-1.5 focus:outline-none focus:border-[#06b6d4]"
        >
          {allSources.map((s) => (
            <option key={s} value={s}>{s.startsWith('pi:') ? `Pi: ${s.slice(3)}` : SERVICE_LABELS[s] ?? s}</option>
          ))}
        </select>
        <span className="text-[#57606a] text-xs">last 50 lines, refreshes every 5s</span>
        {fetchError && <span className="text-[#ef4444] text-xs">{fetchError}</span>}
      </div>
      <div
        className="bg-[#0a0c10] border border-[#2d3142] rounded-xl p-3 font-mono text-xs overflow-y-auto"
        style={{ maxHeight: 360 }}
      >
        {lines.length === 0 && !fetchError && (
          <span className="text-[#57606a]">No log lines captured yet.</span>
        )}
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2 leading-5">
            <span className="text-[#57606a] shrink-0">{l.time}</span>
            <span className={`shrink-0 w-14 ${logLevelColor(l.level)}`}>{l.level}</span>
            <span className="text-[#57606a] shrink-0 max-w-[140px] truncate">{l.logger}</span>
            <span className="text-[#e2e8f0] break-all">{l.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── VersionTable ──────────────────────────────────────────────────────────────

function VersionTable({ telemetry }: { telemetry: SystemTelemetry }) {
  const rows: { name: string; version: string; status: string }[] = [];

  for (const [name, svc] of Object.entries(telemetry.services)) {
    rows.push({ name: SERVICE_LABELS[name] ?? name, version: svc.version ?? '—', status: svc.status });
  }
  for (const p of telemetry.pickers) {
    rows.push({ name: `Pi: ${p.picker_id}`, version: p.version ?? '—', status: p.status });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#2d3142] bg-[#1a1d27]">
      <table className="w-full text-xs text-[#94a3b8]">
        <thead>
          <tr className="border-b border-[#2d3142] text-[#57606a]">
            <th className="text-left px-3 py-2">Component</th>
            <th className="text-left px-3 py-2">Version</th>
            <th className="text-left px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#2d3142] last:border-0">
              <td className="px-3 py-2 text-[#e2e8f0]">{r.name}</td>
              <td className="px-3 py-2 font-mono">{r.version}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  r.status === 'ok' || r.status === 'online'
                    ? 'bg-[#0a2d14] text-[#22c55e]'
                    : r.status === 'unreachable' || r.status === 'offline'
                    ? 'bg-[#2d1a1a] text-[#ef4444]'
                    : 'bg-[#2d2510] text-[#f59e0b]'
                }`}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ScanLogTable ─────────────────────────────────────────────────────────────

function ScanLogTable() {
  const [entries, setEntries]         = useState<ScanLogEntry[]>([]);
  const [pickerFilter, setPickerFilter] = useState<string>('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [open, setOpen]               = useState(true);

  useEffect(() => {
    async function fetchLog() {
      try {
        const res = await fetch('/api/scan-log?limit=50');
        if (res.ok) setEntries(await res.json());
      } catch { /* ignore */ }
    }
    fetchLog();
    const id = setInterval(fetchLog, 5000);
    return () => clearInterval(id);
  }, []);

  const allPickers = Array.from(new Set(entries.map((e) => e.picker_id))).sort();

  const filtered = entries.filter((e) => {
    if (pickerFilter && e.picker_id !== pickerFilter) return false;
    if (outcomeFilter === 'error' && !e.error) return false;
    if (outcomeFilter === 'correct') {
      if (e.outcomes.length === 0 || !e.outcomes.every((o) => o.result === 'correct')) return false;
    }
    if (outcomeFilter === 'unexpected') {
      if (!e.outcomes.some((o) => o.result === 'unexpected')) return false;
    }
    return true;
  });

  function rowColour(e: ScanLogEntry): string {
    if (e.error) return 'text-[#ef4444]';
    if (e.outcomes.some((o) => o.result === 'unexpected')) return 'text-[#ef4444]';
    if (e.outcomes.every((o) => o.result === 'correct') && e.outcomes.length > 0) return 'text-[#22c55e]';
    return 'text-[#94a3b8]';
  }

  return (
    <div>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left mb-3"
      >
        <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">
          Recent Scan Events
        </span>
        <span className="text-[#57606a] text-xs ml-1">{open ? '▲' : '▼'}</span>
        <span className="text-[#57606a] text-xs ml-auto">{entries.length} total</span>
      </button>

      {open && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <select
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              className="bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-xs rounded-md px-2 py-1 focus:outline-none focus:border-[#06b6d4]"
            >
              <option value="">All pickers</option>
              {allPickers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-xs rounded-md px-2 py-1 focus:outline-none focus:border-[#06b6d4]"
            >
              <option value="all">All outcomes</option>
              <option value="correct">Correct</option>
              <option value="unexpected">Unexpected</option>
              <option value="error">Error</option>
            </select>
            <span className="text-[#57606a] text-xs ml-auto">refreshes every 5s</span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-[#57606a] text-xs text-center py-4 border border-[#2d3142] rounded-xl bg-[#1a1d27]">
              No scan events match the current filter.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#2d3142] bg-[#1a1d27]">
              <table className="w-full text-xs text-[#94a3b8]">
                <thead>
                  <tr className="border-b border-[#2d3142] text-[#57606a]">
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Trace</th>
                    <th className="text-left px-3 py-2">Picker</th>
                    <th className="text-left px-3 py-2">Barcodes</th>
                    <th className="text-left px-3 py-2">Outcome</th>
                    <th className="text-left px-3 py-2">Ms</th>
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => (
                    <tr key={i} className={`border-b border-[#2d3142] last:border-0 ${rowColour(e)}`}>
                      <td className="px-3 py-1.5 font-mono shrink-0">{e.time}</td>
                      <td className="px-3 py-1.5 font-mono text-[#57606a]">{e.trace_id}</td>
                      <td className="px-3 py-1.5 font-semibold text-[#e2e8f0]">{e.picker_id}</td>
                      <td className="px-3 py-1.5 font-mono max-w-[160px]">
                        {e.barcodes.length === 0
                          ? <span className="text-[#57606a]">—</span>
                          : e.barcodes.join(', ')}
                      </td>
                      <td className="px-3 py-1.5">
                        {e.outcomes.length === 0 && !e.error
                          ? <span className="text-[#57606a]">empty</span>
                          : e.outcomes.map((o, j) => (
                              <span key={j} className={`mr-1 ${
                                o.result === 'correct'    ? 'text-[#22c55e]' :
                                o.result === 'unexpected' ? 'text-[#ef4444]' :
                                'text-[#f59e0b]'
                              }`}>
                                {o.result[0].toUpperCase()}
                              </span>
                            ))
                        }
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[#57606a]">{e.processing_ms}</td>
                      <td className="px-3 py-1.5 font-mono text-[#57606a]">
                        {e.order_completed ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[#ef4444] max-w-[120px] truncate">
                        {e.error ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── SystemView ────────────────────────────────────────────────────────────────

interface Props {
  telemetry: SystemTelemetry | null;
  focusService?: string | null;
}

export function SystemView({ telemetry, focusService }: Props) {
  const serviceCardsRef = useRef<HTMLDivElement>(null);
  const piRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusService) return;
    if (focusService === 'pi-nodes') {
      piRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      serviceCardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusService]);

  if (!telemetry) {
    return (
      <div className="flex items-center justify-center h-64 text-[#94a3b8] text-sm">
        Loading telemetry…
      </div>
    );
  }

  const section = (title: string) => (
    <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-3 mt-6 first:mt-0">
      {title}
    </div>
  );

  return (
    <div className="p-4 flex flex-col gap-0 max-w-5xl mx-auto">
      {/* Service health cards */}
      <div ref={serviceCardsRef}>
        {section('Service Health')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(telemetry.services).map(([name, svc]) => (
            <ServiceCard key={name} name={name} svc={svc} />
          ))}
        </div>
      </div>

      {/* Data flow */}
      {section('Data Flow')}
      <div className="rounded-xl border border-[#2d3142] bg-[#1a1d27] p-3">
        <DataFlowDiagram telemetry={telemetry} />
      </div>

      {/* Pi node registration */}
      <div ref={piRef}>
        {section('Pi Node Registration')}
        <PickerTable pickers={telemetry.pickers} />
      </div>

      {/* Log viewer */}
      {section('Logs')}
      <LogViewer pickers={telemetry.pickers} />

      {/* Scan event ledger */}
      {section('Scan Observability')}
      <ScanLogTable />

      {/* Version table */}
      {section('Component Versions')}
      <VersionTable telemetry={telemetry} />

      <div className="mt-8 text-center text-[#57606a] text-xs">
        Telemetry collected at {new Date(telemetry.collected_at).toLocaleString()}
      </div>
    </div>
  );
}
