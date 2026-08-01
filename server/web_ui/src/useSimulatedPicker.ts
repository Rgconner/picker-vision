/**
 * useSimulatedPicker — simulates a single mobile picker agent in the browser.
 *
 * Faithfully reproduces the full lifecycle of useMobilePickerSession but
 * driven by timers rather than a camera, with a configurable noise model:
 *   - Miscan: wrong product sent before the correct one
 *   - Multi-scan: 2–3 barcodes in one detection event
 *   - Duplicate scan: same barcode twice in one detections[] array
 *   - Staging region: QR code polygon included with configurable probability
 *   - Bbox geometry: realistic random coordinates in a 640×480 virtual viewport
 *   - Timing jitter: ±20% Gaussian variation on scan interval
 *
 * Used by LoadGenView to power the Load Generator tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ── BTT product catalogue (mirrors server/order_service/main.py _BTT_PRODUCTS) ─

const BTT_PRODUCTS = [
  'BTT-00101', 'BTT-00102', 'BTT-00103',
  'BTT-00201', 'BTT-00202', 'BTT-00203',
  'BTT-00301', 'BTT-00302', 'BTT-00303',
];

const BTT_STAGING = ['TINY', 'WOND', 'CHRM'];

// ── Configuration ─────────────────────────────────────────────────────────────

export interface SimPickerConfig {
  /** Picker ID — will register as this ID (e.g. "sim-01") */
  pickerId: string;
  /** Base milliseconds between scan events (default 800) */
  scanIntervalMs: number;
  /** 0–1: probability a wrong product is sent before the correct one (default 0.10) */
  misscanRate: number;
  /** 0–1: probability 2–3 barcodes appear in one detection event (default 0.25) */
  multiScanRate: number;
  /** 0–1: probability target barcode appears twice in one event (default 0.15) */
  duplicateRate: number;
  /** 0–1: probability a staging_regions entry accompanies a detection (default 0.60) */
  stagingRate: number;
  /** Passed to demo/start mistake_probability (default 0) */
  mistakeProbability: number;
  /** If true, the hook calls POST /api/demo/start itself on start() (default true) */
  autoStart: boolean;
}

export const DEFAULT_SIM_CONFIG: Omit<SimPickerConfig, 'pickerId'> = {
  scanIntervalMs:    800,
  misscanRate:       0.10,
  multiScanRate:     0.25,
  duplicateRate:     0.15,
  stagingRate:       0.60,
  mistakeProbability: 0,
  autoStart:         true,
};

// ── State ─────────────────────────────────────────────────────────────────────

export type SimPickerStatus = 'idle' | 'registering' | 'running' | 'done' | 'error';

export interface SimPickerState {
  status:               SimPickerStatus;
  connected:            boolean;
  currentOrderId:       string | null;
  ordersCompleted:      number;
  /** Total detection POSTs issued (each may contain multiple barcodes) */
  scansSent:            number;
  /** Number of barcodes in the most recent detection POST */
  barcodesInLastScan:   number;
  /** Successful PATCH /lines/{id} calls */
  picksConfirmed:       number;
  /** Wrong-barcode events sent deliberately */
  miscans:              number;
  /** Multi-barcode events sent */
  multiScans:           number;
  /** HTTP errors + WS reconnects */
  errors:               number;
  lastEventAt:          string | null;
  lastWsMessageAt:      string | null;
}

export interface SimPickerHandle {
  state:  SimPickerState;
  start:  () => void;
  stop:   () => void;
}

// ── Viewport geometry helpers ─────────────────────────────────────────────────

const VIEW_W = 640;
const VIEW_H = 480;

interface BboxResult {
  x: number; y: number; w: number; h: number;
}

function _randomBbox(): BboxResult {
  const bw = 40 + Math.random() * 80;   // 40–120 px wide
  const bh = 25 + Math.random() * 35;   // 25–60 px tall
  const x  = Math.random() * (VIEW_W - bw);
  const y  = Math.random() * (VIEW_H - bh);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(bw), h: Math.round(bh) };
}

function _buildDetection(barcode: string, stagingCode: string | null) {
  const { x, y, w, h } = _randomBbox();
  return {
    symbology:    'QR_CODE',
    value:        barcode,
    bbox:         [x, y, w, h] as [number, number, number, number],
    centre:       [Math.round(x + w / 2), Math.round(y + h / 2)] as [number, number],
    type:         'product' as const,
    staging_code: stagingCode,
    corners:      [
      [x,     y    ],
      [x + w, y    ],
      [x + w, y + h],
      [x,     y + h],
    ] as [number, number][],
    active: true,
  };
}

function _buildStagingRegion(stagingCode: string) {
  // Roughly centred polygon ~200×200 px
  const cx = VIEW_W / 2, cy = VIEW_H / 2, hw = 100, hh = 100;
  return {
    staging_code:    stagingCode,
    boundary_points: [
      [cx - hw, cy - hh],
      [cx + hw, cy - hh],
      [cx + hw, cy + hh],
      [cx - hw, cy + hh],
    ] as [number, number][],
    centre: [cx, cy] as [number, number],
    area:   hw * hh * 4,
  };
}

function _jitteredDelay(base: number): number {
  // ±20% Gaussian approximation via Box-Muller
  const u1 = Math.random(), u2 = Math.random();
  const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(100, base + z * base * 0.2);
}

function _randomOtherBtts(exclude: string, count: number): string[] {
  const pool = BTT_PRODUCTS.filter((p) => p !== exclude);
  const result: string[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count && i < shuffled.length; i++) result.push(shuffled[i]);
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSimulatedPicker(config: SimPickerConfig): SimPickerHandle {
  const [state, setState] = useState<SimPickerState>({
    status:             'idle',
    connected:          false,
    currentOrderId:     null,
    ordersCompleted:    0,
    scansSent:          0,
    barcodesInLastScan: 0,
    picksConfirmed:     0,
    miscans:            0,
    multiScans:         0,
    errors:             0,
    lastEventAt:        null,
    lastWsMessageAt:    null,
  });

  // Mutable ref mirrors state so the async scan loop always reads current values
  const metricsRef = useRef<SimPickerState>({ ...state });
  function _patch(partial: Partial<SimPickerState>) {
    const next = { ...metricsRef.current, ...partial };
    metricsRef.current = next;
    setState({ ...next });
  }

  const activeRef         = useRef(false);
  const wsRef             = useRef<WebSocket | null>(null);
  const heartbeatTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configRef         = useRef(config);
  configRef.current       = config;

  // WS ack: resolve a waiting promise when an enriched message arrives
  const wsAckResolveRef   = useRef<((msg: Record<string, unknown>) => void) | null>(null);

  // ── Register ───────────────────────────────────────────────────────────────

  const register = useCallback(async (): Promise<void> => {
    const id = configRef.current.pickerId;
    try {
      await fetch('/pickers/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picker_id:   id,
          stream_url:  '',
          control_url: '',
          version:     'sim-agent-1.0',
          device_id:   `sim-device-${id}`,
          user_agent:  `SimulatedPicker/${id}`,
        }),
      });
    } catch {
      // heartbeat will retry
    }
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (!activeRef.current) return;
    const id     = configRef.current.pickerId;
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws     = new WebSocket(`${scheme}//${window.location.host}/ws/${id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (activeRef.current) _patch({ connected: true });
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (!activeRef.current) return;
      _patch({ lastWsMessageAt: new Date().toISOString() });
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (msg['type'] !== 'ping' && wsAckResolveRef.current) {
          wsAckResolveRef.current(msg);
          wsAckResolveRef.current = null;
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!activeRef.current) return;
      _patch({ connected: false });
      reconnectTimer.current = setTimeout(connectWs, 2000);
    };

    ws.onerror = () => ws.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  async function _post(url: string, body: unknown): Promise<Response | null> {
    try {
      return await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
    } catch {
      _patch({ errors: metricsRef.current.errors + 1 });
      return null;
    }
  }

  async function _patch_pick(orderId: string, lineId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/orders/${orderId}/lines/${lineId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    '{}',
      });
      return res.ok;
    } catch {
      _patch({ errors: metricsRef.current.errors + 1 });
      return false;
    }
  }

  function _waitForWsAck(timeoutMs: number): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        wsAckResolveRef.current = null;
        resolve({});
      }, timeoutMs);
      wsAckResolveRef.current = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
    });
  }

  // ── Scan loop ──────────────────────────────────────────────────────────────

  async function _processLine(
    orderId: string,
    lineId: string,
    targetBarcode: string,
    stagingCode: string,
  ): Promise<void> {
    const cfg = configRef.current;

    // 1. Possible miscan — send wrong product first
    if (Math.random() < cfg.misscanRate) {
      const wrongBarcode = _randomOtherBtts(targetBarcode, 1)[0];
      const wrongPayload = {
        picker_id:       cfg.pickerId,
        timestamp:       new Date().toISOString(),
        trace_id:        Math.random().toString(16).slice(2, 10),
        detections:      [_buildDetection(wrongBarcode, null)],
        staging_regions: [],
      };
      await _post('/events/detection', wrongPayload);
      _patch({
        scansSent:          metricsRef.current.scansSent + 1,
        miscans:            metricsRef.current.miscans + 1,
        barcodesInLastScan: 1,
        lastEventAt:        new Date().toISOString(),
      });
      await new Promise((r) => setTimeout(r, _jitteredDelay(cfg.scanIntervalMs / 2)));
    }

    if (!activeRef.current) return;

    // 2. Build the correct detection
    const detections = [_buildDetection(targetBarcode, stagingCode)];

    // 2a. Multi-scan: add 1–2 extra non-target barcodes
    const isMulti = Math.random() < cfg.multiScanRate;
    if (isMulti) {
      const extras = _randomOtherBtts(targetBarcode, 1 + Math.floor(Math.random() * 2));
      extras.forEach((bc) => detections.push(_buildDetection(bc, null)));
    }

    // 2b. Duplicate: add target barcode a second time
    if (Math.random() < cfg.duplicateRate) {
      detections.push(_buildDetection(targetBarcode, stagingCode));
    }

    // 3. Staging region (probabilistic)
    const staging_regions = Math.random() < cfg.stagingRate
      ? [_buildStagingRegion(stagingCode || BTT_STAGING[0])]
      : [];

    const payload = {
      picker_id:       cfg.pickerId,
      timestamp:       new Date().toISOString(),
      trace_id:        Math.random().toString(16).slice(2, 10),
      detections,
      staging_regions,
    };

    // Start listening for WS ack before posting
    const ackPromise = _waitForWsAck(3000);
    await _post('/events/detection', payload);
    _patch({
      scansSent:          metricsRef.current.scansSent + 1,
      barcodesInLastScan: detections.length,
      lastEventAt:        new Date().toISOString(),
      ...(isMulti ? { multiScans: metricsRef.current.multiScans + 1 } : {}),
    });

    // Wait for enriched WS reply or timeout
    await ackPromise;

    if (!activeRef.current) return;

    // 4. Confirm the pick
    const ok = await _patch_pick(orderId, lineId);
    if (ok) _patch({ picksConfirmed: metricsRef.current.picksConfirmed + 1 });
  }

  async function _runOrderLoop(): Promise<void> {
    const cfg = configRef.current;

    while (activeRef.current) {
      // Fetch current demo session state for this picker
      let sessionOrderId: string | null = null;
      try {
        const res = await fetch('/api/demo/status');
        if (res.ok) {
          const sessions: { picker_id: string; current_order_id: string | null }[] = await res.json();
          const mine = sessions.find((s) => s.picker_id === cfg.pickerId);
          sessionOrderId = mine?.current_order_id ?? null;
        }
      } catch { /* retry next iteration */ }

      if (!sessionOrderId) {
        // Demo not started yet or ended — wait and retry
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      _patch({ currentOrderId: sessionOrderId });

      // Fetch order lines
      let pendingLines: { id: string; product_barcode: string; staging_code: string; status: string; quantity: number; quantity_picked: number }[] = [];
      try {
        const res = await fetch(`/api/orders/${sessionOrderId}`);
        if (res.ok) {
          const order = await res.json();
          pendingLines = (order.lines ?? []).filter(
            (l: { status: string; quantity: number; quantity_picked: number }) =>
              l.status === 'pending' || (l.status === 'picked' && l.quantity_picked < l.quantity)
          );
        }
      } catch { /* fall through */ }

      if (!activeRef.current) break;

      // Process each pending line
      for (const line of pendingLines) {
        if (!activeRef.current) break;
        await _processLine(sessionOrderId, line.id, line.product_barcode, line.staging_code);
        await new Promise((r) => setTimeout(r, _jitteredDelay(cfg.scanIntervalMs)));
      }

      if (!activeRef.current) break;

      // Advance to next order
      const advRes = await _post('/api/demo/advance', {
        order_id:  sessionOrderId,
        picker_id: cfg.pickerId,
      });

      if (advRes?.ok) {
        const advBody = await advRes.json();
        if (advBody.done) {
          _patch({ status: 'done', currentOrderId: null });
          return;
        }
        _patch({ ordersCompleted: metricsRef.current.ordersCompleted + 1 });
      }

      // Brief pause before next order
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Public controls ────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;

    _patch({ status: 'registering' });

    await register();

    // Heartbeat every 25s
    heartbeatTimer.current = setInterval(() => register(), 25_000);

    connectWs();

    // Auto-start demo session if configured
    if (configRef.current.autoStart) {
      await _post('/api/demo/start', {
        mode:                'personal',
        picker_id:           configRef.current.pickerId,
        mistake_probability: configRef.current.mistakeProbability,
      });
    }

    _patch({ status: 'running' });
    _runOrderLoop();
  }, [register, connectWs]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    activeRef.current = false;
    clearInterval(heartbeatTimer.current!);
    clearTimeout(reconnectTimer.current!);
    wsRef.current?.close();
    wsRef.current = null;
    wsAckResolveRef.current = null;
    _patch({ status: 'idle', connected: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearInterval(heartbeatTimer.current!);
      clearTimeout(reconnectTimer.current!);
      wsRef.current?.close();
    };
  }, []);

  return { state, start, stop };
}
