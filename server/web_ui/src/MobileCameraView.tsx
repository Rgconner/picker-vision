/**
 * MobileCameraView — live camera feed with augmented reality overlay.
 *
 * Renders:
 *   - <video> element driven by the supplied MediaStream
 *   - <canvas> overlaid at identical dimensions, drawn each animation frame
 *   - Bounding boxes + labels for each scan result from the server-enriched state
 *   - ⊘ symbol + thick red box on unexpected items
 *   - Dwell progress arc on candidates (building toward DWELL_FRAMES threshold)
 *   - HUD status strip — no object / wrong object / multi-object warnings
 *   - Camera selector pill and facing toggle button
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { Detection, StagingRegion } from './types';
import type { CameraDevice, CameraFacing } from './useMobileCamera';
import type { ScanResult, DwellCandidate } from './useBarcodeScanner';

/** A wrong-item overlay drawn from local bbox data (no server bbox needed). */
export interface WrongItem {
  value: string;
  bbox:  ScanResult['bbox'];  // null if scanner had no bbox (ZXing path)
}

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
  /** Candidates currently building dwell — shown as progress arcs */
  candidates:     DwellCandidate[];
  /** Total dwell frames threshold — used to scale the progress arc */
  dwellFrames:    number;
  videoRef:       React.RefObject<HTMLVideoElement | null>;
  /** When provided, the AR canvas ref is forwarded here for external use (e.g. debug snapshot) */
  canvasRef?:     React.RefObject<HTMLCanvasElement | null>;
  /** Show the debug info panel overlay (activated via ?debug=1) */
  debugMode?:     boolean;
  /** QOL-014: wrong-item overlays tracked locally when server marks a scan unexpected */
  wrongItems?:    WrongItem[];
}

const COLOURS = {
  active:     '#eab308',
  correct:    '#22c55e',
  unexpected: '#ef4444',
  staging:    '#06b6d4',
  pending:    '#94a3b8',
  dwell:      '#a78bfa',   // purple — candidate building dwell
};

export function MobileCameraView({
  stream, devices, activeDeviceId, facing, error, ready,
  onSwitch, onToggleFacing,
  detections, stagingRegions, lastScan, candidates, dwellFrames,
  videoRef,
  canvasRef: externalCanvasRef,
  debugMode = false,
  wrongItems = [],
}: Props) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  // Use the externally-supplied ref if provided, otherwise use the internal one
  const canvasRef = (externalCanvasRef ?? internalCanvasRef) as React.RefObject<HTMLCanvasElement>;
  const rafRef    = useRef<number>(0);

  // Keep latest render data in refs so the draw loop never needs to be recreated.
  // This prevents a one-frame window where two rAF loops run concurrently and
  // paint overlapping (stacked) bounding boxes onto the canvas.
  const detectionsRef     = useRef(detections);
  const stagingRef        = useRef(stagingRegions);
  const lastScanRef       = useRef(lastScan);
  const candidatesRef     = useRef(candidates);
  const dwellFramesRef    = useRef(dwellFrames);
  const wrongItemsRef     = useRef(wrongItems);
  useEffect(() => { detectionsRef.current  = detections;     }, [detections]);
  useEffect(() => { stagingRef.current     = stagingRegions; }, [stagingRegions]);
  useEffect(() => { lastScanRef.current    = lastScan;       }, [lastScan]);
  useEffect(() => { candidatesRef.current  = candidates;     }, [candidates]);
  useEffect(() => { dwellFramesRef.current = dwellFrames;    }, [dwellFrames]);
  useEffect(() => { wrongItemsRef.current  = wrongItems;     }, [wrongItems]);

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      // play() may be blocked by autoplay policy until a user gesture occurs.
      // We attempt it here and also re-attempt on the 'canplay' event.
      const attempt = () => video.play().catch(() => {});
      video.addEventListener('canplay', attempt, { once: true });
      attempt();
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
    for (const det of detectionsRef.current) {
      if (det.type !== 'product') continue;
      const [bx, by, bw, bh] = det.bbox;
      const x = bx * sx, y = by * sy, w = bw * sx, h = bh * sy;

      const isWrong = det.status === 'unexpected';
      const colour  = det.active
        ? COLOURS.active
        : isWrong ? COLOURS.unexpected
        : det.status === 'correct' ? COLOURS.correct
        : COLOURS.pending;

      ctx.strokeStyle = colour;
      ctx.lineWidth   = isWrong ? 4 : det.active ? 3 : 2.5;
      ctx.strokeRect(x, y, w, h);

      if (isWrong) {
        // ⊘ fill — semi-transparent red wash
        ctx.fillStyle = 'rgba(239,68,68,0.15)';
        ctx.fillRect(x, y, w, h);

        // Diagonal strike lines (X)
        ctx.save();
        ctx.strokeStyle = COLOURS.unexpected;
        ctx.lineWidth   = 3;
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(x, y);         ctx.lineTo(x + w, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w, y);     ctx.lineTo(x, y + h);     ctx.stroke();
        ctx.restore();

        // ⊘ symbol centred on the box
        const fontSize = Math.max(28, Math.min(w, h) * 0.5);
        ctx.font      = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = COLOURS.unexpected;
        ctx.globalAlpha = 0.85;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⊘', x + w / 2, y + h / 2);
        ctx.globalAlpha = 1;
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'alphabetic';
      }

      // Label — both lines use the same threshold so they never cross
      const labelBelow = y <= 30;
      ctx.fillStyle  = colour;
      ctx.font       = '13px monospace';
      ctx.fillText(det.value, x + 2, labelBelow ? y + h + 14 : y - 4);
      if (det.staging_code) {
        ctx.fillStyle = '#f97316';
        ctx.fillText(`→ ${det.staging_code}${det.staging_label ? ' ' + det.staging_label : ''}`, x + 2, labelBelow ? y + h + 28 : y - 18);
      }
    }

    // ── Draw staging region polygons ──────────────────────────────────────────
    for (const region of stagingRef.current) {
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

    // ── Draw dwell candidates (purple progress arc) ───────────────────────────
    const threshold = dwellFramesRef.current;
    for (const cand of candidatesRef.current) {
      if (!cand.bbox) continue;
      const { x: bx2, y: by2, w: bw2, h: bh2 } = cand.bbox;
      const x2 = bx2 * sx, y2 = by2 * sy, w2 = bw2 * sx, h2 = bh2 * sy;
      const progress = Math.min(cand.frames / threshold, 1);

      // Dashed border — thicker as progress builds
      ctx.strokeStyle = COLOURS.dwell;
      ctx.lineWidth   = 2 + progress * 2;
      ctx.setLineDash([6, 3]);
      ctx.globalAlpha = 0.5 + progress * 0.4;
      ctx.strokeRect(x2, y2, w2, h2);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Progress arc in the top-right corner
      const r  = Math.min(14, Math.min(w2, h2) * 0.18);
      const cx = x2 + w2 - r - 4;
      const cy = y2 + r + 4;
      // Background circle
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth   = r * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      // Foreground arc
      ctx.strokeStyle = COLOURS.dwell;
      ctx.lineWidth   = r * 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();

      // Value label
      ctx.fillStyle  = COLOURS.dwell;
      ctx.font       = '11px monospace';
      ctx.globalAlpha = 0.8;
      ctx.fillText(cand.value, x2 + 2, y2 > 14 ? y2 - 3 : y2 + h2 + 12);
      ctx.globalAlpha = 1;
    }

    // ── QOL-014: Draw locally-tracked wrong-item overlays ─────────────────────
    // These are items the server marked 'unexpected' on the mobile path where the
    // server has no bbox — we use the local BarcodeDetector bbox instead.
    for (const wi of wrongItemsRef.current) {
      if (!wi.bbox) continue;
      const { x: bx3, y: by3, w: bw3, h: bh3 } = wi.bbox;
      const x3 = bx3 * sx, y3 = by3 * sy, w3 = bw3 * sx, h3 = bh3 * sy;

      ctx.strokeStyle = COLOURS.unexpected;
      ctx.lineWidth   = 4;
      ctx.strokeRect(x3, y3, w3, h3);

      ctx.fillStyle = 'rgba(239,68,68,0.15)';
      ctx.fillRect(x3, y3, w3, h3);

      ctx.save();
      ctx.strokeStyle = COLOURS.unexpected;
      ctx.lineWidth   = 3;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(x3, y3);         ctx.lineTo(x3 + w3, y3 + h3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x3 + w3, y3);    ctx.lineTo(x3, y3 + h3);      ctx.stroke();
      ctx.restore();

      const fontSize3 = Math.max(28, Math.min(w3, h3) * 0.5);
      ctx.font        = `bold ${fontSize3}px sans-serif`;
      ctx.fillStyle   = COLOURS.unexpected;
      ctx.globalAlpha = 0.85;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⊘', x3 + w3 / 2, y3 + h3 / 2);
      ctx.globalAlpha  = 1;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';

      ctx.fillStyle = COLOURS.unexpected;
      ctx.font      = '13px monospace';
      const labelBelow3 = y3 <= 30;
      ctx.fillText(wi.value, x3 + 2, labelBelow3 ? y3 + h3 + 14 : y3 - 4);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [videoRef]);

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
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
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

        {/* Debug mode indicator */}
        {debugMode && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-[#7c5cd8]/80 text-white text-[10px] font-bold backdrop-blur-sm">
            ⬤ DEBUG
          </span>
        )}
      </div>

      {/* ── HUD status strip — driven entirely from local candidates (no server round-trip needed) ── */}
      {(() => {
        const count = candidates.length;
        if (count === 0) return null;

        // Multiple objects in frame — dwell gate is holding, picker must isolate
        if (count > 1) {
          return (
            <div
              className="absolute bottom-16 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl pointer-events-none"
              style={{ background: 'rgba(161,98,7,0.92)', backdropFilter: 'blur(4px)' }}
            >
              <span className="text-[#fef9c3] text-base font-bold shrink-0">⚠</span>
              <span className="text-[#fef9c3] text-xs font-semibold leading-tight">
                {count} items in view — isolate one before scanning
              </span>
            </div>
          );
        }

        // Single candidate building dwell — show "hold steady" nudge
        return (
          <div
            className="absolute bottom-16 left-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl pointer-events-none"
            style={{ background: 'rgba(88,28,135,0.85)', backdropFilter: 'blur(4px)' }}
          >
            <span className="text-[#e9d5ff] text-base shrink-0">◎</span>
            <span className="text-[#e9d5ff] text-xs font-semibold leading-tight">Hold steady…</span>
          </div>
        );
      })()}

      {/* ── Debug info panel (bottom-left, semi-transparent) ── */}
      {debugMode && (
        <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] font-mono p-2 space-y-0.5 pointer-events-none">
          <div className="text-[#7c5cd8] font-bold text-[11px] mb-1">🔍 Debug Info</div>
          <div><span className="text-[#94a3b8]">detections:</span> {detections.length}</div>
          <div><span className="text-[#94a3b8]">active:</span> {detections.filter(d => d.active).length}</div>
          <div><span className="text-[#94a3b8]">staging:</span> {stagingRegions.length}</div>
          <div><span className="text-[#94a3b8]">candidates:</span> {candidates.map((c) => `${c.value}(${c.frames})`).join(', ') || '—'}</div>
          <div><span className="text-[#94a3b8]">lastScan:</span> {lastScan?.value ?? '—'}</div>
          <div><span className="text-[#94a3b8]">snapshot:</span> POSTing /api/debug/snapshot every 2 s</div>
          <div className="text-[#57606a] mt-1">GET /api/debug/snapshot/&lt;picker-id&gt; for live view</div>
        </div>
      )}
    </div>
  );
}
