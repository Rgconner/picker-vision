import { useEffect, useRef, useState } from 'react';
import type { PickerState, ValidationResult } from './types';

export function usePickerSocket(pickerId: string | null) {
  const [state, setState] = useState<PickerState | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!pickerId) return;

    activeRef.current = true;
    const id = pickerId; // narrow to string for use inside closures

    function connect() {
      if (!activeRef.current) return;

      const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsScheme}//${window.location.host}/ws/${id}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (activeRef.current) setConnected(true);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!activeRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as unknown;
          if (
            typeof msg === 'object' &&
            msg !== null &&
            'type' in msg &&
            (msg as Record<string, unknown>)['type'] === 'validation_result'
          ) {
            setValidationResult(msg as ValidationResult);
          } else {
            setState(msg as PickerState);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!activeRef.current) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      activeRef.current = false;
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setState(null);
      setValidationResult(null);
      setConnected(false);
    };
  }, [pickerId]);

  return { state, validationResult, connected };
}
