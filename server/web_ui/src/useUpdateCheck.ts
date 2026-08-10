/**
 * useUpdateCheck — detects when a new build has been deployed.
 *
 * __APP_VERSION__ is stamped into the bundle at build time (GITHUB_SHA via Vite define).
 * The api-gateway /api/versions endpoint returns the version of the running server image,
 * which is also stamped with the same SHA at Docker build time.
 *
 * When the two differ, the running bundle is stale — a new deploy landed while the
 * browser was holding the old one. The hook returns `updateAvailable: true` so the
 * UI can prompt the picker to reload. One tap → window.location.reload() → fresh bundle.
 *
 * Never fires in local dev (both sides report 'dev' or 'unknown').
 */

import { useEffect, useState } from 'react';

declare const __APP_VERSION__: string;

const POLL_MS    = 30_000;   // check every 30 s — low-traffic, low cost
const BUNDLE_SHA = __APP_VERSION__;

export function useUpdateCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Never fire in local dev or if the bundle has no real SHA
    if (BUNDLE_SHA === 'dev' || BUNDLE_SHA === 'unknown') return;

    let active = true;

    async function check() {
      try {
        const res = await fetch('/api/versions', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as Record<string, { version?: string }>;
        const serverSha = data['api-gateway']?.version;
        if (active && serverSha && serverSha !== 'unknown' && serverSha !== BUNDLE_SHA) {
          setUpdateAvailable(true);
        }
      } catch { /* network blip — try again next poll */ }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return updateAvailable;
}
