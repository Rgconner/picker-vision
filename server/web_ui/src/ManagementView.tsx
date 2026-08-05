/**
 * ManagementView — supervisor-only configuration surface.
 *
 * Four tabs, each fits on one screen without scrolling:
 *
 *   Users        — create / edit pickers and supervisors, set PINs
 *   Cart Types   — define cart names, dimensions, weight limits, unit system
 *   AI Settings  — LLM endpoint config + per-feature AI toggles
 *   Workflow     — validation thresholds, batch mode, voice defaults
 *
 * All panels use the same two-column form grid with large touch targets.
 * No horizontal overflow, no scroll within a panel.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { AuthState, UserRole } from './useAuth';
import { BttSetupPanel } from './BttSetupPanel';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ManagedUser {
  id:        string;
  name:      string;
  role:      UserRole;
  picker_id: string | null;
  pin_hash:  string;
}

interface CartType {
  id:           string;
  name:         string;
  max_weight:   number;
  weight_unit:  'kg' | 'lb';
  length_cm:    number;
  width_cm:     number;
  height_cm:    number;
  dim_unit:     'cm' | 'in';
  active:       boolean;
}

interface AiConfig {
  provider:            'none' | 'openai' | 'watsonx' | 'local';
  endpoint_url:        string;
  api_key:             string;
  model:               string;
  scan_mandatory_ai:   boolean;
  batch_strategy_ai:   boolean;
  validation_threshold_ai: boolean;
  voice_mode_ai:       boolean;
}

interface WorkflowConfig {
  batch_mode:              'single' | 'multi' | 'ai';
  validation_threshold:    number;
  voice_enabled_default:   boolean;
  haptic_enabled_default:  boolean;
  mid_pick_validate_after: number;
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#1e2130] last:border-0">
      <span className="text-[#94a3b8] text-sm w-32 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Field({
  value, onChange, type = 'text', placeholder = '', disabled = false,
}: {
  value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#06b6d4] disabled:opacity-40"
    />
  );
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full bg-[#0f1117] border border-[#2d3142] text-[#e2e8f0] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#06b6d4]"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-[#06b6d4]' : 'bg-[#2d3142]'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <span className="text-[#e2e8f0] text-sm">{label}</span>
    </label>
  );
}

function SaveButton({ saving, onClick, disabled = false }: { saving: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="px-6 py-2.5 rounded-lg bg-[#06b6d4] text-black font-bold text-sm disabled:opacity-40 active:brightness-90 transition-all"
    >
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

// ── SHA-256 helper (mirrors useAuth) ───────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── USERS PANEL ───────────────────────────────────────────────────────────────

function UsersPanel({ auth }: { auth: AuthState }) {
  const [users, setUsers]         = useState<ManagedUser[]>([]);
  const [selected, setSelected]   = useState<ManagedUser | null>(null);
  const [newPin, setNewPin]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');

  // New user form state
  const [adding, setAdding]       = useState(false);
  const [newName, setNewName]     = useState('');
  const [newRole, setNewRole]     = useState<UserRole>('picker');
  const [newPickerId, setNewPickerId] = useState('');
  const [newUserPin, setNewUserPin] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers((await res.json()) as ManagedUser[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: selected.name, role: selected.role, picker_id: selected.picker_id };
      if (newPin) body.pin_hash = await sha256hex(newPin);
      await fetch(`/api/users/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setMsg('Saved'); setNewPin('');
      await load(); auth.refresh();
    } catch { setMsg('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleAdd() {
    if (!newName || !newUserPin) return;
    setSaving(true);
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName, role: newRole,
          picker_id: newRole === 'picker' ? (newPickerId || newName.toLowerCase().replace(/\s+/g, '-')) : null,
          pin_hash: await sha256hex(newUserPin),
        }),
      });
      setAdding(false); setNewName(''); setNewUserPin(''); setNewPickerId('');
      await load(); auth.refresh();
    } catch { setMsg('Add failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    await load(); auth.refresh();
  }

  return (
    <div className="flex gap-4 h-full overflow-hidden">
      {/* Left: user list */}
      <div className="w-48 shrink-0 flex flex-col gap-2 overflow-y-auto">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => { setSelected(u); setNewPin(''); setMsg(''); setAdding(false); }}
            className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
              selected?.id === u.id
                ? 'border-[#06b6d4] bg-[#0a1e2d] text-[#06b6d4]'
                : 'border-[#2d3142] bg-[#1a1d27] text-[#e2e8f0] hover:border-[#3b82d4]'
            }`}
          >
            <div className="font-semibold truncate">{u.name}</div>
            <div className="text-[#57606a] text-xs capitalize">{u.role}</div>
          </button>
        ))}
        <button
          onClick={() => { setAdding(true); setSelected(null); }}
          className="mt-1 px-3 py-2.5 rounded-lg border border-dashed border-[#2d3142] text-[#57606a] text-sm hover:border-[#06b6d4] hover:text-[#06b6d4] transition-all text-center"
        >
          + Add User
        </button>
      </div>

      {/* Right: edit or add form */}
      <div className="flex-1 min-w-0 bg-[#1a1d27] rounded-xl border border-[#2d3142] p-4 flex flex-col gap-1">
        {!selected && !adding && (
          <p className="text-[#57606a] text-sm m-auto">Select a user or add a new one</p>
        )}

        {selected && !adding && (
          <>
            <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">Edit User</div>
            <Row label="Name"><Field value={selected.name} onChange={(v) => setSelected({ ...selected, name: v })} /></Row>
            <Row label="Role">
              <Select value={selected.role} onChange={(v) => setSelected({ ...selected, role: v })}
                options={[{ value: 'picker', label: 'Picker' }, { value: 'owner', label: 'Owner' }, { value: 'supervisor', label: 'Supervisor' }]} />
            </Row>
            <Row label="Picker ID"><Field value={selected.picker_id ?? ''} placeholder="auto" onChange={(v) => setSelected({ ...selected, picker_id: v || null })} /></Row>
            <Row label="New PIN"><Field type="password" value={newPin} placeholder="leave blank to keep" onChange={setNewPin} /></Row>
            {msg && <p className="text-xs text-[#22c55e] mt-1">{msg}</p>}
            <div className="flex gap-2 mt-auto pt-3">
              <SaveButton saving={saving} onClick={handleSaveEdit} />
              <button onClick={() => handleDelete(selected.id)} className="px-4 py-2.5 rounded-lg bg-[#2d0a0a] border border-[#ef4444]/30 text-[#ef4444] text-sm font-semibold hover:bg-[#3d1010] transition-all">Delete</button>
            </div>
          </>
        )}

        {adding && (
          <>
            <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">New User</div>
            <Row label="Name"><Field value={newName} placeholder="Full name" onChange={setNewName} /></Row>
            <Row label="Role">
              <Select value={newRole} onChange={setNewRole}
                options={[{ value: 'picker', label: 'Picker' }, { value: 'owner', label: 'Owner' }, { value: 'supervisor', label: 'Supervisor' }]} />
            </Row>
            {newRole === 'picker' && (
              <Row label="Picker ID"><Field value={newPickerId} placeholder="auto from name" onChange={setNewPickerId} /></Row>
            )}
            <Row label="PIN / Password"><Field type="password" value={newUserPin} placeholder="required" onChange={setNewUserPin} /></Row>
            {msg && <p className="text-xs text-[#ef4444] mt-1">{msg}</p>}
            <div className="flex gap-2 mt-auto pt-3">
              <SaveButton saving={saving} onClick={handleAdd} disabled={!newName || !newUserPin} />
              <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-lg bg-[#1a1d27] border border-[#2d3142] text-[#94a3b8] text-sm hover:text-[#e2e8f0] transition-all">Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── CART TYPES PANEL ──────────────────────────────────────────────────────────

function CartTypesPanel() {
  const [carts, setCarts]       = useState<CartType[]>([]);
  const [selected, setSelected] = useState<CartType | null>(null);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const [adding, setAdding]     = useState(false);

  const blank = (): Omit<CartType, 'id'> => ({
    name: '', max_weight: 20, weight_unit: 'kg',
    length_cm: 60, width_cm: 45, height_cm: 100, dim_unit: 'cm', active: true,
  });
  const [draft, setDraft] = useState<Omit<CartType, 'id'>>(blank());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cart-types');
      if (res.ok) setCarts((await res.json()) as CartType[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(c: CartType) {
    setSelected(c);
    setDraft({ name: c.name, max_weight: c.max_weight, weight_unit: c.weight_unit,
               length_cm: c.length_cm, width_cm: c.width_cm, height_cm: c.height_cm,
               dim_unit: c.dim_unit, active: c.active });
    setAdding(false); setMsg('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url   = adding ? '/api/cart-types' : `/api/cart-types/${selected!.id}`;
      const method = adding ? 'POST' : 'PUT';
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      setMsg('Saved'); setAdding(false);
      await load();
    } catch { setMsg('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this cart type?')) return;
    await fetch(`/api/cart-types/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    await load();
  }

  const f = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="flex gap-4 h-full overflow-hidden">
      <div className="w-48 shrink-0 flex flex-col gap-2 overflow-y-auto">
        {carts.map((c) => (
          <button key={c.id} onClick={() => startEdit(c)}
            className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
              selected?.id === c.id && !adding
                ? 'border-[#06b6d4] bg-[#0a1e2d] text-[#06b6d4]'
                : 'border-[#2d3142] bg-[#1a1d27] text-[#e2e8f0] hover:border-[#3b82d4]'
            }`}>
            <div className="font-semibold truncate">{c.name}</div>
            <div className="text-[#57606a] text-xs">{c.max_weight}{c.weight_unit} · {c.active ? 'active' : 'inactive'}</div>
          </button>
        ))}
        <button onClick={() => { setAdding(true); setSelected(null); setDraft(blank()); setMsg(''); }}
          className="mt-1 px-3 py-2.5 rounded-lg border border-dashed border-[#2d3142] text-[#57606a] text-sm hover:border-[#06b6d4] hover:text-[#06b6d4] transition-all text-center">
          + Add Cart
        </button>
      </div>

      <div className="flex-1 min-w-0 bg-[#1a1d27] rounded-xl border border-[#2d3142] p-4 flex flex-col gap-1">
        {!selected && !adding && (
          <p className="text-[#57606a] text-sm m-auto">Select a cart type or add a new one</p>
        )}
        {(selected || adding) && (
          <>
            <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">
              {adding ? 'New Cart Type' : 'Edit Cart Type'}
            </div>
            <Row label="Name"><Field value={draft.name} placeholder="e.g. Push Cart" onChange={(v) => f('name', v)} /></Row>
            <Row label="Max weight">
              <div className="flex gap-2">
                <Field type="number" value={draft.max_weight} onChange={(v) => f('max_weight', parseFloat(v) || 0)} />
                <Select value={draft.weight_unit} onChange={(v) => f('weight_unit', v)}
                  options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
              </div>
            </Row>
            <Row label="Dimensions (L×W×H)">
              <div className="flex gap-1 items-center">
                <Field type="number" value={draft.length_cm} onChange={(v) => f('length_cm', parseFloat(v) || 0)} />
                <span className="text-[#57606a]">×</span>
                <Field type="number" value={draft.width_cm} onChange={(v) => f('width_cm', parseFloat(v) || 0)} />
                <span className="text-[#57606a]">×</span>
                <Field type="number" value={draft.height_cm} onChange={(v) => f('height_cm', parseFloat(v) || 0)} />
                <Select value={draft.dim_unit} onChange={(v) => f('dim_unit', v)}
                  options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} />
              </div>
            </Row>
            <Row label="Active"><Toggle checked={draft.active} onChange={(v) => f('active', v)} label={draft.active ? 'Visible to pickers' : 'Hidden'} /></Row>
            {msg && <p className="text-xs text-[#22c55e] mt-1">{msg}</p>}
            <div className="flex gap-2 mt-auto pt-3">
              <SaveButton saving={saving} onClick={handleSave} disabled={!draft.name} />
              {!adding && selected && (
                <button onClick={() => handleDelete(selected.id)} className="px-4 py-2.5 rounded-lg bg-[#2d0a0a] border border-[#ef4444]/30 text-[#ef4444] text-sm font-semibold hover:bg-[#3d1010] transition-all">Delete</button>
              )}
              {adding && (
                <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-lg bg-[#1a1d27] border border-[#2d3142] text-[#94a3b8] text-sm hover:text-[#e2e8f0] transition-all">Cancel</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── AI SETTINGS PANEL ─────────────────────────────────────────────────────────

const AI_PROVIDERS = [
  { value: 'none',    label: 'Disabled — rules only' },
  { value: 'local',   label: 'Local (Ollama / LM Studio)' },
  { value: 'openai',  label: 'OpenAI' },
  { value: 'watsonx', label: 'IBM watsonx.ai' },
] as const;

function AiPanel() {
  const [cfg, setCfg]   = useState<AiConfig>({
    provider: 'none', endpoint_url: '', api_key: '', model: '',
    scan_mandatory_ai: false, batch_strategy_ai: false,
    validation_threshold_ai: false, voice_mode_ai: false,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    fetch('/api/ai-config').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setCfg(d as AiConfig); });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/ai-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
      setMsg('Saved');
    } catch { setMsg('Save failed'); }
    finally { setSaving(false); }
  }

  const f = <K extends keyof AiConfig>(k: K, v: AiConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const active = cfg.provider !== 'none';

  const placeholders: Record<string, string> = {
    local:   'http://localhost:11434/v1',
    openai:  'https://api.openai.com/v1',
    watsonx: 'https://us-south.ml.cloud.ibm.com',
    none:    '',
  };

  const modelHints: Record<string, string> = {
    local:   'e.g. llama3, mistral',
    openai:  'e.g. gpt-4o-mini',
    watsonx: 'e.g. ibm/granite-13b-instruct-v2',
    none:    '',
  };

  return (
    <div className="bg-[#1a1d27] rounded-xl border border-[#2d3142] p-4 flex flex-col gap-1 h-full">
      <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">AI Provider</div>
      <Row label="Provider">
        <Select value={cfg.provider} onChange={(v) => f('provider', v)} options={AI_PROVIDERS as unknown as { value: AiConfig['provider']; label: string }[]} />
      </Row>
      {active && (
        <>
          <Row label="Endpoint URL">
            <Field value={cfg.endpoint_url} placeholder={placeholders[cfg.provider]} onChange={(v) => f('endpoint_url', v)} />
          </Row>
          <Row label="API Key / Token">
            <Field type="password" value={cfg.api_key} placeholder="sk-… or Bearer token" onChange={(v) => f('api_key', v)} />
          </Row>
          <Row label="Model">
            <Field value={cfg.model} placeholder={modelHints[cfg.provider]} onChange={(v) => f('model', v)} />
          </Row>
        </>
      )}

      <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mt-4 mb-2">AI-Managed Decisions</div>
      <Row label="Scan requirement">
        <Toggle checked={cfg.scan_mandatory_ai} onChange={(v) => f('scan_mandatory_ai', v)} label="AI decides scan vs fast-path" />
      </Row>
      <Row label="Batch strategy">
        <Toggle checked={cfg.batch_strategy_ai} onChange={(v) => f('batch_strategy_ai', v)} label="AI selects single vs multi-order" />
      </Row>
      <Row label="Validation threshold">
        <Toggle checked={cfg.validation_threshold_ai} onChange={(v) => f('validation_threshold_ai', v)} label="AI tightens/relaxes mid-pick N" />
      </Row>
      <Row label="Voice mode">
        <Toggle checked={cfg.voice_mode_ai} onChange={(v) => f('voice_mode_ai', v)} label="AI suspends voice when noisy" />
      </Row>

      {msg && <p className="text-xs text-[#22c55e] mt-1">{msg}</p>}
      <div className="mt-auto pt-3">
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── WORKFLOW PANEL ────────────────────────────────────────────────────────────

function WorkflowPanel() {
  const [cfg, setCfg]   = useState<WorkflowConfig>({
    batch_mode: 'single', validation_threshold: 5,
    voice_enabled_default: true, haptic_enabled_default: true, mid_pick_validate_after: 5,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    fetch('/api/workflow-config').then((r) => r.ok ? r.json() : null).then((d) => { if (d) setCfg(d as WorkflowConfig); });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/workflow-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
      setMsg('Saved');
    } catch { setMsg('Save failed'); }
    finally { setSaving(false); }
  }

  const f = <K extends keyof WorkflowConfig>(k: K, v: WorkflowConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="bg-[#1a1d27] rounded-xl border border-[#2d3142] p-4 flex flex-col gap-1 h-full">
      <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mb-2">Batch &amp; Picking</div>
      <Row label="Batch mode">
        <Select value={cfg.batch_mode} onChange={(v) => f('batch_mode', v)}
          options={[
            { value: 'single', label: 'Single order per cart run' },
            { value: 'multi',  label: 'Multi-order per cart run' },
            { value: 'ai',     label: 'AI decides (see AI Settings)' },
          ]} />
      </Row>
      <Row label="Validate after N items in one zone">
        <Field type="number" value={cfg.mid_pick_validate_after}
          onChange={(v) => f('mid_pick_validate_after', parseInt(v, 10) || 1)} />
      </Row>
      <Row label="Validation required per section">
        <Field type="number" value={cfg.validation_threshold}
          onChange={(v) => f('validation_threshold', parseInt(v, 10) || 1)} />
      </Row>

      <div className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider mt-4 mb-2">Worker Defaults</div>
      <Row label="Voice prompts on">
        <Toggle checked={cfg.voice_enabled_default} onChange={(v) => f('voice_enabled_default', v)} label="Read-aloud prompts enabled by default" />
      </Row>
      <Row label="Haptic feedback on">
        <Toggle checked={cfg.haptic_enabled_default} onChange={(v) => f('haptic_enabled_default', v)} label="Vibration feedback enabled by default" />
      </Row>

      {msg && <p className="text-xs text-[#22c55e] mt-1">{msg}</p>}
      <div className="mt-auto pt-3">
        <SaveButton saving={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ── ManagementView ────────────────────────────────────────────────────────────

interface Props {
  auth: AuthState;
}

type Tab = 'users' | 'carts' | 'ai' | 'workflow' | 'btt-setup';

const BASE_TABS: { id: Tab; label: string }[] = [
  { id: 'users',    label: 'Users' },
  { id: 'carts',    label: 'Cart Types' },
  { id: 'ai',       label: 'AI Settings' },
  { id: 'workflow', label: 'Workflow' },
];

export function ManagementView({ auth }: Props) {
  const [tab, setTab]             = useState<Tab>('users');
  const [isBtt, setIsBtt]         = useState(false);

  // Fetch instance profile once on mount — gates the BTT Setup tab
  useEffect(() => {
    fetch('/api/order/instance-profile')
      .then(r => r.ok ? r.json() : { profile: '' })
      .then(d => { if (d.profile === 'bobs-tiny-treasures') setIsBtt(true); })
      .catch(() => {/* vanilla — no BTT tab */});
  }, []);

  const tabs = isBtt
    ? [...BASE_TABS, { id: 'btt-setup' as Tab, label: '🏪 BTT Setup' }]
    : BASE_TABS;

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3 max-w-4xl mx-auto w-full">

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id
                ? t.id === 'btt-setup'
                  ? 'bg-[#f59e0b] text-black'
                  : 'bg-[#06b6d4] text-black'
                : 'bg-[#1a1d27] border border-[#2d3142] text-[#94a3b8] hover:text-[#e2e8f0]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel — fills remaining height, no outer scroll */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'users'     && <UsersPanel auth={auth} />}
        {tab === 'carts'     && <CartTypesPanel />}
        {tab === 'ai'        && <AiPanel />}
        {tab === 'workflow'  && <WorkflowPanel />}
        {tab === 'btt-setup' && isBtt && <BttSetupPanel />}
      </div>
    </div>
  );
}
