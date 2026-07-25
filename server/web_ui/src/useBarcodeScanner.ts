/**
 * useBarcodeScanner — scans frames from a <video> element for barcodes.
 *
 * Strategy (in priority order):
 *   1. Native BarcodeDetector API (Chrome on Android — GPU-accelerated, fastest)
 *   2. ZXing-js (pure JS fallback — works everywhere including Firefox, Safari, Vuzix)
 *
 * Returns detected barcodes as lightweight scan results.  Scanning runs on a
 * requestAnimationFrame loop driven by the caller-supplied videoRef.
 *
 * The caller controls scanning via the `scanning` flag.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScanResult {
  value: string;
  symbology: string;   // 'qr_code' | 'code_128' | 'ean_13' | etc.
  type: 'product' | 'staging';
  stagingCode: string | null;
  /** Bounding box in VIDEO pixel coordinates */
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** Corner points in VIDEO pixel coordinates (4 pts) */
  corners: { x: number; y: number }[] | null;
}

// Minimal type shim for the native BarcodeDetector (not in all TS libs yet)
interface NativeBarcodeDetector {
  detect(image: HTMLVideoElement | HTMLCanvasElement): Promise<NativeBarcode[]>;
}
interface NativeBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}
declare const BarcodeDetector: {
  new(opts: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats(): Promise<string[]>;
};

// ZXing dynamic import — only loaded when native API is absent
let _zxingReader: { decodeFromVideoElement(el: HTMLVideoElement): Promise<{ getText(): string; getBarcodeFormat(): number }> } | null = null;

async function loadZXing() {
  if (_zxingReader) return _zxingReader;
  try {
    const zxing = await import('@zxing/library');
    const hints = new Map();
    const formats = [
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.DATA_MATRIX,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.CODE_39,
    ];
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, formats);
    _zxingReader = new zxing.BrowserMultiFormatReader(hints);
    return _zxingReader;
  } catch {
    return null;
  }
}

function nativeResultToScan(b: NativeBarcode): ScanResult {
  const value = b.rawValue;
  const isStaging = value.startsWith('STAGING:');
  const corners = b.cornerPoints?.map((p) => ({ x: p.x, y: p.y })) ?? null;
  const bb = b.boundingBox;
  return {
    value,
    symbology: b.format,
    type: isStaging ? 'staging' : 'product',
    stagingCode: isStaging ? value.slice(8, 12).toUpperCase() : null,
    bbox: bb ? { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) } : null,
    corners,
  };
}

function zxingResultToScan(text: string, formatNum: number): ScanResult {
  const isStaging = text.startsWith('STAGING:');
  // Map ZXing format numbers to names (most common subset)
  const fmtNames: Record<number, string> = {
    11: 'qr_code', 1: 'aztec', 4: 'code_128', 6: 'code_39',
    8: 'data_matrix', 3: 'ean_13', 2: 'ean_8',
  };
  return {
    value: text,
    symbology: fmtNames[formatNum] ?? `format_${formatNum}`,
    type: isStaging ? 'staging' : 'product',
    stagingCode: isStaging ? text.slice(8, 12).toUpperCase() : null,
    bbox: null,
    corners: null,
  };
}

export function useBarcodeScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  scanning: boolean,
  onDetect: (result: ScanResult) => void,
) {
  const rafRef        = useRef<number>(0);
  const nativeRef     = useRef<NativeBarcodeDetector | null>(null);
  const useNativeRef  = useRef<boolean | null>(null);
  const lastValueRef  = useRef<string>('');
  const lastTimeRef   = useRef<number>(0);
  const DEBOUNCE_MS   = 800; // same barcode must wait this long before re-firing

  const [engineReady, setEngineReady] = useState(false);

  // Initialise whichever engine is available
  useEffect(() => {
    async function init() {
      if (typeof BarcodeDetector !== 'undefined') {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          const want = ['qr_code', 'code_128', 'ean_13', 'data_matrix', 'code_39', 'ean_8'].filter(
            (f) => formats.includes(f),
          );
          nativeRef.current = new BarcodeDetector({ formats: want.length ? want : ['qr_code', 'code_128'] });
          useNativeRef.current = true;
          setEngineReady(true);
          return;
        } catch { /* fall through */ }
      }
      // ZXing fallback
      const reader = await loadZXing();
      useNativeRef.current = reader !== null ? false : null;
      setEngineReady(reader !== null);
    }
    init();
  }, []);

  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    try {
      const now = Date.now();
      if (useNativeRef.current && nativeRef.current) {
        const results = await nativeRef.current.detect(video);
        for (const r of results) {
          if (r.rawValue && (r.rawValue !== lastValueRef.current || now - lastTimeRef.current > DEBOUNCE_MS)) {
            lastValueRef.current = r.rawValue;
            lastTimeRef.current  = now;
            onDetect(nativeResultToScan(r));
          }
        }
      } else if (useNativeRef.current === false && _zxingReader) {
        // ZXing is continuous — the reader calls back on its own; no manual frame needed
      }
    } catch { /* ignore mid-scan errors */ }
  }, [videoRef, onDetect]);

  // rAF scanning loop for native API; ZXing manages its own loop
  useEffect(() => {
    if (!scanning || !engineReady) return;
    if (useNativeRef.current === false) {
      // ZXing continuous decode
      const video = videoRef.current;
      if (!video || !_zxingReader) return;
      let stopped = false;
      (async () => {
        try {
          // @ts-expect-error — ZXing reader type is dynamically loaded
          await (_zxingReader as { decodeFromVideoElementContinuously: (el: HTMLVideoElement, cb: (r: unknown, e: unknown) => void) => void })
            .decodeFromVideoElementContinuously(video, (result: unknown) => {
              if (stopped || !result) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const r = result as any;
              const text: string = r.getText?.() ?? '';
              const fmt: number  = r.getBarcodeFormat?.() ?? -1;
              const now = Date.now();
              if (text && (text !== lastValueRef.current || now - lastTimeRef.current > DEBOUNCE_MS)) {
                lastValueRef.current = text;
                lastTimeRef.current  = now;
                onDetect(zxingResultToScan(text, fmt));
              }
            });
        } catch { /* ignore */ }
      })();
      return () => { stopped = true; (_zxingReader as unknown as { reset?: () => void })?.reset?.(); };
    }

    // Native rAF loop
    let active = true;
    function loop() {
      if (!active) return;
      scan();
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [scanning, engineReady, scan, videoRef, onDetect]);

  return { engineReady, useNative: useNativeRef.current };
}
