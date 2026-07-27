import React, { useState } from 'react';
import { OperatorView } from './OperatorView';
import { SupervisorView } from './SupervisorView';
import { SystemView } from './SystemView';
import { MobilePickerView } from './MobilePickerView';
import { ManagementView } from './ManagementView';
import { LoginScreen } from './LoginScreen';
import { HealthStrip } from './HealthStrip';
import { useSystemHealth } from './useSystemHealth';
import { useAuth } from './useAuth';

// Supervisor sees all tabs; picker sees only Mobile
type SupervisorMode = 'operator' | 'supervisor' | 'mobile' | 'system' | 'management';
type PickerMode     = 'mobile';
type Mode = SupervisorMode | PickerMode;

const SUPERVISOR_TABS: { id: SupervisorMode; label: string }[] = [
  { id: 'operator',   label: 'Operator' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'mobile',     label: '📱 Mobile' },
  { id: 'system',     label: 'System' },
  { id: 'management', label: '⚙ Manage' },
];

export default function App() {
  const auth = useAuth();
  const [mode, setMode]               = useState<Mode>('mobile');
  const [focusService, setFocusService] = useState<string | null>(null);
  const { telemetry } = useSystemHealth();

  function handleServiceClick(name: string) {
    setFocusService(name);
    setMode('system');
  }

  // ── Not logged in — show full-screen login ─────────────────────────────────
  if (!auth.user) {
    return <LoginScreen auth={auth} />;
  }

  const isSupervisor = auth.user.role === 'supervisor';
  const isGuest      = auth.user.role === 'guest';

  // Pickers land on mobile and cannot navigate away
  // Guests see supervisor-style tabs but cannot manage
  const currentMode = auth.user.role === 'picker' ? 'mobile' : mode;

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

        {/* Mode tabs — supervisors/guests see all (guests skip Management); pickers see nothing */}
        {(isSupervisor || isGuest) && (
          <nav className="flex gap-1 ml-4">
            {SUPERVISOR_TABS
              .filter((t) => !(isGuest && t.id === 'management'))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setMode(t.id); if (t.id !== 'system') setFocusService(null); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    currentMode === t.id
                      ? t.id === 'management'
                        ? 'bg-[#7c5cd8] text-white'
                        : 'bg-[#06b6d4] text-black'
                      : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#2d3142]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
          </nav>
        )}

        {/* Right side: version badges + user pill + logout */}
        <div className="ml-auto flex items-center gap-2 text-xs text-[#94a3b8] flex-wrap justify-end">
          {isSupervisor && telemetry && Object.entries(telemetry.services).map(([name, svc]) => (
            <span key={name} className="rounded-full border border-[#2d3142] px-2 py-0.5 hidden sm:inline">
              {name} <span className="text-[#57606a]">{svc.version ?? '—'}</span>
            </span>
          ))}

          {/* Guest read-only badge */}
          {isGuest && (
            <span className="rounded-full px-2 py-0.5 border border-[#f1c21b]/30 bg-[#f1c21b]/10 text-[#f1c21b] text-xs">
              read-only
            </span>
          )}

          {/* Logged-in user pill */}
          <span className={`rounded-full px-3 py-0.5 font-semibold ${
            isSupervisor
              ? 'bg-[#7c5cd8]/20 text-[#a78bfa] border border-[#7c5cd8]/30'
              : isGuest
                ? 'bg-[#f1c21b]/10 text-[#f1c21b] border border-[#f1c21b]/30'
                : 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20'
          }`}>
            {auth.user.name}
          </span>

          <button
            onClick={auth.logout}
            className="px-2 py-0.5 rounded-full border border-[#2d3142] text-[#57606a] hover:text-[#ef4444] hover:border-[#ef4444]/40 transition-all"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Health strip — supervisors and guests */}
      {(isSupervisor || isGuest) && (
        <HealthStrip telemetry={telemetry} onServiceClick={handleServiceClick} />
      )}

      {/* Main content */}
      <main className={`flex-1 min-h-0 ${currentMode === 'mobile' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {currentMode === 'operator'    && <OperatorView />}
        {currentMode === 'supervisor'  && <SupervisorView auth={auth} />}
        {currentMode === 'mobile'      && (
          <MobilePickerView
            defaultPickerId={auth.user.picker_id ?? auth.user.name}
            lockedPickerId={auth.user.role === 'picker'}
          />
        )}
        {currentMode === 'system'      && (
          <SystemView telemetry={telemetry} focusService={focusService} />
        )}
        {currentMode === 'management'  && isSupervisor && !isGuest && (
          <ManagementView auth={auth} />
        )}
      </main>

      {/* Footer — supervisors and guests (pickers get full screen) */}
      {(isSupervisor || isGuest) && (
        <footer
          className="shrink-0 text-center text-xs py-2 border-t border-[#2d3142]"
          style={{ color: '#57606a' }}
        >
          Picker Vision · v{telemetry?.services['api-gateway']?.version ?? '—'} · Powered by IBM Bob
        </footer>
      )}
    </div>
  );
}
