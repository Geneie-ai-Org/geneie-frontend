import React from 'react';
import { motion } from 'motion/react';

/**
 * Illustration for the 404 page: a DNA double helix with a segment missing, the lost
 * base pairs drifting in the gap. Drawn from the same sine curves as the strands so the
 * pieces line up, and coloured from theme tokens so it follows light/dark.
 */

const W = 320;
const H = 120;
const MID = H / 2;
const AMP = 34;
const K = (2 * Math.PI) / 110; // one full twist per 110px
const GAP_START = 128;
const GAP_END = 192;
const RUNG_STEP = 11;

const strandY = (x, sign) => MID + sign * AMP * Math.sin(K * x);

function strandPath(from, to, sign) {
  let d = '';
  for (let x = from; x <= to; x += 2) {
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${strandY(x, sign).toFixed(1)}`;
  }
  return d;
}

function rungs(from, to) {
  const out = [];
  for (let x = from + 4; x <= to - 4; x += RUNG_STEP) {
    out.push({ x, y1: strandY(x, 1), y2: strandY(x, -1), front: Math.cos(K * x) > 0 });
  }
  return out;
}

const SEGMENTS = [
  [0, GAP_START],
  [GAP_END, W],
];

// Base pairs that fell out of the gap: position, tilt, and float timing.
const LOOSE = [
  { x: 144, y: 44, len: 22, rot: -28, delay: 0 },
  { x: 160, y: 72, len: 18, rot: 34, delay: 0.6 },
  { x: 176, y: 50, len: 20, rot: 12, delay: 1.2 },
];

export default function BrokenHelix({ className }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="A DNA helix with a missing segment"
      fill="none"
      strokeLinecap="round"
    >
      {/* Fade the outer ends so the helix trails off instead of stopping at the edge */}
      <defs>
        <linearGradient id="broken-helix-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.14" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.86" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="broken-helix-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="url(#broken-helix-fade)" />
        </mask>
      </defs>

      <g mask="url(#broken-helix-mask)">
      {SEGMENTS.map(([from, to]) => (
        <g key={from}>
          {rungs(from, to).map((r) => (
            <line
              key={r.x}
              x1={r.x}
              x2={r.x}
              y1={r.y1}
              y2={r.y2}
              stroke={r.front ? 'var(--accent-teal)' : 'var(--text-tertiary)'}
              strokeOpacity={r.front ? 0.7 : 0.3}
              strokeWidth={2}
            />
          ))}
          <path d={strandPath(from, to, 1)} stroke="var(--text-primary)" strokeOpacity={0.85} strokeWidth={3} />
          <path d={strandPath(from, to, -1)} stroke="var(--text-secondary)" strokeOpacity={0.6} strokeWidth={3} />
        </g>
      ))}
      </g>

      {/* Dashed ghost of the missing stretch */}
      <path
        d={strandPath(GAP_START, GAP_END, 1)}
        stroke="var(--text-tertiary)"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        strokeDasharray="2 5"
      />
      <path
        d={strandPath(GAP_START, GAP_END, -1)}
        stroke="var(--text-tertiary)"
        strokeOpacity={0.35}
        strokeWidth={1.5}
        strokeDasharray="2 5"
      />

      {LOOSE.map((p) => (
        <motion.g
          key={p.x}
          initial={{ y: 0 }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.2, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        >
          <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
            <line x1={0} x2={0} y1={-p.len / 2} y2={p.len / 2} stroke="var(--accent-teal)" strokeWidth={2} />
            <circle cy={-p.len / 2} r={2.5} fill="var(--text-primary)" fillOpacity={0.85} />
            <circle cy={p.len / 2} r={2.5} fill="var(--text-secondary)" fillOpacity={0.7} />
          </g>
        </motion.g>
      ))}
    </svg>
  );
}
