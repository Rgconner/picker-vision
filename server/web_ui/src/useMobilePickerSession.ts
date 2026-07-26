/**
 * useMobilePickerSession — registers the phone as a picker node, publishes
 * barcode detection events to the server, and subscribes to enriched state
 * via WebSocket.
 *
 * The phone acts as a Pi replacement:
 *   - POST /pickers/register  (heartbeat every 25s)
 *   - POST /events/detection  (on each barcode scan)
 *   - WS   /ws/{picker_id}    (receive enriched order state)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickerState, ValidationResult } from './types';
import type { ScanResult } from './useBarcodeScanner';

export interface MobilePickerSessionState {
  connected: boolean;
  pickerState: PickerState | null;
  validationResult: ValidationResult | null;
  lastScan: ScanResult | null;
  publish: (scan: ScanResult) => void;
  sendAction: (action: 'start' | 'stop' | 'validate') => void;
}

export function useMobilePickerSession(pickerId: string | null): MobilePickerSessionState {
  const [connected, setConnected]             = useState(false);
  const [pickerState, setPickerState]         = useState<PickerState | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastScan, setLastScan]               = useState<ScanResult | null>(null);

  const wsRef             = useRef<WebSocket | null>(null);
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef         = useRef(false);
  const pickerIdRef       = useRef<string | null>(null);

  // Pending events buffered while offline (simple in-memory queue for POC)
  const offlineQueue      = useRef<object[]>([]);
  const flushingRef       = useRef(false);

  // Coalescing buffer — accumulate scans within a 300 ms window then flush
  // as a single event so the server receives all visible codes together.
  const scanBufferRef     = useRef<ScanResult[]>([]);
  const coalesceTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const COALESCE_MS       = 300;

  // ── Registration + heartbeat ───────────────────────────────────────────────

  const register = useCallback(async (id: string) => {
    try {
      await fetch('/pickers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picker_id:   id,
          stream_url:  '',          // mobile node — no MJPEG stream
          control_url: '',
          version:     'mobile-web-1.0',
        }),
      });
    } catch { /* silent — heartbeat will retry */ }
  }, []);

  // ── WebSocket subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!pickerId) return;
    pickerIdRef.current = pickerId;
    activeRef.current   = true;

    register(pickerId);

    // Heartbeat every 25s (server TTL is 120s, stale threshold 45s)
    heartbeatTimer.current = setInterval(() => {
      if (pickerIdRef.current) register(pickerIdRef.current);
    }, 25_000);

    function connect() {
      if (!activeRef.current || !pickerIdRef.current) return;
      const ws = new WebSocket(`ws://${window.location.host}/ws/${pickerIdRef.current}`);
      wsRef.current = ws;

      ws.onopen = () => { if (activeRef.current) setConnected(true); };

      ws.onmessage = (ev: MessageEvent) => {
        if (!activeRef.current) return;
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          if (msg['type'] === 'validation_result') {
            setValidationResult(msg as unknown as ValidationResult);
          } else {
            setPickerState(msg as unknown as PickerState);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!activeRef.current) return;
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      activeRef.current = false;
      clearInterval(heartbeatTimer.current!);
      clearTimeout(reconnectTimer.current!);
      clearTimeout(coalesceTimer.current!);
      scanBufferRef.current = [];
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setPickerState(null);
      setValidationResult(null);
    };
  }, [pickerId, register]);

  // ── Event publishing ───────────────────────────────────────────────────────

  async function _postEvent(payload: object): Promise<boolean> {
    try {
      const res = await fetch('/events/detection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function _flushQueue() {
    if (flushingRef.current || offlineQueue.current.length === 0) return;
    flushingRef.current = true;
    while (offlineQueue.current.length > 0) {
      const evt = offlineQueue.current[0];
      const ok  = await _postEvent(evt);
      if (ok) {
        offlineQueue.current.shift();
      } else {
        break; // still offline — leave in queue
      }
    }
    flushingRef.current = false;
  }

  const publish = useCallback((scan: ScanResult) => {
    if (!pickerIdRef.current) return;
    setLastScan(scan);

    // Add to coalesce buffer
    scanBufferRef.current.push(scan);

    // Reset the coalesce window — fire 300 ms after the last scan in the burst
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
    coalesceTimer.current = setTimeout(() => {
      const id = pickerIdRef.current;
      if (!id) return;

      const scans = scanBufferRef.current;
      scanBufferRef.current = [];

      const toDetection = (s: ScanResult) => ({
        symbology:    s.symbology,
        value:        s.value,
        bbox:         s.bbox ? [s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h] : [0, 0, 0, 0],
        centre:       s.bbox
          ? [Math.round(s.bbox.x + s.bbox.w / 2), Math.round(s.bbox.y + s.bbox.h / 2)]
          : [0, 0],
        type:         s.type,
        staging_code: s.stagingCode,
        corners:      s.corners?.map((c) => [c.x, c.y]) ?? [],
        active:       true,
      });

      const payload = {
        picker_id:       id,
        timestamp:       new Date().toISOString(),
        detections:      scans.filter((s) => s.type === 'product').map(toDetection),
        staging_regions: scans
          .filter((s) => s.type === 'staging')
          .map((s) => ({
            staging_code:    s.stagingCode,
            boundary_points: s.corners?.map((c) => [c.x, c.y]) ?? [],
            centre:          s.bbox
              ? [Math.round(s.bbox.x + s.bbox.w / 2), Math.round(s.bbox.y + s.bbox.h / 2)]
              : [0, 0],
            area:            s.bbox ? s.bbox.w * s.bbox.h : 0,
          })),
      };

      _postEvent(payload).then((ok) => {
        if (!ok) offlineQueue.current.push(payload);
        else _flushQueue();
      });
    }, COALESCE_MS);
  }, []);

  // ── Control actions (start / stop / validate) ─────────────────────────────

  const sendAction = useCallback((action: 'start' | 'stop' | 'validate') => {
    if (!pickerIdRef.current) return;

    // For validate, publish a validation event directly to the server
    if (action === 'validate') {
      const payload = {
        picker_id:       pickerIdRef.current,
        timestamp:       new Date().toISOString(),
        action:          'validate',
        detections:      pickerState?.detections ?? [],
        staging_regions: pickerState?.staging_regions ?? [],
      };
      _postEvent(payload);
      return;
    }

    // start / stop — POST to the Pi control endpoint; mobile has no Pi so
    // we just reset local state for start and clear scan history for stop.
    if (action === 'stop') {
      setPickerState(null);
      setLastScan(null);
    }
  }, [pickerState]);

  return { connected, pickerState, validationResult, lastScan, publish, sendAction };
}
