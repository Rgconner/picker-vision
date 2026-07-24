import React, { useState } from 'react';
import { OperatorView } from './OperatorView';
import { SupervisorView } from './SupervisorView';

type Mode = 'operator' | 'supervisor';

export default function App() {
  const [mode, setMode] = useState<Mode>('operator');

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
          Picker Vision System
        </span>

        {/* Mode tabs */}
        <nav className="flex gap-1 ml-4">
          <button
            onClick={() => setMode('operator')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === 'operator'
                ? 'bg-[#06b6d4] text-black'
                : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#2d3142]'
            }`}
          >
            Operator
          </button>
          <button
            onClick={() => setMode('supervisor')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              mode === 'supervisor'
                ? 'bg-[#06b6d4] text-black'
                : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#2d3142]'
            }`}
          >
            Supervisor
          </button>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-auto">
        {mode === 'operator' ? <OperatorView /> : <SupervisorView />}
      </main>

      {/* Footer */}
      <footer
        className="shrink-0 text-center text-xs py-2 border-t border-[#2d3142]"
        style={{ color: '#57606a' }}
      >
        Powered by IBM Bob
      </footer>
    </div>
  );
}
