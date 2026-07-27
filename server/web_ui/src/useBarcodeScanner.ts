/**
 * useBarcodeScanner — scans frames from a <video> element for barcodes.
 *
 * Uses the native BarcodeDetector API exclusively.
 * Requires Chrome on Android (or any browser that ships BarcodeDetector).
 * If the API is unavailable or data_matrix is not in supported formats,
 * scanning is disabled and engineReady stays false — the caller should
 * surface a "unsupported browser" message.
 *
 * Scanning runs on a requestAnimationFrame loop. The caller controls
 * scanning via the `scanning` flag.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ScanResult {
  value: string;
  symbology: string;
  type: 'product' | 'staging';
  stagingCode: string | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  corners: { x: number; y: number }[] | null;
}

// Type shim — BarcodeDetector is not in all TS lib versions yet
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

function nativeResultToScan(b: NativeBarcode): ScanResult {
  const value     = b.rawValue;
  const isStaging = value.startsWith('STAGING:');
  const corners   = b.cornerPoints?.map((p) => ({ x: p.x, y: p.y })) ?? null;
  const bb        = b.boundingBox;
  return {
    value,
    symbology:   b.format,
    type:        isStaging ? 'staging' : 'product',
    stagingCode: isStaging ? value.slice(8, 12).toUpperCase() : null,
    bbox:        bb ? { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width), h: Math.round(bb.height) } : null,
    corners,
  };
}

export function useBarcodeScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  scanning: boolean,
  onDetect: (result: ScanResult) => void,
) {
  const detectorRef   = useRef<NativeBarcodeDetector | null>(null);
  const lastValueRef  = useRef<string>('');
  const lastTimeRef   = useRef<number>(0);
  const inFlightRef   = useRef<boolean>(false);
  const rafRef        = useRef<number>(0);
  const DEBOUNCE_MS   = 800;

  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  const [engineReady, setEngineReady]       = useState(false);
  const [unsupported, setUnsupported]       = useState(false);
  const [supportedFormats, setSupportedFormats] = useState<string[]>([]);

  // Initialise native BarcodeDetector
  useEffect(() => {
    async function init() {
      if (typeof BarcodeDetector === 'undefined') {
        console.warn('[BarcodeDetector] API not available in this browser');
        setUnsupported(true);
        return;
      }
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        setSupportedFormats(formats);

        // Request all useful formats the device supports
        const want = [
          'data_matrix', 'qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39',
        ].filter((f) => formats.includes(f));

        if (!want.includes('data_matrix')) {
          console.warn('[BarcodeDetector] data_matrix not supported on this device. Supported:', formats);
          setUnsupported(true);
          return;
        }

        detectorRef.current = new BarcodeDetector({ formats: want });
        console.info('[BarcodeDetector] ready with formats:', want);
        setEngineReady(true);
      } catch (e) {
        console.warn('[BarcodeDetector] init failed:', e);
        setUnsupported(true);
      }
    }
    init();
  }, []);

  const scan = useCallback(async () => {
    const video    = videoRef.current;
    const detector = detectorRef.current;
    if (!video || video.readyState < 2 || !detector) return;
    try {
      const results = await detector.detect(video);
      const now     = Date.now();
      for (const r of results) {
        if (
          r.rawValue &&
          (r.rawValue !== lastValueRef.current || now - lastTimeRef.current > DEBOUNCE_MS)
        ) {
          lastValueRef.current = r.rawValue;
          lastTimeRef.current  = now;
          onDetectRef.current(nativeResultToScan(r));
        }
      }
    } catch { /* ignore mid-scan errors */ }
  }, [videoRef]);

  // rAF loop — await scan() before scheduling next frame to prevent overlapping calls
  useEffect(() => {
    if (!scanning || !engineReady) return;
    let active = true;
    async function loop() {
      if (!active) return;
      if (!inFlightRef.current) {
        inFlightRef.current = true;
        await scan();
        inFlightRef.current = false;
      }
      if (active) rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [scanning, engineReady, scan]);

  return { engineReady, unsupported, supportedFormats };
}
