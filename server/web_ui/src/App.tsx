import React, { useState } from 'react';
import { OperatorView } from './OperatorView';
import { SupervisorView } from './SupervisorView';
import { SystemView } from './SystemView';
import { MobilePickerView } from './MobilePickerView';
import { HealthStrip } from './HealthStrip';
import { useSystemHealth } from './useSystemHealth';

type Mode = 'operator' | 'supervisor' | 'system' | 'mobile';

export default function App() {
  const [mode, setMode] = useState<Mode>('operator');
  const [focusService, setFocusService] = useState<string | null>(null);
  const { telemetry } = useSystemHealth();

  function handleServiceClick(name: string) {
    setFocusService(name);
    setMode('system');
  }

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#0f1117', color: '#e2e8f0' }}
    >
      {/* Top header bar */}
      <header
        className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-[#2d3142]"
        style={{ background: '#1a1d27' }}
      >
        <span className="font-bold text-[#e2e8f0] text-base tracking-tight">
          Picker Vision
        </span>

        {/* Mode tabs */}
        <nav className="flex gap-1 ml-4">
          {(['operator', 'supervisor', 'mobile', 'system'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); if (m !== 'system') setFocusService(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                mode === m
                  ? 'bg-[#06b6d4] text-black'
                  : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#2d3142]'
              }`}
            >
              {m === 'mobile' ? '📱 Mobile' : m}
            </button>
          ))}
        </nav>

        {/* Version badges — pulled from live telemetry */}
        <div className="ml-auto flex items-center gap-2 text-xs text-[#94a3b8] flex-wrap justify-end">
          {telemetry && Object.entries(telemetry.services).map(([name, svc]) => (
            <span key={name} className="rounded-full border border-[#2d3142] px-2 py-0.5">
              {name} <span className="text-[#57606a]">{svc.version ?? '—'}</span>
            </span>
          ))}
        </div>
      </header>

      {/* Persistent health strip */}
      <HealthStrip telemetry={telemetry} onServiceClick={handleServiceClick} />

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-auto">
        {mode === 'operator'   && <OperatorView />}
        {mode === 'supervisor' && <SupervisorView />}
        {mode === 'mobile'     && <MobilePickerView />}
        {mode === 'system'     && (
          <SystemView
            telemetry={telemetry}
            focusService={focusService}
          />
        )}
      </main>

      {/* Footer */}
      <footer
        className="shrink-0 text-center text-xs py-2 border-t border-[#2d3142]"
        style={{ color: '#57606a' }}
      >
        Picker Vision · v{telemetry?.services['api-gateway']?.version ?? '—'} · Powered by IBM Bob
      </footer>
    </div>
  );
}
