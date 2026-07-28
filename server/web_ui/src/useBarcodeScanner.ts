/**
 * useBarcodeScanner — scans frames from a <video> element for barcodes.
 *
 * Strategy (in priority order):
 *   1. Native BarcodeDetector API (Chrome Android — GPU-accelerated, ML Kit)
 *   2. ZXing-js canvas fallback (works everywhere: Firefox, Safari, Vuzix)
 *
 * Supported formats (deliberate narrow scope):
 *   - qr_code   — all picker-vision controlled labels (staging codes, printed products)
 *   - ean_13    — retail products off the shelf we don't control
 *   - ean_8     — short-form retail EAN
 *   - code_128  — warehouse / shipping labels we don't control
 *
 * Dropped: data_matrix (Samsung BarcodeDetector doesn't support it; no BTT use case),
 *          code_39, pdf_417 (no use case — adds detection noise).
 *
 * The caller controls scanning via the `scanning` flag.
 */

import React, { useEffect, useRef, useState } from 'react';
import { remoteLog } from './useRemoteLogger';

export interface ScanResult {
  value: string;
  symbology: string;
  type: 'product' | 'staging' | 'nav';
  stagingCode: string | null;
  navAction: string | null;   // e.g. 'CONFIRM' | 'SKIP' | 'BACK' | 'HELP'
  bbox: { x: number; y: number; w: number; h: number } | null;
  corners: { x: number; y: number }[] | null;
}

// ── Native BarcodeDetector types (not in all TS libs) ────────────────────────

interface NativeBarcodeDetector {
  detect(image: HTMLVideoElement | HTMLCanvasElement): Promise<NativeBarcode[]>;
}
interface NativeBarcode {
  rawValue:    string;
  format:      string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
};

// ── ZXing singleton — loaded once, reused across hook instances ──────────────

type ZXingReader = {
  decodeFromCanvas(canvas: HTMLCanvasElement): Promise<{ getText(): string; getBarcodeFormat(): number }>;
};
let _zxingReader: ZXingReader | null = null;
let _zxingLoading = false;
const _zxingCallbacks: Array<() => void> = [];

async function getZXingReader(): Promise<ZXingReader | null> {
  if (_zxingReader) return _zxingReader;
  if (_zxingLoading) {
    return new Promise<ZXingReader | null>((resolve) => {
      _zxingCallbacks.push(() => resolve(_zxingReader));
    });
  }
  _zxingLoading = true;
  try {
    const zxing = await import('@zxing/library');
    const hints = new Map();
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
    ]);
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    _zxingReader = new zxing.BrowserMultiFormatReader(hints) as unknown as ZXingReader;
    console.info('[Scanner] ZXing BrowserMultiFormatReader ready');
    remoteLog('info', '[Scanner] ZXing ready');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[Scanner] ZXing load failed:', e);
    remoteLog('error', `[Scanner] ZXing load failed: ${msg}`);
  }
  _zxingLoading = false;
  _zxingCallbacks.forEach((cb) => cb());
  _zxingCallbacks.length = 0;
  return _zxingReader;
}

// ── Result converters ────────────────────────────────────────────────────────

const ZXING_FMT_NAMES: Record<number, string> = {
  2: 'ean_8', 3: 'ean_13', 4: 'code_128', 11: 'qr_code',
};

function classifyValue(raw: string): Pick<ScanResult, 'type' | 'stagingCode' | 'navAction'> {
  if (raw.startsWith('NAV:')) {
    return { type: 'nav', stagingCode: null, navAction: raw.slice(4).toUpperCase() };
  }
  if (raw.startsWith('STAGING:')) {
    return { type: 'staging', stagingCode: raw.slice(8, 12).toUpperCase(), navAction: null };
  }
  return { type: 'product', stagingCode: null, navAction: null };
}

function nativeToScanResult(b: NativeBarcode): ScanResult {
  const bb = b.boundingBox;
  return {
    value:     b.rawValue,
    symbology: b.format,
    ...classifyValue(b.rawValue),
    bbox:    bb ? { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) } : null,
    corners: b.cornerPoints?.map((p) => ({ x: p.x, y: p.y })) ?? null,
  };
}

function zxingToScanResult(text: string, formatNum: number): ScanResult {
  return {
    value:     text,
    symbology: ZXING_FMT_NAMES[formatNum] ?? `format_${formatNum}`,
    ...classifyValue(text),
    bbox:    null,
    corners: null,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const SCAN_INTERVAL_MS = 250; // ZXing canvas poll — ~4fps
const DEBOUNCE_MS      = 800; // same value must wait this long before re-firing

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBarcodeScanner(
  videoRef:  React.RefObject<HTMLVideoElement | null>,
  scanning:  boolean,
  onDetect:  (result: ScanResult) => void,
) {
  const [engineReady, setEngineReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Which engine was selected: 'native' | 'zxing' | null
  const engineRef    = useRef<'native' | 'zxing' | null>(null);
  const nativeRef    = useRef<NativeBarcodeDetector | null>(null);
  const inFlightRef  = useRef(false);
  // Per-value debounce map — tracks last-fired time for each decoded value
  // independently so two simultaneous codes don't debounce each other.
  const debounceMap  = useRef<Map<string, number>>(new Map());

  // Stable callback ref — prevents re-triggering scan loop on parent re-renders
  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  // ── Engine initialisation ────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      // Try native BarcodeDetector first — no getSupportedFormats gate on
      // data_matrix because some Samsung builds omit it from the list even
      // though the API decodes it fine.
      if (typeof BarcodeDetector !== 'undefined') {
        try {
          const FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'data_matrix', 'code_39'];
          nativeRef.current  = new BarcodeDetector({ formats: FORMATS });
          engineRef.current  = 'native';
          remoteLog('info', '[Scanner] engine=BarcodeDetector (native)');
          console.info('[Scanner] engine=BarcodeDetector (native)');
          setEngineReady(true);
          return;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          remoteLog('warn', `[Scanner] BarcodeDetector init failed: ${msg} — falling back to ZXing`);
          console.warn('[Scanner] BarcodeDetector init failed, falling back to ZXing:', e);
        }
      } else {
        remoteLog('info', '[Scanner] BarcodeDetector unavailable — using ZXing');
        console.info('[Scanner] BarcodeDetector unavailable — using ZXing');
      }

      // ZXing fallback
      const reader = await getZXingReader();
      if (reader) {
        engineRef.current = 'zxing';
        remoteLog('info', '[Scanner] engine=ZXing (canvas fallback)');
        setEngineReady(true);
      } else {
        setUnsupported(true);
      }
    }
    init();
  }, []);

  // ── Scan loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!scanning || !engineReady) return;

    let active    = true;
    let tickCount = 0;

    remoteLog('info', `[Scanner] scan loop started (engine=${engineRef.current})`);

    if (engineRef.current === 'native') {
      // Native: rAF loop — await detect() before next frame to avoid races
      const rafRef = { id: 0 };
      async function nativeLoop() {
        if (!active) return;
        if (!inFlightRef.current) {
          inFlightRef.current = true;
          const video = videoRef.current;
          tickCount++;
          if (tickCount === 1 || tickCount % 100 === 0) {
            const vstate = video ? `readyState:${video.readyState} ${video.videoWidth}x${video.videoHeight}` : 'no video';
            remoteLog('info', `[Scanner] tick #${tickCount} — ${vstate}`);
          }
          if (video && video.readyState >= 2 && video.videoWidth > 0 && nativeRef.current) {
            try {
              const results = await nativeRef.current.detect(video);
              const now = Date.now();
              for (const r of results) {
                if (!r.rawValue) continue;
                const last = debounceMap.current.get(r.rawValue) ?? 0;
                if (now - last > DEBOUNCE_MS) {
                  debounceMap.current.set(r.rawValue, now);
                  remoteLog('info', `[Scanner] decoded: ${r.rawValue} (fmt:${r.format})`);
                  onDetectRef.current(nativeToScanResult(r));
                }
              }
            } catch { /* ignore mid-scan errors */ }
          }
          inFlightRef.current = false;
        }
        if (active) rafRef.id = requestAnimationFrame(nativeLoop);
      }
      rafRef.id = requestAnimationFrame(nativeLoop);
      return () => {
        active = false;
        cancelAnimationFrame(rafRef.id);
        remoteLog('info', `[Scanner] scan loop stopped after ${tickCount} ticks`);
      };

    } else {
      // ZXing: canvas poll at SCAN_INTERVAL_MS
      const canvas = document.createElement('canvas');
      let timer: ReturnType<typeof setTimeout>;

      async function zxingTick() {
        if (!active) return;
        const video  = videoRef.current;
        const reader = await getZXingReader();
        tickCount++;
        if (tickCount === 1 || tickCount % 50 === 0) {
          const vstate = video ? `readyState:${video.readyState} ${video.videoWidth}x${video.videoHeight}` : 'no video';
          remoteLog('info', `[Scanner] tick #${tickCount} — ${vstate}`);
        }
        if (video && reader && video.readyState >= 2 && video.videoWidth > 0) {
          const shortSide = Math.min(video.videoWidth, video.videoHeight);
          const scale     = Math.min(1, 480 / shortSide);
          canvas.width  = Math.round(video.videoWidth  * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          if (tickCount === 1 || tickCount % 50 === 0) {
            remoteLog('info', `[Scanner] canvas: ${canvas.width}x${canvas.height} (scale:${scale.toFixed(3)})`);
          }
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const result = await reader.decodeFromCanvas(canvas);
              const text   = result.getText();
              const fmt    = result.getBarcodeFormat();
              const now    = Date.now();
              if (text) {
                const last = debounceMap.current.get(text) ?? 0;
                if (now - last > DEBOUNCE_MS) {
                  debounceMap.current.set(text, now);
                  remoteLog('info', `[Scanner] decoded: ${text} (fmt:${fmt})`);
                  onDetectRef.current(zxingToScanResult(text, fmt));
                }
              }
            } catch { /* NotFoundException is normal — no code in frame */ }
          }
        }
        if (active) timer = setTimeout(zxingTick, SCAN_INTERVAL_MS);
      }

      zxingTick();
      return () => {
        active = false;
        clearTimeout(timer);
        remoteLog('info', `[Scanner] scan loop stopped after ${tickCount} ticks`);
      };
    }
  }, [scanning, engineReady, videoRef]);

  return { engineReady, unsupported, supportedFormats: [] as string[] };
}
