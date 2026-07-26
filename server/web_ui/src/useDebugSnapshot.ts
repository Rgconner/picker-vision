/**
 * useDebugSnapshot — when debug mode is active, captures a composite JPEG
 * (video frame + AR overlay) every INTERVAL_MS and POSTs it to the server.
 *
 * The server stores the latest snapshot per picker_id in Redis (30 s TTL).
 * Retrieve it any time via GET /api/debug/snapshot/{picker_id}.
 *
 * Activated by appending ?debug=1 to the page URL.
 */

import React, { useEffect, useRef } from 'react';

const INTERVAL_MS = 2000; // post a new snapshot every 2 seconds

/**
 * Render the video frame and AR canvas overlay onto an offscreen canvas and
 * return a JPEG data URL — this is exactly what the operator sees on screen.
 */
export function captureSnapshot(
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
): string | null {
  const vw = videoEl.videoWidth  || videoEl.clientWidth;
  const vh = videoEl.videoHeight || videoEl.clientHeight;
  if (!vw || !vh) return null;

  const offscreen = document.createElement('canvas');
  offscreen.width  = vw;
  offscreen.height = vh;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  // Draw the raw video frame first
  ctx.drawImage(videoEl, 0, 0, vw, vh);

  // Scale the AR canvas overlay on top so bounding boxes align
  if (canvasEl.width > 0 && canvasEl.height > 0) {
    ctx.drawImage(canvasEl, 0, 0, vw, vh);
  }

  return offscreen.toDataURL('image/jpeg', 0.65);
}

export function useDebugSnapshot(
  pickerId: string | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || !pickerId) return;

    async function post() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const dataUrl = captureSnapshot(video, canvas);
      if (!dataUrl) return;

      try {
        await fetch(`/api/debug/snapshot/${pickerId}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image: dataUrl }),
        });
      } catch { /* best-effort — never throw from a background timer */ }
    }

    timerRef.current = setInterval(post, INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, pickerId, videoRef, canvasRef]);
}
