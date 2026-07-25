import { useEffect, useState } from 'react';
import type { ServiceVersions } from './types';

export function useServiceVersions() {
  const [versions, setVersions] = useState<ServiceVersions>({});

  useEffect(() => {
    let active = true;

    async function fetchVersions() {
      try {
        const res = await fetch('/api/versions');
        if (!res.ok) return;
        const data = (await res.json()) as ServiceVersions;
        if (active) setVersions(data);
      } catch {
        // ignore
      }
    }

    fetchVersions();
    const interval = setInterval(fetchVersions, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return versions;
}
