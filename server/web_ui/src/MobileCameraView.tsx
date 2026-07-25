/**
 * MobileCameraView — live camera feed with augmented reality overlay.
 *
 * Renders:
 *   - <video> element driven by the supplied MediaStream
 *   - <canvas> overlaid at identical dimensions, drawn each animation frame
 *   - Bounding boxes + labels for each scan result from the server-enriched state
 *   - Camera selector pill and facing toggle button
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { Detection, StagingRegion } from './types';
import type { CameraDevice, CameraFacing } from './useMobileCamera';
import type { ScanResult } from './useBarcodeScanner';

interface Props {
  stream:         MediaStream | null;
  devices:        CameraDevice[];
  activeDeviceId: string | null;
  facing:         CameraFacing;
  error:          string | null;
  ready:          boolean;
  onSwitch:       (deviceId: string) => void;
  onToggleFacing: () => void;
  /** Enriched detections from server state — used for AR overlay colours */
  detections:     Detection[];
  stagingRegions: StagingRegion[];
  /** Most recent local scan — drawn immediately before server round-trip completes */
  lastScan:       ScanResult | null;
  videoRef:       React.RefObject<HTMLVideoElement | null>;
}

const COLOURS = {
  active:     '#eab308',
  correct:    '#22c55e',
  unexpected: '#ef4444',
  staging:    '#06b6d4',
  pending:    '#94a3b8',
  local:      '#a78bfa',   // purple — local scan not yet enriched by server
};

export function MobileCameraView({
  stream, devices, activeDeviceId, facing, error, ready,
  onSwitch, onToggleFacing,
  detections, stagingRegions, lastScan,
  videoRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {/* autoplay policy — user gesture required */});
    } else {
      video.srcObject = null;
    }
  }, [stream, videoRef]);

  // Canvas draw loop
  const draw = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const vw = video.videoWidth  || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    const dw = canvas.offsetWidth;
    const dh = canvas.offsetHeight;

    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width  = dw;
      canvas.height = dh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

    ctx.clearRect(0, 0, dw, dh);

    const sx = vw > 0 ? dw / vw : 1;
    const sy = vh > 0 ? dh / vh : 1;

    // ── Draw enriched server detections ──────────────────────────────────────
    for (const det of detections) {
      if (det.type !== 'product') continue;
      const [bx, by, bw, bh] = det.bbox;
      const x = bx * sx, y = by * sy, w = bw * sx, h = bh * sy;

      const colour = det.active
        ? COLOURS.active
        : det.status === 'correct' ? COLOURS.correct
        : det.status === 'unexpected' ? COLOURS.unexpected
        : COLOURS.pending;

      ctx.strokeStyle = colour;
      ctx.lineWidth   = det.active ? 3 : 2;
      ctx.strokeRect(x, y, w, h);

      // Label
      ctx.fillStyle  = colour;
      ctx.font       = '13px monospace';
      ctx.fillText(det.value, x + 2, y > 16 ? y - 4 : y + h + 14);
      if (det.staging_code) {
        ctx.fillStyle = '#f97316';
        ctx.fillText(`→ ${det.staging_code}${det.staging_label ? ' ' + det.staging_label : ''}`, x + 2, y > 30 ? y - 18 : y + h + 28);
      }
    }

    // ── Draw staging region polygons ──────────────────────────────────────────
    for (const region of stagingRegions) {
      if (!region.boundary_points?.length) continue;
      const isLocked = region.lock_state || region.staging_status === 'locked';
      ctx.strokeStyle = isLocked ? COLOURS.unexpected : COLOURS.staging;
      ctx.lineWidth   = 2;
      ctx.fillStyle   = isLocked ? 'rgba(239,68,68,0.15)' : 'rgba(6,182,212,0.1)';

      ctx.beginPath();
      region.boundary_points.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px * sx, py * sy);
        else         ctx.lineTo(px * sx, py * sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const [cx, cy] = region.centre;
      ctx.fillStyle  = isLocked ? COLOURS.unexpected : COLOURS.staging;
      ctx.font       = 'bold 14px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText(
        isLocked ? `⛔ ${region.staging_code}` : (region.staging_code ?? ''),
        cx * sx, cy * sy,
      );
      ctx.textAlign = 'left';
    }

    // ── Draw local last scan (purple) before server round-trip ───────────────
    if (lastScan?.bbox) {
      const { x, y, w, h } = lastScan.bbox;
      ctx.strokeStyle = COLOURS.local;
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x * sx, y * sy, w * sx, h * sy);
      ctx.setLineDash([]);
      ctx.fillStyle = COLOURS.local;
      ctx.font      = '12px monospace';
      ctx.fillText(lastScan.value, x * sx + 2, y * sy > 14 ? y * sy - 4 : y * sy + h * sy + 13);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [detections, stagingRegions, lastScan, videoRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Camera feed */}
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* AR overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-red-400 text-sm text-center px-6">{error}</p>
        </div>
      )}

      {/* Loading state */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-[#94a3b8] text-sm animate-pulse">Requesting camera…</p>
        </div>
      )}

      {/* ── Camera controls overlay (top bar) ── */}
      <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
        {/* Facing toggle */}
        <button
          onClick={onToggleFacing}
          className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm"
          title="Flip camera"
        >
          🔄 {facing === 'environment' ? 'Rear' : 'Front'}
        </button>

        {/* Device selector — only shown when >1 camera available */}
        {devices.length > 1 && (
          <select
            value={activeDeviceId ?? ''}
            onChange={(e) => onSwitch(e.target.value)}
            className="flex-1 min-w-0 bg-black/60 text-white text-xs rounded-full px-2 py-1 backdrop-blur-sm border border-white/20 focus:outline-none"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
