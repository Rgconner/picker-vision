import React, { useEffect, useRef, useState } from 'react';
import type { Detection, StagingRegion } from './types';
import { StagingOverlay } from './StagingOverlay';
import { useStreamStats } from './useStreamStats';
import type { StreamStatus } from './useStreamStats';

interface Props {
  pickerId:    string;
  streamUrl?:  string | null;   // direct Pi URL e.g. http://192.168.1.84:8080/stream
  detections:  Detection[];
  stagingRegions: StagingRegion[];
  compact?:    boolean;
}

// ── Stream status → badge colours ────────────────────────────────────────────

function statusColour(s: StreamStatus): { bg: string; text: string; dot: string } {
  switch (s) {
    case 'streaming':  return { bg: 'bg-[#0a2d14]',  text: 'text-[#22c55e]', dot: '#22c55e' };
    case 'connecting': return { bg: 'bg-[#2d2510]',  text: 'text-[#f59e0b]', dot: '#f59e0b' };
    case 'stalled':    return { bg: 'bg-[#2d1a0a]',  text: 'text-[#f97316]', dot: '#f97316' };
    case 'error':
    case 'offline':
    default:           return { bg: 'bg-[#2d1a1a]',  text: 'text-[#ef4444]', dot: '#ef4444' };
  }
}

// ── Throughput sparkline (last 20 samples) ────────────────────────────────────

function Sparkline({ samples }: { samples: number[] }) {
  if (samples.length < 2) return null;
  const max = Math.max(...samples, 1);
  const w   = 60;
  const h   = 18;
  const pts = samples.map((v, i) => {
    const x = (i / (samples.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke="#06b6d4"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── StreamMeter overlay ───────────────────────────────────────────────────────

function StreamMeter({
  streamUrl, pickerId, compact,
}: { streamUrl: string | null | undefined; pickerId: string; compact: boolean }) {
  const stats   = useStreamStats(streamUrl);
  const colours = statusColour(stats.status);

  // Keep last 20 kbps samples for sparkline
  const samplesRef = useRef<number[]>([]);
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    samplesRef.current = [...samplesRef.current.slice(-19), stats.kbps];
    setSamples([...samplesRef.current]);
  }, [stats.kbps]);

  if (compact) {
    // Compact: single-line pill in top-right corner
    return (
      <div
        className={`absolute top-1 right-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold backdrop-blur-sm ${colours.bg} ${colours.text}`}
        style={{ opacity: 0.92 }}
      >
        <span style={{ color: colours.dot }}>●</span>
        {stats.status === 'streaming'
          ? <>{stats.fps.toFixed(1)} fps · {stats.kbps} kb/s</>
          : <span className="capitalize">{stats.status}</span>
        }
      </div>
    );
  }

  // Full: bar below the video
  const barPct = Math.min(100, (stats.kbps / 500) * 100); // 500 kbps = full bar
  const barColour =
    stats.status === 'streaming' ? '#22c55e' :
    stats.status === 'stalled'   ? '#f97316' :
    stats.status === 'connecting'? '#f59e0b' : '#ef4444';

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-t border-[#2d3142]"
      style={{ background: '#0f1117' }}
    >
      {/* Status dot + label */}
      <span
        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${colours.bg} ${colours.text}`}
      >
        {stats.status === 'streaming' ? '● Stream' :
         stats.status === 'connecting' ? '○ Connecting' :
         stats.status === 'stalled'    ? '⚠ Stalled' : '✕ No stream'}
      </span>

      {/* Throughput bar */}
      <div className="flex-1 h-1.5 rounded-full bg-[#2d3142] min-w-0 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${barPct}%`, background: barColour }}
        />
      </div>

      {/* Sparkline */}
      <Sparkline samples={samples} />

      {/* Numeric readout */}
      <span className="text-xs font-mono text-[#94a3b8] shrink-0 w-28 text-right">
        {stats.status === 'streaming'
          ? <>{stats.fps.toFixed(1)} fps · {stats.kbps} kb/s</>
          : stats.status === 'error' || stats.status === 'offline'
          ? <span className="text-[#ef4444]">unreachable</span>
          : '—'
        }
      </span>
    </div>
  );
}

// ── VideoPanel ────────────────────────────────────────────────────────────────

export function VideoPanel({ pickerId, streamUrl, detections, stagingRegions, compact = false }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [imgError, setImgError] = useState(false);

  // Use the registered stream URL directly (browser → Pi) so it bypasses
  // the api-gateway which returns 404 for /stream/* in k8s mode.
  // Fall back to the nginx proxy path only if no direct URL is available.
  const resolvedUrl = streamUrl ?? null;

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setImgSize({ width, height });
      }
    });
    observer.observe(img);
    return () => observer.disconnect();
  }, []);

  // Reset error state when URL changes
  useEffect(() => { setImgError(false); }, [resolvedUrl]);

  const scaleX = imgSize.width > 0 ? imgSize.width / 640 : 1;
  const scaleY = imgSize.height > 0 ? imgSize.height / 480 : 1;

  const regionCodes = new Set(stagingRegions.map((r) => r.staging_code));
  const orphanStagingDetections = detections.filter(
    (d) => d.type === 'staging' && !regionCodes.has(d.staging_code),
  );

  function getProductStroke(d: Detection): { stroke: string; strokeWidth: number } {
    if (d.active)                return { stroke: '#eab308', strokeWidth: compact ? 2 : 3 };
    if (d.status === 'correct')  return { stroke: '#22c55e', strokeWidth: compact ? 1 : 2 };
    if (d.status === 'unexpected') return { stroke: '#ef4444', strokeWidth: compact ? 1 : 2 };
    return { stroke: '#94a3b8', strokeWidth: 1 };
  }

  return (
    <div className="relative w-full flex flex-col" style={{ background: '#0f1117' }}>
      {/* Video + overlay container */}
      <div className="relative w-full">
        {resolvedUrl && !imgError ? (
          <img
            ref={imgRef}
            src={resolvedUrl}
            alt={`Stream for ${pickerId}`}
            className="w-full block"
            style={compact ? { maxHeight: 200, objectFit: 'contain' } : undefined}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          // Placeholder when no URL or load error
          <div
            ref={imgRef as React.RefObject<HTMLDivElement>}
            className="w-full flex items-center justify-center text-[#57606a] text-xs font-mono"
            style={{ background: '#0a0c10', aspectRatio: '4/3', minHeight: compact ? 100 : 200 }}
          >
            {imgError ? 'Stream load error' : 'No stream URL registered'}
          </div>
        )}

        {/* SVG overlay for detections */}
        {imgSize.width > 0 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={imgSize.width}
            height={imgSize.height}
          >
            {/* Product bounding boxes */}
            {detections
              .filter((d) => d.type === 'product')
              .map((d, i) => {
                const [bx, by, bw, bh] = d.bbox;
                const x = bx * scaleX;
                const y = by * scaleY;
                const w = bw * scaleX;
                const h = bh * scaleY;
                const { stroke, strokeWidth } = getProductStroke(d);
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
                    {!compact && (
                      <>
                        <text x={x} y={y - 4} fill="white" fontSize={11} fontFamily="monospace">{d.value}</text>
                        {d.staging_code && (
                          <text x={x} y={y + 10} fill="#f97316" fontSize={11} fontFamily="monospace">
                            → {d.staging_code}{d.staging_label ? ` ${d.staging_label}` : ''}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}

            {/* Staging region polygons */}
            {stagingRegions.map((region, i) => {
              const isLocked = region.lock_state || region.staging_status === 'locked';
              const points   = region.boundary_points.map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(' ');
              const cx       = region.centre[0] * scaleX;
              const cy       = region.centre[1] * scaleY;
              if (isLocked) {
                return <StagingOverlay key={i} region={region} scaleX={scaleX} scaleY={scaleY} />;
              }
              return (
                <g key={i}>
                  <polygon points={points} fill="rgba(6,182,212,0.1)" stroke="#06b6d4" strokeWidth={compact ? 1 : 2} />
                  {!compact && (
                    <text x={cx} y={cy} textAnchor="middle" fill="#06b6d4" fontSize={13} fontWeight="bold">
                      {region.staging_code}{region.staging_label ? ` ${region.staging_label}` : ''}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Orphan staging QR boxes */}
            {orphanStagingDetections.map((d, i) => {
              const [bx, by, bw, bh] = d.bbox;
              const x = bx * scaleX;
              const y = by * scaleY;
              const w = bw * scaleX;
              const h = bh * scaleY;
              return (
                <g key={`staging-qr-${i}`}>
                  <rect x={x} y={y} width={w} height={h} fill="none" stroke="#06b6d4" strokeWidth={compact ? 1 : 2} />
                  {!compact && (
                    <text x={x} y={y - 4} fill="#06b6d4" fontSize={11} fontFamily="monospace">{d.staging_code}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* Compact stream meter — overlaid top-right */}
        {compact && (
          <StreamMeter streamUrl={resolvedUrl} pickerId={pickerId} compact={true} />
        )}
      </div>

      {/* Full stream meter — below video */}
      {!compact && (
        <StreamMeter streamUrl={resolvedUrl} pickerId={pickerId} compact={false} />
      )}
    </div>
  );
}
