import React, { useEffect, useState } from 'react';
import { OperatorView } from './OperatorView';
import { SupervisorView } from './SupervisorView';
import { SystemView } from './SystemView';
import { MobilePickerView } from './MobilePickerView';
import { ManagementView } from './ManagementView';
import { LoadGenView } from './LoadGenView';
import { RegionalSimView } from './RegionalSimView';
import { LoginScreen } from './LoginScreen';
import { HealthStrip } from './HealthStrip';
import { useSystemHealth } from './useSystemHealth';
import { useAuth } from './useAuth';

// Supervisor sees all tabs; picker sees only Mobile
type SupervisorMode = 'operator' | 'supervisor' | 'mobile' | 'system' | 'management' | 'load-gen' | 'regional-sim';
type PickerMode     = 'mobile';
type Mode = SupervisorMode | PickerMode;

const SUPERVISOR_TABS: { id: SupervisorMode; label: string }[] = [
  { id: 'operator',     label: 'Operator' },
  { id: 'supervisor',   label: 'Supervisor' },
  { id: 'mobile',       label: '📱 Mobile' },
  { id: 'system',       label: 'System' },
  { id: 'management',   label: '⚙ Manage' },
  { id: 'load-gen',     label: '⚡ Load Gen' },
  { id: 'regional-sim', label: '📊 Stores' },
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
  const isOwner      = auth.user.role === 'owner';
  const isGuest      = auth.user.role === 'guest';

  // Pickers land on mobile and cannot navigate away
  // Owner lands on supervisor tab on first render
  useEffect(() => {
    if (auth.user?.role === 'owner' && mode === 'mobile') {
      setMode('supervisor');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.role]);
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

        {/* Mode tabs — supervisors/owners/guests see tabs; pickers see nothing */}
        {(isSupervisor || isOwner || isGuest) && (
          <nav className="flex gap-1 ml-4">
            {SUPERVISOR_TABS
              .filter((t) => {
                if (isGuest || isOwner) return t.id !== 'management' && t.id !== 'load-gen' && t.id !== 'regional-sim';
                return true;
              })
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
          {(isSupervisor || isOwner) && telemetry && Object.entries(telemetry.services).map(([name, svc]) => (
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
              : isOwner
                ? 'bg-[#0f62fe]/15 text-[#78a9ff] border border-[#0f62fe]/30'
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

      {/* Health strip — supervisors, owners, and guests */}
      {(isSupervisor || isOwner || isGuest) && (
        <HealthStrip telemetry={telemetry} onServiceClick={handleServiceClick} />
      )}

      {/* Main content */}
      <main className={`flex-1 min-h-0 ${currentMode === 'mobile' ? 'overflow-hidden' : 'overflow-auto'}`}>
        {currentMode === 'operator'    && <OperatorView />}
        {currentMode === 'supervisor'  && <SupervisorView auth={auth} />}
        {currentMode === 'mobile'      && (
          <MobilePickerView
            defaultPickerId={
              auth.user.picker_id ??
              // QOL-023: generate picker-{firstname} from auth name when no picker_id set
              `picker-${auth.user.name.toLowerCase().split(/\s+/)[0]}`
            }
            lockedPickerId={auth.user.role === 'picker'}
          />
        )}
        {currentMode === 'system'      && (
          <SystemView telemetry={telemetry} focusService={focusService} />
        )}
        {currentMode === 'management'  && isSupervisor && (
          <ManagementView auth={auth} />
        )}
        {currentMode === 'load-gen'    && isSupervisor && (
          <LoadGenView auth={auth} />
        )}
        {currentMode === 'regional-sim' && isSupervisor && (
          <RegionalSimView auth={auth} />
        )}
      </main>

      {/* Footer — supervisors, owners, and guests (pickers get full screen) */}
      {(isSupervisor || isOwner || isGuest) && (
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
