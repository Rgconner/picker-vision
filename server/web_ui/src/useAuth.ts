/**
 * useAuth — lightweight client-side auth for Picker Vision.
 *
 * Users are fetched from the order-service (/users) so the supervisor can
 * manage them without a redeploy.  Credentials are checked client-side
 * against the stored PIN/password hash (SHA-256, hex).  This is appropriate
 * for an internal warehouse tool — not a public internet application.
 *
 * Roles:
 *   picker     — can only access the Mobile (guided Lite) view
 *   supervisor — can access all views + Management
 *
 * Session is persisted in sessionStorage so a page refresh keeps the user
 * logged in for the browser session but a tab close requires re-login.
 */

import { useCallback, useEffect, useState } from 'react';

export type UserRole = 'picker' | 'supervisor' | 'guest';

export interface AppUser {
  id:         string;
  name:       string;
  role:       UserRole;
  picker_id:  string | null;   // only set for role=picker; matches picker registry
}

// Shape returned by the order-service /users endpoint
interface ApiUser {
  id:           string;
  name:         string;
  role:         UserRole;
  picker_id:    string | null;
  pin_hash:     string;        // SHA-256 hex of PIN/password
}

const SESSION_KEY = 'pv_session';

function loadSession(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch { return null; }
}

function saveSession(user: AppUser | null) {
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else       sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface AuthState {
  user:          AppUser | null;
  loading:       boolean;
  error:         string | null;
  users:         ApiUser[];          // full list — supervisor only; empty for pickers
  login:         (nameOrId: string, pin: string) => Promise<boolean>;
  loginAsGuest:  () => void;
  logout:        () => void;
  refresh:       () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser]       = useState<AppUser | null>(loadSession);
  const [users, setUsers]     = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) setUsers((await res.json()) as ApiUser[]);
    } catch { /* silent — server may not have this endpoint yet */ }
  }, []);

  // Load user list on mount so the login screen can show the picker list
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const login = useCallback(async (nameOrId: string, pin: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      // Re-fetch the latest user list so we always check against current data
      const res = await fetch('/api/users');
      const list: ApiUser[] = res.ok ? (await res.json()) : [];
      setUsers(list);

      const candidate = list.find(
        (u) => u.name.toLowerCase() === nameOrId.toLowerCase() ||
               u.picker_id?.toLowerCase() === nameOrId.toLowerCase() ||
               u.id === nameOrId,
      );
      if (!candidate) { setError('User not found'); return false; }

      const hash = await sha256hex(pin);
      if (hash !== candidate.pin_hash) { setError('Incorrect PIN'); return false; }

      const session: AppUser = {
        id:        candidate.id,
        name:      candidate.name,
        role:      candidate.role,
        picker_id: candidate.picker_id,
      };
      setUser(session);
      saveSession(session);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginAsGuest = useCallback(() => {
    const guest: AppUser = { id: 'guest', name: 'Guest', role: 'guest', picker_id: null };
    setUser(guest);
    saveSession(guest);
    // Navigate to the app — WelcomePage and App are separate renders
    window.location.href = '/app';
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    saveSession(null);
  }, []);

  const refresh = fetchUsers;

  return { user, loading, error, users, login, loginAsGuest, logout, refresh };
}
