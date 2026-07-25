/**
 * useStreamStats — measures MJPEG stream throughput in real time.
 *
 * Opens the stream URL via fetch() and reads its body as a ReadableStream,
 * counting bytes received per second.  Reports:
 *   - kbps          — kilobits per second (sampled over 1s window)
 *   - fps           — JPEG frames decoded per second (counts MJPEG boundaries)
 *   - status        — 'connecting' | 'streaming' | 'stalled' | 'error' | 'offline'
 *   - lastFrameAge  — ms since the last JPEG boundary was seen
 *
 * The fetch is torn down and restarted whenever streamUrl changes or the
 * component unmounts.  A stall is declared if no bytes arrive for 3 seconds.
 */

import { useEffect, useRef, useState } from 'react';

export type StreamStatus = 'connecting' | 'streaming' | 'stalled' | 'error' | 'offline';

export interface StreamStats {
  kbps:         number;        // kilobits/s averaged over last sample window
  fps:          number;        // frames/s averaged over last sample window
  status:       StreamStatus;
  lastFrameAge: number;        // ms since last frame boundary seen (0 = never)
  bytesTotal:   number;        // cumulative bytes received this session
}

const STALL_MS       = 3_000;   // declare stall after this many ms without bytes
const SAMPLE_WINDOW  = 1_000;   // recalculate stats every N ms
const MJPEG_BOUNDARY = '--frame';

function initialStats(): StreamStats {
  return { kbps: 0, fps: 0, status: 'offline', lastFrameAge: 0, bytesTotal: 0 };
}

export function useStreamStats(streamUrl: string | null | undefined): StreamStats {
  const [stats, setStats] = useState<StreamStats>(initialStats);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!streamUrl) {
      setStats(initialStats());
      return;
    }

    let cancelled = false;
    const ctrl    = new AbortController();
    abortRef.current = ctrl;

    // Running accumulators (reset each sample window)
    let windowBytes  = 0;
    let windowFrames = 0;
    let totalBytes   = 0;
    let lastByteAt   = Date.now();
    let lastFrameAt  = 0;
    let windowStart  = Date.now();

    // Ticker — fires every SAMPLE_WINDOW ms to push stats into React state
    const ticker = setInterval(() => {
      if (cancelled) return;
      const now      = Date.now();
      const elapsed  = now - windowStart;
      const age      = lastFrameAt ? now - lastFrameAt : 0;
      const kbps     = elapsed > 0 ? (windowBytes * 8) / elapsed : 0;
      const fps      = elapsed > 0 ? (windowFrames * 1_000) / elapsed : 0;
      const stalled  = lastFrameAt > 0 && age > STALL_MS;

      setStats({
        kbps:         Math.round(kbps),
        fps:          Math.round(fps * 10) / 10,
        status:       stalled ? 'stalled' : windowFrames > 0 ? 'streaming' : 'connecting',
        lastFrameAge: age,
        bytesTotal:   totalBytes,
      });

      // Reset window
      windowBytes  = 0;
      windowFrames = 0;
      windowStart  = now;
    }, SAMPLE_WINDOW);

    // Stall watchdog — separate to the ticker so it fires even if ticker misses
    const watchdog = setInterval(() => {
      if (cancelled) return;
      if (lastFrameAt > 0 && Date.now() - lastByteAt > STALL_MS) {
        setStats((prev) => ({ ...prev, status: 'stalled' }));
      }
    }, 500);

    async function readStream() {
      try {
        setStats({ ...initialStats(), status: 'connecting' });
        const res = await fetch(streamUrl as string, {
          signal: ctrl.signal,
          cache: 'no-store',
        });

        if (!res.ok || !res.body) {
          if (!cancelled) setStats({ ...initialStats(), status: 'error' });
          return;
        }

        const decoder = new TextDecoder('utf-8', { fatal: false });
        const reader  = res.body.getReader();

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          const bytes = value.byteLength;
          windowBytes += bytes;
          totalBytes  += bytes;
          lastByteAt   = Date.now();

          // Count MJPEG frame boundaries by scanning the chunk for the boundary string
          const text   = decoder.decode(value, { stream: true });
          const frames = text.split(MJPEG_BOUNDARY).length - 1;
          if (frames > 0) {
            windowFrames += frames;
            lastFrameAt   = Date.now();
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStats({ ...initialStats(), status: 'error' });
        }
      }
    }

    readStream();

    return () => {
      cancelled = true;
      clearInterval(ticker);
      clearInterval(watchdog);
      ctrl.abort();
      abortRef.current = null;
    };
  }, [streamUrl]);

  return stats;
}
