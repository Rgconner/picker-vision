import React from 'react';
import type { StagingRegion } from './types';

interface Props {
  region: StagingRegion;
  scaleX: number;
  scaleY: number;
}

export function StagingOverlay({ region, scaleX, scaleY }: Props) {
  if (!region.lock_state && region.staging_status !== 'locked') return null;

  const points = region.boundary_points
    .map(([x, y]) => `${x * scaleX},${y * scaleY}`)
    .join(' ');

  const cx = region.centre[0] * scaleX;
  const cy = region.centre[1] * scaleY;

  const patternId = `hatch-${region.staging_code ?? 'locked'}`;

  return (
    <g>
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#ef4444" strokeWidth="3" strokeOpacity="0.6" />
        </pattern>
      </defs>
      <polygon
        points={points}
        fill={`url(#${patternId})`}
        stroke="#ef4444"
        strokeWidth={4}
      />
      {/* solid semi-transparent fill on top of hatch */}
      <polygon
        points={points}
        fill="rgba(239,68,68,0.25)"
        stroke="none"
      />
      {region.staging_code && (
        <text
          x={cx}
          y={cy - 20}
          textAnchor="middle"
          fill="#ef4444"
          fontSize={13}
          fontWeight="bold"
        >
          {region.staging_code}
        </text>
      )}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fill="white"
        fontSize={14}
        fontWeight="bold"
      >
        ⛔ DO NOT MODIFY
      </text>
    </g>
  );
}
