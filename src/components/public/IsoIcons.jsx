import React, { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useHoverCapable } from '@/lib/hooks/use-hover-capable';

/**
 * Isometric line-and-soft-fill icons for the Data handling cards. Drawn on a 30-degree grid in a 160x160 box:
 * x runs down-right, y down-left, z up. Colours come from the `.iso-icon` vars in workbench.css, so the same
 * markup is blue in the light theme and teal in the dark one, with the top face always the lightest.
 * Every shape is projected to screen coordinates (no skew transforms), so strokes are one width everywhere
 * and edges stay crisp when the page is zoomed.
 */

const COS = 0.866;
const SIN = 0.5;

const STROKE = { stroke: 'var(--iso-line)', strokeWidth: 1.75, strokeLinejoin: 'round', strokeLinecap: 'round' };
const TOP = { fill: 'var(--iso-top)', ...STROKE };
const LEFT = { fill: 'var(--iso-left)', ...STROKE };
const RIGHT = { fill: 'var(--iso-right)', ...STROKE };
const ACCENT = { fill: 'var(--iso-accent)', ...STROKE };
const DASH = { fill: 'none', stroke: 'var(--iso-line)', strokeWidth: 1, strokeDasharray: '2 3', opacity: 0.55 };
const SHADOW = { fill: 'var(--iso-shadow)', filter: 'var(--iso-blur)' };

const SPRING = { type: 'spring', stiffness: 260, damping: 22 };

/** Hover variants for a part that lifts by (x, y) when an ancestor motion element is hovered. */
const lift = (y, x = 0, delay = 0) => ({
  rest: { x: 0, y: 0, transition: SPRING },
  hover: { x, y, transition: { ...SPRING, delay } },
});

const num = (n) => +n.toFixed(2);
const pts = (list) => list.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
const f = ([x, y]) => `${num(x)} ${num(y)}`;

/** Polygon with softly rounded corners: each vertex is replaced by a short quadratic curve. */
function soft(list, r = 2) {
  const n = list.length;
  return (
    list
      .map((p, i) => {
        const a = list[(i + n - 1) % n];
        const b = list[(i + 1) % n];
        const toward = (q) => {
          const dx = q[0] - p[0];
          const dy = q[1] - p[1];
          const len = Math.hypot(dx, dy) || 1;
          const k = Math.min(r, len / 2) / len;
          return [p[0] + dx * k, p[1] + dy * k];
        };
        const s0 = toward(a);
        const s1 = toward(b);
        return `${i ? 'L' : 'M'}${f(s0)}Q${f(p)} ${f(s1)}`;
      })
      .join('') + 'Z'
  );
}

/** Cube whose top vertex is at (cx, cy) and whose edge is `e` px. */
function Cube({ cx, cy, e, top = TOP, left = LEFT, right = RIGHT }) {
  const dx = COS * e;
  const dy = SIN * e;
  return (
    <g>
      <path d={soft([[cx - dx, cy + dy], [cx, cy + e], [cx, cy + 2 * e], [cx - dx, cy + dy + e]], 1.2)} style={left} />
      <path d={soft([[cx, cy + e], [cx + dx, cy + dy], [cx + dx, cy + dy + e], [cx, cy + 2 * e]], 1.2)} style={right} />
      <path d={soft([[cx, cy], [cx + dx, cy + dy], [cx, cy + e], [cx - dx, cy + dy]], 1.2)} style={top} />
    </g>
  );
}

/** One disc of a cylinder: its centre on the top face is (cx, cy), `h` tall. Ellipse ratio is tan 30 degrees. */
function Disc({ cx, cy, rx, h, withTop }) {
  const ry = rx * 0.577;
  const b = cy + h;
  const side = `M${cx - rx} ${cy}V${b}A${rx} ${ry} 0 0 0 ${cx + rx} ${b}V${cy}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}Z`;
  const shade = `M${cx} ${cy + ry}V${b + ry}A${rx} ${ry} 0 0 0 ${cx + rx} ${b}V${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}Z`;
  return (
    <g>
      <path d={side} style={{ ...LEFT, stroke: 'none' }} />
      <path d={shade} style={{ ...RIGHT, stroke: 'none' }} />
      <path d={side} style={{ ...STROKE, fill: 'none' }} />
      {withTop ? <ellipse cx={cx} cy={cy} rx={rx} ry={ry} style={TOP} /> : null}
    </g>
  );
}

function Frame({ size, className, children, ...rest }) {
  const id = `iso-blur-${useId().replace(/:/g, '')}`;
  return (
    <svg
      className={className ? `iso-icon ${className}` : 'iso-icon'}
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      shapeRendering="geometricPrecision"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <defs>
        <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g style={{ '--iso-blur': `url(#${id})` }}>{children}</g>
    </svg>
  );
}

/** Records funnelled from a few sources into one store. */
export function IsoFunnelDb({ size = 64, ...rest }) {
  const fx = 80;
  const ft = 53;
  const fr = 33;
  const fry = fr * 0.578;
  const sp = 95;
  const sw = 8;
  const dbx = 80;
  const dby = 110;
  const drx = 32;
  const dh = 13;
  const e = 9.5;
  const cubes = [
    { x: 52, y: 5, drop: 9, delay: 0 },
    { x: 80, y: 2, drop: 10.8, delay: 0.05, accent: true },
    { x: 110, y: 5, drop: 9, delay: 0.1 },
  ];
  return (
    <Frame size={size} {...rest}>
      <ellipse cx={dbx + 24} cy={dby + 32} rx={drx + 6} ry={(drx + 6) * 0.5} style={SHADOW} />
      <Disc cx={dbx} cy={dby + dh} rx={drx} h={dh} />
      <Disc cx={dbx} cy={dby} rx={drx} h={dh} withTop />
      <path d={cubes.map((c, i) => `M${c.x} ${c.y + 2 * e + 2}V${i === 1 ? ft - 10 : ft - 14}`).join('')} style={DASH} />
      {cubes.map((c) => (
        <motion.g key={c.x} variants={lift(c.drop, 0, c.delay)}>
          <Cube
            cx={c.x}
            cy={c.y}
            e={e}
            top={c.accent ? ACCENT : TOP}
            left={c.accent ? { ...ACCENT, fillOpacity: 0.75 } : LEFT}
            right={c.accent ? { ...ACCENT, fillOpacity: 0.55 } : RIGHT}
          />
        </motion.g>
      ))}
      <path
        d={`M${fx - fr} ${ft}L${fx - sw} ${sp}V${sp + 10}A${sw} 4 0 0 0 ${fx + sw} ${sp + 10}V${sp}L${fx + fr} ${ft}A${fr} ${fry} 0 0 1 ${fx - fr} ${ft}Z`}
        style={ACCENT}
      />
      <ellipse cx={fx} cy={ft} rx={fr} ry={fry} style={{ ...TOP, fill: 'var(--iso-right)' }} />
      <ellipse cx={fx} cy={ft + 2} rx={fr - 10} ry={(fr - 10) * 0.546} style={{ fill: 'var(--iso-deep)' }} />
    </Frame>
  );
}

/**
 * Three separate sheets with clear air between them. Every sheet has its own light top face, outline and edge, and
 * the sheet above casts a soft band onto the one below, so they read as loose files and not one solid block.
 */
export function IsoDocs({ size = 64, ...rest }) {
  const uid = useId().replace(/:/g, '');
  const W = 60;
  const D = 76;
  const T = 0.5;
  const GAP = 8.5;
  const F = 12;
  const at = (u, v, z) => [80 + (u - v) * COS, 39 + (u + v) * SIN - z];
  const bars = [[7, 23.5, 38], [7, 35.5, 38], [7, 47.5, 28]];
  const sheet = (k) => {
    const z = -k * GAP;
    const p = (u, v, zz = z) => at(u + 3 * k, v - 0.5 * k, zz);
    return {
      z,
      p,
      top: [p(0, 0), p(W - F, 0), p(W, F), p(W, D), p(0, D)],
      left: [p(0, D), p(W, D), p(W, D, z - T), p(0, D, z - T)],
      right: [p(W, F), p(W, D), p(W, D, z - T), p(W, F, z - T)],
    };
  };
  const last = sheet(2);
  return (
    <Frame size={size} {...rest}>
      <defs>
        {[1, 2].map((k) => (
          <clipPath key={k} id={`${uid}-c${k}`}>
            <path d={soft(sheet(k).top, 0)} />
          </clipPath>
        ))}
      </defs>
      <polygon
        points={pts([last.p(10, 8, last.z - T), last.p(W + 20, 8, last.z - T), last.p(W + 20, D + 12, last.z - T), last.p(10, D + 12, last.z - T)])}
        style={SHADOW}
      />
      {[2, 1, 0].map((k) => {
        const { p, top, left, right } = sheet(k);
        return (
          <React.Fragment key={k}>
            <motion.g variants={lift(k === 0 ? -10 : k === 1 ? -4 : 0)}>
              <path d={soft(left, 1.2)} style={LEFT} />
              <path d={soft(right, 1.2)} style={RIGHT} />
              <path d={soft(top, 0)} style={TOP} />
              <path d={soft([p(W - F, 0), p(W - F, F), p(W, F)], 1.5)} style={k ? { ...ACCENT, fillOpacity: 0.6 } : ACCENT} />
              {k === 0
                ? bars.map(([u, v, w]) => (
                    <polygon
                      key={v}
                      points={pts([p(u, v), p(u + w, v), p(u + w, v + 2), p(u, v + 2)])}
                      style={{ fill: 'var(--iso-right)', stroke: 'var(--iso-right)', strokeWidth: 3, strokeLinejoin: 'round' }}
                    />
                  ))
                : null}
            </motion.g>
            {k > 0 ? (
              /* The sheet above shades a soft band onto this one, which is what separates the layers. */
              <g clipPath={`url(#${uid}-c${k})`}>
                <polygon points={pts(sheet(k - 1).top)} transform="translate(3 5)" style={{ fill: 'var(--iso-deep)' }} />
              </g>
            ) : null}
          </React.Fragment>
        );
      })}
    </Frame>
  );
}

/** A database stack with a shield and padlock badge standing in front of it. */
export function IsoDbLock({ size = 64, ...rest }) {
  /* The shackle rests raised (unlatched) and snaps shut when the card is hovered. Touch and reduced motion get it closed. */
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const still = reduce || !canHover;
  const latch = {
    rest: { y: still ? 0 : -6, transition: SPRING },
    hover: { y: 0, transition: { type: 'spring', stiffness: 520, damping: 16 } },
  };
  const cx = 80;
  const cy0 = 95;
  const rx = 39.5;
  const h = 17.5;
  const step = 22.5;
  const K = 1.04;
  const LU = 1;
  /* The badge stands in the right-hand plane: u runs up-right, v runs down. */
  const sp = (u, v, dx = 0, dy = 0) => [94 + u * COS + dx, 60 - u * SIN + v + dy];
  const shield = (dx, dy) => {
    const q = (u, v) => f(sp(22 + (u - 22) * K, 26 + (v - 26) * K, dx, dy));
    return `M${q(22, 0)}L${q(44, 8)}L${q(44, 26)}C${q(44, 40)} ${q(34, 48)} ${q(22, 52)}C${q(10, 48)} ${q(0, 40)} ${q(0, 26)}L${q(0, 8)}Z`;
  };
  const q = (u, v) => f(sp(u + LU, v));
  const r = 3;
  const body = `M${q(13 + r, 24)}L${q(31 - r, 24)}Q${q(31, 24)} ${q(31, 24 + r)}L${q(31, 38 - r)}Q${q(31, 38)} ${q(31 - r, 38)}L${q(13 + r, 38)}Q${q(13, 38)} ${q(13, 38 - r)}L${q(13, 24 + r)}Q${q(13, 24)} ${q(13 + r, 24)}Z`;
  const shackle = `M${q(16.5, 25)}L${q(16.5, 20.5)}C${q(16.5, 13.2)} ${q(27.5, 13.2)} ${q(27.5, 20.5)}L${q(27.5, 25)}`;
  const hole = pts([0, 1, 2, 3, 4, 5, 6, 7].map((i) => sp(22 + LU + 2 * Math.cos((i * Math.PI) / 4), 30 + 2 * Math.sin((i * Math.PI) / 4))));
  return (
    <Frame size={size} {...rest}>
      <ellipse cx={cx + 26} cy={cy0 + 34} rx={rx + 8} ry={20} style={SHADOW} />
      <Disc cx={cx} cy={cy0} rx={rx} h={h} />
      <Disc cx={cx} cy={cy0 - step} rx={rx} h={h} />
      <Disc cx={cx} cy={cy0 - 2 * step} rx={rx} h={h} withTop />
      <path d={shield(-5.2, -3)} style={{ ...RIGHT, fill: 'var(--iso-line)' }} />
      <path d={shield(0, 0)} style={ACCENT} />
      <motion.path d={shackle} variants={latch} style={{ ...STROKE, fill: 'none', stroke: 'var(--iso-top)', strokeWidth: 2.4 }} />
      <path d={body} style={{ fill: 'var(--iso-top)', ...STROKE, strokeWidth: 1.2 }} />
      <polygon points={hole} style={{ fill: 'var(--iso-line)' }} />
    </Frame>
  );
}
