import React from 'react';
import type { SystemTelemetry } from './types';

interface Props {
  telemetry: SystemTelemetry | null;
  onServiceClick?: (name: string) => void;
}

function dot(status: string, reachable?: boolean): { bg: string; text: string; label: string } {
  const ok = status === 'ok' && reachable !== false;
  const unreachable = status === 'unreachable' || reachable === false;
  if (ok)         return { bg: 'bg-[#0a2d14]', text: 'text-[#22c55e]', label: '●' };
  if (unreachable) return { bg: 'bg-[#2d1a1a]', text: 'text-[#ef4444]', label: '●' };
  return           { bg: 'bg-[#2d2510]', text: 'text-[#f59e0b]', label: '●' };
}

const SERVICE_LABELS: Record<string, string> = {
  'api-gateway':     'API GW',
  'order-service':   'Orders',
  'event-processor': 'Events',
  'websocket-hub':   'WS Hub',
};

export function HealthStrip({ telemetry, onServiceClick }: Props) {
  if (!telemetry) {
    return (
      <div
        className="shrink-0 flex items-center gap-2 px-4 py-1 text-xs border-b border-[#2d3142]"
        style={{ background: '#141720' }}
      >
        <span className="text-[#57606a]">● Connecting to telemetry…</span>
      </div>
    );
  }

  const { services, pickers } = telemetry;

  // Pi nodes — derive from picker list
  const onlinePickers  = pickers.filter((p) => p.status === 'online').length;
  const totalPickers   = pickers.length;
  const pickerStatus   = totalPickers === 0 ? 'unreachable' : onlinePickers > 0 ? 'ok' : 'error';
  const pickerDot      = dot(pickerStatus);

  return (
    <div
      className="shrink-0 flex items-center gap-3 px-4 py-1 text-xs border-b border-[#2d3142] overflow-x-auto"
      style={{ background: '#141720' }}
    >
      <span className="text-[#57606a] shrink-0">System:</span>

      {Object.entries(services).map(([name, svc]) => {
        const d = dot(svc.status, svc.reachable);
        const label = SERVICE_LABELS[name] ?? name;
        return (
          <button
            key={name}
            onClick={() => onServiceClick?.(name)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#2d3142] ${d.bg} cursor-pointer hover:brightness-125 transition-all shrink-0`}
          >
            <span className={d.text}>{d.label}</span>
            <span className="text-[#94a3b8]">{label}</span>
            {svc.version && (
              <span className="text-[#57606a] ml-0.5">{svc.version}</span>
            )}
          </button>
        );
      })}

      {/* Pi / pickers aggregate */}
      <button
        onClick={() => onServiceClick?.('pi-nodes')}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#2d3142] ${pickerDot.bg} cursor-pointer hover:brightness-125 transition-all shrink-0`}
      >
        <span className={pickerDot.text}>{pickerDot.label}</span>
        <span className="text-[#94a3b8]">Pi nodes</span>
        <span className="text-[#57606a] ml-0.5">{onlinePickers}/{totalPickers}</span>
      </button>

      <span className="ml-auto text-[#57606a] shrink-0">
        {new Date(telemetry.collected_at).toLocaleTimeString()}
      </span>
    </div>
  );
}
