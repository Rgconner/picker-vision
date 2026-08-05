/**
 * LoginScreen — full-screen login for Picker Vision.
 *
 * Pickers:      tap their name from a large-button list → enter PIN.
 * Supervisors:  tap "Supervisor" → enter username + password.
 *
 * Designed for gloved hands: large touch targets, clear labels, no scroll.
 * Two-step flow keeps each screen uncluttered.
 */

import React, { useState } from 'react';
import type { AuthState } from './useAuth';

interface Props {
  auth: AuthState;
}

type Step = 'choose-role' | 'picker-select' | 'picker-pin' | 'supervisor-login' | 'owner-login';

export function LoginScreen({ auth }: Props) {
  const [step, setStep]           = useState<Step>('choose-role');
  const [selectedName, setSelectedName] = useState('');
  const [pin, setPin]             = useState('');
  const [supUser, setSupUser]     = useState('');
  const [supPass, setSupPass]     = useState('');
  const [ownerUser, setOwnerUser] = useState('');
  const [ownerPass, setOwnerPass] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickers = auth.users.filter((u) => u.role === 'picker');

  async function handlePickerPin() {
    if (!pin) return;
    setSubmitting(true);
    const ok = await auth.login(selectedName, pin);
    setSubmitting(false);
    if (!ok) setPin('');
  }

  async function handleSupervisorLogin() {
    if (!supUser || !supPass) return;
    setSubmitting(true);
    const ok = await auth.login(supUser, supPass);
    setSubmitting(false);
    if (!ok) setSupPass('');
  }

  async function handleOwnerLogin() {
    if (!ownerUser || !ownerPass) return;
    setSubmitting(true);
    const ok = await auth.login(ownerUser, ownerPass);
    setSubmitting(false);
    if (!ok) setOwnerPass('');
  }

  function back() {
    auth.refresh();
    setStep('choose-role');
    setPin('');
    setSupPass('');
    setOwnerPass('');
    setSelectedName('');
  }

  // ── Shared chrome ──────────────────────────────────────────────────────────
  const shell = (content: React.ReactNode) => (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-[#0f1117] text-[#e2e8f0] px-6"
      style={{ paddingTop: 'env(safe-area-inset-top,0)', paddingBottom: 'env(safe-area-inset-bottom,0)' }}
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Logo / title */}
        <div className="text-center">
          <div className="text-2xl font-bold tracking-tight text-[#e2e8f0]">Picker Vision</div>
          <div className="text-[#57606a] text-sm mt-1">Warehouse picking assistant</div>
        </div>
        {content}
      </div>
    </div>
  );

  // ── Step 0: choose role ────────────────────────────────────────────────────
  if (step === 'choose-role') {
    return shell(
      <>
        <button
          onClick={() => { auth.refresh(); setStep('picker-select'); }}
          className="w-full py-5 rounded-2xl bg-[#22c55e] text-black font-bold text-xl active:brightness-90 transition-all"
        >
          I'm a Picker
        </button>
        <button
          onClick={() => setStep('owner-login')}
          className="w-full py-5 rounded-2xl bg-[#0f62fe] text-white font-bold text-xl active:brightness-90 transition-all"
        >
          Owner
        </button>
        <button
          onClick={() => setStep('supervisor-login')}
          className="w-full py-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#94a3b8] font-bold text-lg active:brightness-90 transition-all"
        >
          Supervisor
        </button>
        <button
          onClick={auth.loginAsGuest}
          className="w-full py-3 rounded-2xl bg-transparent border border-[#2d3142] text-[#57606a] text-sm active:brightness-90 transition-all hover:border-[#f1c21b]/40 hover:text-[#f1c21b]"
        >
          See the App (read-only)
        </button>
        {auth.error && (
          <p className="text-center text-[#ef4444] text-sm">{auth.error}</p>
        )}
      </>
    );
  }

  // ── Step 1a: picker selects their name ─────────────────────────────────────
  if (step === 'picker-select') {
    return shell(
      <>
        <p className="text-center text-[#94a3b8] text-sm font-semibold uppercase tracking-wider">
          Who are you?
        </p>
        <div className="flex flex-col gap-3">
          {pickers.length === 0 && (
            <p className="text-center text-[#57606a] text-sm">No pickers configured yet.</p>
          )}
          {pickers.map((u) => (
            <button
              key={u.id}
              onClick={() => { setSelectedName(u.name); setStep('picker-pin'); }}
              className="w-full py-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] font-bold text-lg active:brightness-90 transition-all hover:border-[#06b6d4]"
            >
              {u.name}
            </button>
          ))}
        </div>
        <button onClick={back} className="text-[#57606a] text-sm text-center w-full py-2">
          ← Back
        </button>
      </>
    );
  }

  // ── Step 1b: picker enters PIN ─────────────────────────────────────────────
  if (step === 'picker-pin') {
    return shell(
      <>
        <p className="text-center text-[#94a3b8] text-sm">
          Hi <span className="text-[#e2e8f0] font-semibold">{selectedName}</span> — enter your PIN
        </p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handlePickerPin()}
          placeholder="PIN"
          className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] focus:outline-none focus:border-[#06b6d4] placeholder:text-[#2d3142] placeholder:tracking-normal"
        />
        {auth.error && <p className="text-center text-[#ef4444] text-sm">{auth.error}</p>}
        <button
          onClick={handlePickerPin}
          disabled={submitting || !pin}
          className="w-full py-5 rounded-2xl bg-[#22c55e] text-black font-bold text-xl disabled:opacity-40 active:brightness-90 transition-all"
        >
          {submitting ? 'Checking…' : 'Sign in'}
        </button>
        <button onClick={() => { setStep('picker-select'); setPin(''); }} className="text-[#57606a] text-sm text-center w-full py-2">
          ← Back
        </button>
      </>
    );
  }

  // ── Step 2a: owner login ──────────────────────────────────────────────────
  if (step === 'owner-login') {
    return shell(
      <>
        <p className="text-center text-[#94a3b8] text-sm font-semibold uppercase tracking-wider">
          Owner sign in
        </p>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            value={ownerUser}
            onChange={(e) => setOwnerUser(e.target.value)}
            placeholder="Username"
            className="w-full py-4 px-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] text-lg focus:outline-none focus:border-[#0f62fe]"
          />
          <input
            type="password"
            value={ownerPass}
            onChange={(e) => setOwnerPass(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleOwnerLogin()}
            placeholder="Password"
            className="w-full py-4 px-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] text-lg focus:outline-none focus:border-[#0f62fe]"
          />
        </div>
        {auth.error && <p className="text-center text-[#ef4444] text-sm">{auth.error}</p>}
        <button
          onClick={handleOwnerLogin}
          disabled={submitting || !ownerUser || !ownerPass}
          className="w-full py-5 rounded-2xl bg-[#0f62fe] text-white font-bold text-xl disabled:opacity-40 active:brightness-90 transition-all"
        >
          {submitting ? 'Checking…' : 'Sign in'}
        </button>
        <button onClick={back} className="text-[#57606a] text-sm text-center w-full py-2">
          ← Back
        </button>
      </>
    );
  }

  // ── Step 2b: supervisor login ─────────────────────────────────────────────
  return shell(
    <>
      <p className="text-center text-[#94a3b8] text-sm font-semibold uppercase tracking-wider">
        Supervisor sign in
      </p>
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          type="text"
          value={supUser}
          onChange={(e) => setSupUser(e.target.value)}
          placeholder="Username"
          className="w-full py-4 px-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] text-lg focus:outline-none focus:border-[#06b6d4]"
        />
        <input
          type="password"
          value={supPass}
          onChange={(e) => setSupPass(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSupervisorLogin()}
          placeholder="Password"
          className="w-full py-4 px-4 rounded-2xl bg-[#1a1d27] border border-[#2d3142] text-[#e2e8f0] text-lg focus:outline-none focus:border-[#06b6d4]"
        />
      </div>
      {auth.error && <p className="text-center text-[#ef4444] text-sm">{auth.error}</p>}
      <button
        onClick={handleSupervisorLogin}
        disabled={submitting || !supUser || !supPass}
        className="w-full py-5 rounded-2xl bg-[#3b82d4] text-white font-bold text-xl disabled:opacity-40 active:brightness-90 transition-all"
      >
        {submitting ? 'Checking…' : 'Sign in'}
      </button>
      <button onClick={back} className="text-[#57606a] text-sm text-center w-full py-2">
        ← Back
      </button>
    </>
  );
}
