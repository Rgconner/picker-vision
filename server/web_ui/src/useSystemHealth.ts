import { useEffect, useRef, useState } from 'react';
import type { SystemTelemetry } from './types';

const POLL_INTERVAL = 10_000;

export function useSystemHealth() {
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    async function fetch_() {
      try {
        const res = await fetch('/api/telemetry');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SystemTelemetry;
        if (activeRef.current) {
          setTelemetry(data);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (activeRef.current) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    fetch_();
    const id = setInterval(fetch_, POLL_INTERVAL);
    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, []);

  return { telemetry, loading, error };
}
