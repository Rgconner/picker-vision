import React, { useEffect, useRef, useState } from 'react';
import type { Detection, StagingRegion } from './types';
import { StagingOverlay } from './StagingOverlay';

interface Props {
  pickerId: string;
  detections: Detection[];
  stagingRegions: StagingRegion[];
  compact?: boolean;
}

export function VideoPanel({ pickerId, detections, stagingRegions, compact = false }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

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

  const scaleX = imgSize.width > 0 ? imgSize.width / 640 : 1;
  const scaleY = imgSize.height > 0 ? imgSize.height / 480 : 1;

  // Build a set of staging codes that have polygon regions
  const regionCodes = new Set(stagingRegions.map((r) => r.staging_code));

  // Staging QR detections with no matching polygon
  const orphanStagingDetections = detections.filter(
    (d) => d.type === 'staging' && !regionCodes.has(d.staging_code),
  );

  function getProductStroke(d: Detection): { stroke: string; strokeWidth: number } {
    if (d.active) return { stroke: '#eab308', strokeWidth: compact ? 2 : 3 };
    if (d.status === 'correct') return { stroke: '#22c55e', strokeWidth: compact ? 1 : 2 };
    if (d.status === 'unexpected') return { stroke: '#ef4444', strokeWidth: compact ? 1 : 2 };
    return { stroke: '#94a3b8', strokeWidth: 1 };
  }

  return (
    <div className="relative w-full" style={{ background: '#0f1117' }}>
      <img
        ref={imgRef}
        src={`/stream/${pickerId}`}
        alt={`Stream for ${pickerId}`}
        className="w-full block"
        style={compact ? { maxHeight: 200, objectFit: 'contain' } : undefined}
        draggable={false}
      />
      {imgSize.width > 0 && (
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={imgSize.width}
          height={imgSize.height}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Product detection bounding boxes */}
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
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                  {!compact && (
                    <>
                      <text
                        x={x}
                        y={y - 4}
                        fill="white"
                        fontSize={11}
                        fontFamily="monospace"
                      >
                        {d.value}
                      </text>
                      {d.staging_code && (
                        <text
                          x={x}
                          y={y - 4 + 14}
                          fill="#f97316"
                          fontSize={11}
                          fontFamily="monospace"
                        >
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
            const points = region.boundary_points
              .map(([x, y]) => `${x * scaleX},${y * scaleY}`)
              .join(' ');
            const cx = region.centre[0] * scaleX;
            const cy = region.centre[1] * scaleY;

            if (isLocked) {
              return (
                <StagingOverlay
                  key={i}
                  region={region}
                  scaleX={scaleX}
                  scaleY={scaleY}
                />
              );
            }

            return (
              <g key={i}>
                <polygon
                  points={points}
                  fill="rgba(6,182,212,0.1)"
                  stroke="#06b6d4"
                  strokeWidth={compact ? 1 : 2}
                />
                {!compact && (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fill="#06b6d4"
                    fontSize={13}
                    fontWeight="bold"
                  >
                    {region.staging_code}
                    {region.staging_label ? ` ${region.staging_label}` : ''}
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
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth={compact ? 1 : 2}
                />
                {!compact && (
                  <text
                    x={x}
                    y={y - 4}
                    fill="#06b6d4"
                    fontSize={11}
                    fontFamily="monospace"
                  >
                    {d.staging_code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
