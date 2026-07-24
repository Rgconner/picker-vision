import { useEffect, useRef, useState } from 'react';
import type { PickerState } from './types';

export function useSupervisorSocket() {
  const [states, setStates] = useState<Record<string, PickerState>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const ws = new WebSocket(`ws://${window.location.host}/ws/supervisor`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) setConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (unmountedRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as unknown;
          if (typeof msg === 'object' && msg !== null && 'picker_id' in msg) {
            const pickerState = msg as PickerState;
            setStates((prev) => ({ ...prev, [pickerState.picker_id]: pickerState }));
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current !== null) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, []);

  return { states, connected };
}
