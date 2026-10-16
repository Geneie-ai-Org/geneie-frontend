import React, { useCallback, useId, useMemo, useState } from 'react';
import { niceTicks, rebin } from '@/lib/qcSummary';

/**
 * Small inline-SVG charts for the native QC view. No chart library: a few hundred points, a hover
 * readout, and the theme tokens (so light and dark come for free). Both charts scale with their
 * container (viewBox) and are keyboard readable (arrow keys move the readout).
 */

const W = 600;
const H = 200;
const PAD = { l: 34, r: 16, t: 8, b: 22 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

const lineLabel = (s, i, fmt) => {
  const v = s.values?.[i];
  return `${s.label} ${Number.isFinite(v) ? fmt(v) : '–'}`;
};

/** Legend swatch that repeats the dash pattern, so lines are told apart by more than colour. */
function Swatch({ color, dash }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={dash || undefined} style={{ stroke: color }} />
    </svg>
  );
}

export function ChartLegend({ items }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11px] text-muted-foreground">
      {items.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <Swatch color={s.color} dash={s.dash} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Per-position line chart.
 * series: [{ key, label, values, color, dash?, width? }]. refs: [{ y, label }] dashed guide lines.
 */
export function LineChart({ series, yMin = 0, yMax, yFormat = (v) => v.toFixed(1), refs = [], xLabel = 'Position in read (bp)', ariaLabel }) {
  const uid = useId();
  const [at, setAt] = useState(null);
  const live = series.filter((s) => Array.isArray(s.values) && s.values.length > 1);
  const n = live.reduce((m, s) => Math.max(m, s.values.length), 0);

  const top = useMemo(() => {
    if (yMax != null) return yMax;
    const m = live.reduce((a, s) => Math.max(a, ...s.values.filter(Number.isFinite)), 0);
    return m > 0 ? m * 1.08 : 1;
  }, [live, yMax]);

  const x = (i) => PAD.l + (n > 1 ? (i / (n - 1)) * PW : 0);
  const y = (v) => PAD.t + PH - ((Math.min(Math.max(v, yMin), top) - yMin) / (top - yMin || 1)) * PH;
  const yTicks = niceTicks(yMin, top, 4);
  const xTicks = niceTicks(1, n, 5).filter((t) => t >= 1 && t <= n);

  const paths = useMemo(
    () => live.map((s) => ({
      ...s,
      d: s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number.isFinite(v) ? v : yMin).toFixed(1)}`).join(''),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, top, yMin, n],
  );

  const pick = useCallback((clientX, rect) => {
    const rel = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PAD.l) / PW) * (n - 1));
    setAt(Math.max(0, Math.min(n - 1, i)));
  }, [n]);

  if (!live.length) return null;
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 min-h-4 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
        {at == null ? 'Hover or use the arrow keys to read a position' : (
          <>
            <span className="font-medium text-foreground">Position {at + 1}</span>
            {live.map((s) => <span key={s.key}>{' · '}{lineLabel(s, at, yFormat)}</span>)}
          </>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setAt(null)}
        onFocus={() => setAt((v) => v ?? 0)}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setAt((v) => Math.min(n - 1, (v ?? -1) + 1)); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); setAt((v) => Math.max(0, (v ?? 1) - 1)); }
          else if (e.key === 'Home') { e.preventDefault(); setAt(0); }
          else if (e.key === 'End') { e.preventDefault(); setAt(n - 1); }
        }}
      >
        <title>{ariaLabel}</title>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: 'hsl(var(--wb-line))' }} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={{ fill: 'hsl(var(--muted-foreground))' }}>{t}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize="10" className="tabular-nums" style={{ fill: 'hsl(var(--muted-foreground))' }}>{t}</text>
        ))}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r.y)} y2={y(r.y)} strokeWidth="1" strokeDasharray="3 4" style={{ stroke: 'hsl(var(--brand-300))' }} />
            <text x={W - PAD.r - 2} y={y(r.y) - 3} textAnchor="end" fontSize="9.5" style={{ fill: 'hsl(var(--brand-700))' }}>{r.label}</text>
          </g>
        ))}
        {paths.map((s) => (
          <path key={s.key} d={s.d} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeWidth={s.width || 1.8} strokeDasharray={s.dash || undefined} style={{ stroke: s.color }} />
        ))}
        {at != null && (
          <g pointerEvents="none">
            <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={PAD.t + PH} strokeWidth="1" style={{ stroke: 'hsl(var(--foreground) / 0.35)' }} />
            {live.map((s) => Number.isFinite(s.values[at]) && (
              <circle key={s.key} cx={x(at)} cy={y(s.values[at])} r="3.2" strokeWidth="1.6" style={{ stroke: s.color, fill: 'hsl(var(--wb-card))' }} />
            ))}
          </g>
        )}
        <desc id={`${uid}-d`}>{xLabel}</desc>
      </svg>
      <p className="m-0 mt-0.5 text-center text-[10.5px] text-muted-foreground">{xLabel}</p>
    </div>
  );
}

/** Insert-size histogram with the peak marked. `values[i]` = read pairs with insert size i. */
export function Histogram({ values, peak, ariaLabel }) {
  const [at, setAt] = useState(null);
  const bins = useMemo(() => rebin(values, 60), [values]);
  if (!bins.length) return null;
  const maxV = Math.max(1, ...bins.map((b) => b.value));
  const bw = PW / bins.length;
  const peakBin = Number.isFinite(peak) ? bins.findIndex((b) => peak >= b.from && peak <= b.to) : -1;
  const yTicks = niceTicks(0, maxV, 3);
  const last = values.length - 1;
  const xTicks = niceTicks(0, last, 5);
  const bx = (v) => PAD.l + (v / Math.max(1, last)) * PW;
  const cur = at != null ? bins[at] : null;

  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 min-h-4 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
        {cur ? (
          <>
            <span className="font-medium text-foreground">{cur.from === cur.to ? `${cur.from} bp` : `${cur.from}–${cur.to} bp`}</span>
            {` · ${cur.value.toLocaleString('en-US')} read pairs`}
          </>
        ) : 'Hover or use the arrow keys to read a bar'}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerLeave={() => setAt(null)}
        onFocus={() => setAt((v) => v ?? Math.max(0, peakBin))}
        onBlur={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setAt((v) => Math.min(bins.length - 1, (v ?? -1) + 1)); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); setAt((v) => Math.max(0, (v ?? 1) - 1)); }
        }}
      >
        <title>{ariaLabel}</title>
        {yTicks.map((t) => {
          const yy = PAD.t + PH - (t / maxV) * PH;
          return (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} strokeWidth="1" style={{ stroke: 'hsl(var(--wb-line))' }} />
              <text x={PAD.l - 6} y={yy + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={{ fill: 'hsl(var(--muted-foreground))' }}>{t >= 1000 ? `${t / 1000}k` : t}</text>
            </g>
          );
        })}
        {bins.map((b, i) => {
          const h = (b.value / maxV) * PH;
          const hot = i === peakBin;
          return (
            <rect
              key={b.from}
              x={PAD.l + i * bw + 0.6}
              y={PAD.t + PH - h}
              width={Math.max(1, bw - 1.2)}
              height={Math.max(h, b.value > 0 ? 1 : 0)}
              rx="1.5"
              onPointerEnter={() => setAt(i)}
              style={{ fill: hot ? 'hsl(var(--brand-500))' : 'hsl(var(--brand-300))', opacity: at != null && at !== i ? 0.55 : 1, transition: 'opacity 120ms' }}
            />
          );
        })}
        {xTicks.map((t) => (
          <text key={t} x={bx(t)} y={H - 6} textAnchor="middle" fontSize="10" className="tabular-nums" style={{ fill: 'hsl(var(--muted-foreground))' }}>{t}</text>
        ))}
      </svg>
      <p className="m-0 mt-0.5 text-center text-[10.5px] text-muted-foreground">
        Insert size (bp){Number.isFinite(peak) ? ` · peak at ${peak} bp` : ''}
      </p>
    </div>
  );
}
