/**
 * useBarcodeScanner — scans frames from a <video> element for barcodes.
 *
 * Uses @zxing/library (BrowserMultiFormatReader) exclusively.
 * Captures a canvas frame at ~1fps and decodes it — works on all browsers
 * including Chrome Android where BarcodeDetector silently fails.
 *
 * The caller controls scanning via the `scanning` flag.
 */

import React, { useEffect, useRef, useState } from 'react';
import { remoteLog } from './useRemoteLogger';

export interface ScanResult {
  value: string;
  symbology: string;
  type: 'product' | 'staging';
  stagingCode: string | null;
  bbox: { x: number; y: number; w: number; h: number } | null;
  corners: { x: number; y: number }[] | null;
}

// ZXing format number → name map
const FMT_NAMES: Record<number, string> = {
  1: 'aztec', 2: 'ean_8', 3: 'ean_13', 4: 'code_128',
  6: 'code_39', 8: 'data_matrix', 11: 'qr_code', 15: 'pdf_417',
};

function toScanResult(text: string, formatNum: number): ScanResult {
  const isStaging = text.startsWith('STAGING:');
  return {
    value:       text,
    symbology:   FMT_NAMES[formatNum] ?? `format_${formatNum}`,
    type:        isStaging ? 'staging' : 'product',
    stagingCode: isStaging ? text.slice(8, 12).toUpperCase() : null,
    bbox:        null,
    corners:     null,
  };
}

// Module-level reader singleton — loaded once, reused across hook instances
type ZXingReader = {
  decodeFromCanvas(canvas: HTMLCanvasElement): Promise<{ getText(): string; getBarcodeFormat(): number }>;
};
let _reader: ZXingReader | null = null;
let _readerLoading = false;
const _readerCallbacks: Array<() => void> = [];

async function getReader(): Promise<ZXingReader | null> {
  if (_reader) return _reader;
  if (_readerLoading) {
    return new Promise<ZXingReader | null>((resolve) => {
      _readerCallbacks.push(() => resolve(_reader));
    });
  }
  _readerLoading = true;
  try {
    const zxing = await import('@zxing/library');
    const hints = new Map();
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.DATA_MATRIX,
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.CODE_39,
    ]);
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    _reader = new zxing.BrowserMultiFormatReader(hints) as unknown as ZXingReader;
    console.info('[Scanner] ZXing BrowserMultiFormatReader ready');
    remoteLog('info', '[Scanner] ZXing ready');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[Scanner] ZXing load failed:', e);
    remoteLog('error', `[Scanner] ZXing load failed: ${msg}`);
  }
  _readerLoading = false;
  _readerCallbacks.forEach((cb) => cb());
  _readerCallbacks.length = 0;
  return _reader;
}

const SCAN_INTERVAL_MS = 250; // 4 attempts/sec — fast enough, doesn't hammer CPU

export function useBarcodeScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  scanning: boolean,
  onDetect: (result: ScanResult) => void,
) {
  const [engineReady, setEngineReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const lastValueRef = useRef<string>('');
  const lastTimeRef  = useRef<number>(0);
  const DEBOUNCE_MS  = 800;

  const onDetectRef = useRef(onDetect);
  useEffect(() => { onDetectRef.current = onDetect; }, [onDetect]);

  // Load ZXing on mount
  useEffect(() => {
    getReader().then((r) => {
      if (r) setEngineReady(true);
      else    setUnsupported(true);
    });
  }, []);

  // Scan loop — grabs canvas frame every SCAN_INTERVAL_MS
  useEffect(() => {
    if (!scanning || !engineReady) return;

    const canvas = document.createElement('canvas');
    let active    = true;
    let timer: ReturnType<typeof setTimeout>;
    let tickCount = 0;

    remoteLog('info', '[Scanner] scan loop started');

    async function tick() {
      if (!active) return;
      const video  = videoRef.current;
      const reader = await getReader();

      // Log first tick and every 50 ticks so we know the loop is alive
      tickCount++;
      if (tickCount === 1 || tickCount % 50 === 0) {
        const vstate = video ? `readyState:${video.readyState} ${video.videoWidth}x${video.videoHeight}` : 'no video';
        remoteLog('info', `[Scanner] tick #${tickCount} — ${vstate}`);
      }

      if (video && reader && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          try {
            const result = await reader.decodeFromCanvas(canvas);
            const text   = result.getText();
            const fmt    = result.getBarcodeFormat();
            const now    = Date.now();
            if (text && (text !== lastValueRef.current || now - lastTimeRef.current > DEBOUNCE_MS)) {
              lastValueRef.current = text;
              lastTimeRef.current  = now;
              remoteLog('info', `[Scanner] decoded: ${text} (fmt:${fmt})`);
              onDetectRef.current(toScanResult(text, fmt));
            }
          } catch {
            /* NotFoundException is normal — no code in frame */
          }
        }
      }
      if (active) timer = setTimeout(tick, SCAN_INTERVAL_MS);
    }

    tick();
    return () => {
      active = false;
      clearTimeout(timer);
      remoteLog('info', `[Scanner] scan loop stopped after ${tickCount} ticks`);
    };
  }, [scanning, engineReady, videoRef]);

  return { engineReady, unsupported, supportedFormats: [] as string[] };
}
