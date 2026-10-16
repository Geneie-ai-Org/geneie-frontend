import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { niceTicks, rebin } from '@/lib/qcSummary';

/**
 * Inline-SVG charts for the native QC view, with the controls a chart needs:
 *   - drag across the plot to zoom into a region; once zoomed, drag pans
 *   - pinch (touch) or Ctrl/⌘ + scroll to zoom around the pointer; Shift + scroll or a trackpad swipe pans
 *   - double-click zooms in at the pointer (or resets when already zoomed)
 *   - the strip under the plot is a range slider: drag the window, or either handle to resize it
 *   - "−", "+" and Reset buttons; + / − / 0 keys; arrow keys move a readout cursor (and scroll when zoomed)
 *   - legend entries toggle a series on and off
 * No chart library: a few hundred points and the theme tokens, so light and dark come for free.
 */

const W = 600;
const H = 200;
const PAD = { l: 34, r: 16, t: 8, b: 22 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
const BRUSH_H = 34;
const HANDLE = 9;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** The visible window [lo, hi] (float indices) over n points, with the operations the gestures need. */
function useWindow(n, minSpan = 6) {
  const last = Math.max(0, n - 1);
  const [win, setWin] = useState({ lo: 0, hi: last });
  useEffect(() => { setWin({ lo: 0, hi: last }); }, [last]);

  const fit = useCallback((lo, hi) => {
    const span = clamp(hi - lo, Math.min(minSpan, last), last);
    const l = clamp(lo, 0, last - span);
    return { lo: l, hi: l + span };
  }, [last, minSpan]);

  const set = useCallback((lo, hi) => setWin(fit(lo, hi)), [fit]);
  const reset = useCallback(() => setWin({ lo: 0, hi: last }), [last]);
  const zoomAt = useCallback((center, factor) => setWin((w) => {
    const span = (w.hi - w.lo) * factor;
    const t = w.hi > w.lo ? (center - w.lo) / (w.hi - w.lo) : 0.5;
    const lo = center - t * span;
    return fit(lo, lo + span);
  }), [fit]);
  const panBy = useCallback((d) => setWin((w) => fit(w.lo + d, w.hi + d)), [fit]);
  const zoomed = win.hi - win.lo < last - 0.01;
  return { win, last, set, reset, zoomAt, panBy, zoomed, fit };
}

/**
 * Pointer + wheel + keyboard handling shared by both charts. `idxAt(clientX)` maps a pointer to a
 * (float) index in the current window; `onCursor(i)` reports the hovered / keyboard index.
 */
function useGestures({ svgRef, w, onCursor, cursor, count }) {
  const [sel, setSel] = useState(null);
  const pointers = useRef(new Map());
  const drag = useRef(null);
  const wRef = useRef(w);
  wRef.current = w;

  const idxAt = useCallback((clientX) => {
    const el = svgRef.current;
    const r = el.getBoundingClientRect();
    const { win } = wRef.current;
    const px = ((clientX - r.left) / r.width) * W;
    return win.lo + ((px - PAD.l) / PW) * (win.hi - win.lo);
  }, [svgRef]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const cur = wRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        cur.zoomAt(idxAt(e.clientX), Math.exp(e.deltaY * 0.0025));
      } else if (cur.zoomed && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const perPx = ((cur.win.hi - cur.win.lo) / PW) * (W / r.width);
        cur.panBy((e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * perPx);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgRef, idxAt]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const cur = wRef.current;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = {
        kind: 'pinch',
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        center: idxAt((a.x + b.x) / 2),
        win: cur.win,
      };
      setSel(null);
    } else {
      drag.current = { kind: cur.zoomed ? 'pan' : 'select', x: e.clientX, start: idxAt(e.clientX), win: cur.win, moved: false };
    }
  };

  const onPointerMove = (e) => {
    const cur = wRef.current;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d?.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = d.dist / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const span = (d.win.hi - d.win.lo) * factor;
      const t = (d.center - d.win.lo) / Math.max(1e-6, d.win.hi - d.win.lo);
      const lo = d.center - t * span;
      cur.set(lo, lo + span);
      return;
    }
    if (d && pointers.current.size === 1) {
      const r = e.currentTarget.getBoundingClientRect();
      if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
      d.moved = true;
      if (d.kind === 'pan') {
        const per = ((d.win.hi - d.win.lo) / PW) * (W / r.width);
        cur.set(d.win.lo - (e.clientX - d.x) * per, d.win.hi - (e.clientX - d.x) * per);
        return;
      }
      setSel({ a: d.start, b: idxAt(e.clientX) });
      return;
    }
    if (e.pointerType === 'mouse' || !pointers.current.size) onCursor(clamp(Math.round(idxAt(e.clientX)), 0, count - 1));
  };

  const end = (e) => {
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (d?.kind === 'select' && d.moved && sel) {
      const [a, b] = sel.a < sel.b ? [sel.a, sel.b] : [sel.b, sel.a];
      if (b - a >= 2) wRef.current.set(a, b);
    }
    if (!pointers.current.size) drag.current = null;
    setSel(null);
  };

  const onDoubleClick = (e) => {
    const cur = wRef.current;
    if (cur.zoomed || e.shiftKey) cur.reset();
    else cur.zoomAt(idxAt(e.clientX), 0.4);
  };

  const onKeyDown = (e) => {
    const cur = wRef.current;
    const mid = (cur.win.lo + cur.win.hi) / 2;
    const move = (to) => {
      const i = clamp(to, 0, count - 1);
      onCursor(i);
      if (cur.zoomed && (i < cur.win.lo || i > cur.win.hi)) cur.panBy(i < cur.win.lo ? i - cur.win.lo : i - cur.win.hi);
    };
    if (e.key === 'ArrowRight') { e.preventDefault(); move((cursor ?? Math.round(mid) - 1) + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move((cursor ?? Math.round(mid) + 1) - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(count - 1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); cur.zoomAt(cursor ?? mid, 0.6); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); cur.zoomAt(cursor ?? mid, 1.6); }
    else if (e.key === '0' || e.key === 'Escape') { if (cur.zoomed) { e.preventDefault(); e.stopPropagation(); cur.reset(); } }
  };

  return { sel, handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onDoubleClick, onKeyDown } };
}

const iconBtn = 'wb-chip !h-6 !px-2 cursor-pointer gap-1 outline-none transition-colors hover:!border-[hsl(var(--brand-300))] hover:!bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:cursor-default disabled:opacity-45 disabled:hover:!border-[hsl(var(--wb-line))] disabled:hover:!bg-[hsl(var(--wb-pill))] [@media(pointer:coarse)]:!h-9 [@media(pointer:coarse)]:!px-3';

/** Readout line + zoom buttons above a plot. */
function Toolbar({ readout, w, unit }) {
  const { win, zoomed } = w;
  const mid = (win.lo + win.hi) / 2;
  return (
    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="m-0 min-h-4 min-w-0 flex-1 basis-40 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">{readout}</p>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Zoom">
        <button type="button" className={iconBtn} aria-label="Zoom out" onClick={() => w.zoomAt(mid, 1.7)} disabled={!zoomed}><ZoomOut className="size-3" aria-hidden /></button>
        <button type="button" className={iconBtn} aria-label="Zoom in" onClick={() => w.zoomAt(mid, 0.55)}><ZoomIn className="size-3" aria-hidden /></button>
        <button type="button" className={iconBtn} aria-label={`Reset zoom${unit ? ` (${unit})` : ''}`} onClick={w.reset} disabled={!zoomed}><RotateCcw className="size-3" aria-hidden />Reset</button>
      </div>
    </div>
  );
}

const rangeText = (w, unit) => `Showing ${Math.round(w.win.lo) + 1}–${Math.round(w.win.hi) + 1} of ${w.last + 1}${unit ? ` ${unit}` : ''} · drag to pan`;
const IDLE_HINT = 'Drag across the plot to zoom · hover to read a value';

/**
 * Range slider under a plot: an overview of the whole series with the visible window on top. Drag the
 * window to pan, drag a handle to resize it, or click the track to centre the window there.
 */
function Brush({ w, overview }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const { win, last } = w;
  const x = (i) => PAD.l + (last > 0 ? (i / last) * PW : 0);
  const idx = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    return (((clientX - r.left) / r.width) * W - PAD.l) / PW * last;
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const i = idx(e.clientX);
    const nearL = Math.abs(x(win.lo) - (PAD.l + (i / last) * PW)) < HANDLE;
    const nearR = Math.abs(x(win.hi) - (PAD.l + (i / last) * PW)) < HANDLE;
    if (w.zoomed && nearL && !(nearR && i > (win.lo + win.hi) / 2)) drag.current = { mode: 'l' };
    else if (w.zoomed && nearR) drag.current = { mode: 'r' };
    else if (w.zoomed && i > win.lo && i < win.hi) drag.current = { mode: 'move', off: i - win.lo };
    else {
      const span = win.hi - win.lo;
      w.set(i - span / 2, i + span / 2);
      drag.current = { mode: 'move', off: span / 2 };
    }
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const i = idx(e.clientX);
    if (d.mode === 'l') w.set(Math.min(i, win.hi - 2), win.hi);
    else if (d.mode === 'r') w.set(win.lo, Math.max(i, win.lo + 2));
    else w.set(i - d.off, i - d.off + (win.hi - win.lo));
  };
  const onUp = () => { drag.current = null; };
  const wx = x(win.lo);
  const ww = Math.max(4, x(win.hi) - wx);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${BRUSH_H}`}
      role="group"
      aria-label="Zoom range: drag the window or its handles"
      className="mt-1 block h-auto w-full cursor-ew-resize touch-none select-none rounded-md"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <rect x={PAD.l} y="2" width={PW} height={BRUSH_H - 4} rx="6" style={{ fill: 'hsl(var(--wb-pill))', stroke: 'hsl(var(--wb-line))' }} />
      {overview(PAD.l, 4, PW, BRUSH_H - 8)}
      {w.zoomed && (
        <>
          <rect x={PAD.l} y="2" width={Math.max(0, wx - PAD.l)} height={BRUSH_H - 4} rx="6" style={{ fill: 'hsl(var(--wb-card) / 0.55)' }} pointerEvents="none" />
          <rect x={wx + ww} y="2" width={Math.max(0, PAD.l + PW - wx - ww)} height={BRUSH_H - 4} rx="6" style={{ fill: 'hsl(var(--wb-card) / 0.55)' }} pointerEvents="none" />
        </>
      )}
      <rect x={wx} y="2" width={ww} height={BRUSH_H - 4} rx="6" strokeWidth="1.4" style={{ fill: 'hsl(var(--brand-500) / 0.14)', stroke: 'hsl(var(--brand-500))' }} />
      {w.zoomed && [wx, wx + ww].map((hx, k) => (
        <rect key={k} x={hx - 2} y={BRUSH_H / 2 - 7} width="4" height="14" rx="2" style={{ fill: 'hsl(var(--brand-500))' }} />
      ))}
    </svg>
  );
}

/** Legend that doubles as series toggles (at least one series stays on). */
function Legend({ items, hidden, onToggle }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-1 gap-y-1 p-0 text-[11px] text-muted-foreground">
      {items.map((s) => {
        const off = hidden.has(s.key);
        return (
          <li key={s.key}>
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(s.key)}
              title={off ? `Show ${s.label}` : `Hide ${s.label}`}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 outline-none transition-colors hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] [@media(pointer:coarse)]:py-1.5 ${off ? 'opacity-45 line-through' : ''}`}
            >
              <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden className="shrink-0">
                <line x1="1" y1="4" x2="21" y2="4" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={s.dash || undefined} style={{ stroke: s.color }} />
              </svg>
              {s.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const axisText = { fill: 'hsl(var(--muted-foreground))' };

/**
 * Per-position line chart.
 * series: [{ key, label, values, color, dash?, width? }]. refs: [{ y, label }] dashed guide lines.
 */
export function LineChart({ series, yMin = 0, yMax, yFormat = (v) => v.toFixed(1), refs = [], xLabel = 'Position in read (bp)', ariaLabel, unit = 'bp', legend = true }) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const all = series.filter((s) => Array.isArray(s.values) && s.values.length > 1);
  const live = all.filter((s) => !hidden.has(s.key));
  const n = all.reduce((m, s) => Math.max(m, s.values.length), 0);
  const w = useWindow(n);
  const { win } = w;
  const toggle = useCallback((key) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(key)) next.delete(key); else if (all.length - next.size > 1) next.add(key);
    return next;
  }), [all.length]);

  const top = useMemo(() => {
    if (yMax != null) return yMax;
    const m = live.reduce((a, s) => Math.max(a, ...s.values.filter(Number.isFinite)), 0);
    return m > 0 ? m * 1.08 : 1;
  }, [live, yMax]);

  const span = win.hi - win.lo || 1;
  const x = (i) => PAD.l + ((i - win.lo) / span) * PW;
  const y = (v) => PAD.t + PH - ((Math.min(Math.max(v, yMin), top) - yMin) / (top - yMin || 1)) * PH;
  const yTicks = niceTicks(yMin, top, 4);
  const xTicks = niceTicks(win.lo + 1, win.hi + 1, 5).filter((t) => t >= win.lo + 1 && t <= win.hi + 1);

  const paths = useMemo(() => live.map((s) => ({
    ...s,
    d: s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number.isFinite(v) ? v : yMin).toFixed(1)}`).join(''),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [live, top, yMin, win.lo, win.hi]);

  const { sel, handlers } = useGestures({ svgRef, w, onCursor: setCursor, cursor, count: n });
  const overview = useCallback((ox, oy, ow, oh) => {
    const s = live[live.length - 1];
    if (!s) return null;
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${(ox + (i / (n - 1)) * ow).toFixed(1)} ${(oy + oh - ((Math.min(Math.max(v, yMin), top) - yMin) / (top - yMin || 1)) * oh).toFixed(1)}`).join('');
    return <path d={d} fill="none" strokeWidth="1.4" style={{ stroke: 'hsl(var(--brand-500))', opacity: 0.8 }} />;
  }, [live, n, yMin, top]);

  if (!all.length) return null;
  const cur = cursor != null && cursor <= n - 1 ? cursor : null;
  const selA = sel ? Math.min(sel.a, sel.b) : null;
  const selB = sel ? Math.max(sel.a, sel.b) : null;
  const readout = cur != null ? (
    <>
      <span className="font-medium text-foreground">Position {cur + 1}</span>
      {live.map((s) => <span key={s.key}>{' · '}{s.label} {Number.isFinite(s.values[cur]) ? yFormat(s.values[cur]) : '–'}</span>)}
    </>
  ) : (w.zoomed ? rangeText(w, unit) : IDLE_HINT);

  return (
    <div className="min-w-0">
      <Toolbar readout={readout} w={w} unit={unit} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`block h-auto w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] ${w.zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
        role="application"
        tabIndex={0}
        aria-label={`${ariaLabel}. Arrow keys read a position, plus and minus zoom, 0 resets.`}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
        {...handlers}
      >
        <title>{ariaLabel}</title>
        <defs><clipPath id={`${uid}-clip`}><rect x={PAD.l} y={PAD.t - 2} width={PW} height={PH + 4} /></clipPath></defs>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: 'hsl(var(--wb-line))' }} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={axisText}>{t}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t - 1)} y={H - 6} textAnchor="middle" fontSize="10" className="tabular-nums" style={axisText}>{t}</text>
        ))}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r.y)} y2={y(r.y)} strokeWidth="1" strokeDasharray="3 4" style={{ stroke: 'hsl(var(--brand-300))' }} />
            <text x={W - PAD.r - 2} y={y(r.y) - 3} textAnchor="end" fontSize="9.5" style={{ fill: 'hsl(var(--brand-700))' }}>{r.label}</text>
          </g>
        ))}
        <g clipPath={`url(#${uid}-clip)`}>
          {paths.map((s) => (
            <path key={s.key} d={s.d} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeWidth={s.width || 1.8} strokeDasharray={s.dash || undefined} style={{ stroke: s.color }} />
          ))}
        </g>
        {sel && (
          <rect x={x(selA)} y={PAD.t} width={Math.max(1, x(selB) - x(selA))} height={PH} rx="3" pointerEvents="none" style={{ fill: 'hsl(var(--brand-500) / 0.12)', stroke: 'hsl(var(--brand-500))' }} />
        )}
        {cur != null && cur >= win.lo - 0.5 && cur <= win.hi + 0.5 && !sel && (
          <g pointerEvents="none">
            <line x1={x(cur)} x2={x(cur)} y1={PAD.t} y2={PAD.t + PH} strokeWidth="1" style={{ stroke: 'hsl(var(--foreground) / 0.35)' }} />
            {live.map((s) => Number.isFinite(s.values[cur]) && (
              <circle key={s.key} cx={x(cur)} cy={y(s.values[cur])} r="3.2" strokeWidth="1.6" style={{ stroke: s.color, fill: 'hsl(var(--wb-card))' }} />
            ))}
          </g>
        )}
      </svg>
      <Brush w={w} overview={overview} />
      <p className="m-0 mt-0.5 text-center text-[10.5px] text-muted-foreground">{xLabel}</p>
      {legend && <Legend items={all} hidden={hidden} onToggle={toggle} />}
    </div>
  );
}

/** Insert-size histogram with the peak marked. `values[i]` = read pairs with insert size i. Zoom autoscales the y axis. */
export function Histogram({ values, peak, ariaLabel }) {
  const svgRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  const n = Array.isArray(values) ? values.length : 0;
  const w = useWindow(n, 12);
  const { win } = w;
  const a = Math.max(0, Math.ceil(win.lo));
  const b = Math.min(n - 1, Math.floor(win.hi));
  const bins = useMemo(() => rebin((values || []).slice(a, b + 1), 60).map((x) => ({ from: x.from + a, to: x.to + a, value: x.value })), [values, a, b]);
  const maxV = Math.max(1, ...bins.map((x) => x.value));
  const span = win.hi - win.lo || 1;
  const px = (i) => PAD.l + ((i - win.lo) / span) * PW;
  const yTicks = niceTicks(0, maxV, 3);
  const xTicks = niceTicks(win.lo, win.hi, 5).filter((t) => t >= win.lo && t <= win.hi);
  const { sel, handlers } = useGestures({ svgRef, w, onCursor: setCursor, cursor, count: n });
  const overview = useCallback((ox, oy, ow, oh) => {
    const ob = rebin(values || [], 60);
    const m = Math.max(1, ...ob.map((q) => q.value));
    const bw = ow / Math.max(1, ob.length);
    return ob.map((q, i) => {
      const h = (q.value / m) * oh;
      return <rect key={q.from} x={ox + i * bw + 0.4} y={oy + oh - h} width={Math.max(1, bw - 0.8)} height={h} style={{ fill: 'hsl(var(--brand-300))' }} />;
    });
  }, [values]);

  if (n < 2) return null;
  const hot = cursor != null ? bins.find((q) => cursor >= q.from && cursor <= q.to) : null;
  const selA = sel ? Math.min(sel.a, sel.b) : null;
  const selB = sel ? Math.max(sel.a, sel.b) : null;
  const readout = hot ? (
    <>
      <span className="font-medium text-foreground">{hot.from === hot.to ? `${hot.from} bp` : `${hot.from}–${hot.to} bp`}</span>
      {` · ${hot.value.toLocaleString('en-US')} read pairs`}
    </>
  ) : (w.zoomed ? `Showing ${a}–${b} bp · drag to pan` : IDLE_HINT);

  return (
    <div className="min-w-0">
      <Toolbar readout={readout} w={w} unit="bp" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`block h-auto w-full touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] ${w.zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
        role="application"
        tabIndex={0}
        aria-label={`${ariaLabel}. Arrow keys read a bar, plus and minus zoom, 0 resets.`}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
        {...handlers}
      >
        <title>{ariaLabel}</title>
        {yTicks.map((t) => {
          const yy = PAD.t + PH - (t / maxV) * PH;
          return (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} strokeWidth="1" style={{ stroke: 'hsl(var(--wb-line))' }} />
              <text x={PAD.l - 6} y={yy + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={axisText}>{t >= 1000 ? `${t / 1000}k` : t}</text>
            </g>
          );
        })}
        {bins.map((q) => {
          const x0 = px(q.from - 0.5);
          const x1 = px(q.to + 0.5);
          const h = (q.value / maxV) * PH;
          const isPeak = Number.isFinite(peak) && peak >= q.from && peak <= q.to;
          return (
            <rect
              key={q.from}
              x={Math.max(PAD.l, x0) + 0.6}
              y={PAD.t + PH - h}
              width={Math.max(1, Math.min(PAD.l + PW, x1) - Math.max(PAD.l, x0) - 1.2)}
              height={Math.max(h, q.value > 0 ? 1 : 0)}
              rx="1.5"
              style={{ fill: isPeak ? 'hsl(var(--brand-500))' : 'hsl(var(--brand-300))', opacity: hot && hot !== q ? 0.55 : 1, transition: 'opacity 120ms' }}
            />
          );
        })}
        {xTicks.map((t) => (
          <text key={t} x={px(t)} y={H - 6} textAnchor="middle" fontSize="10" className="tabular-nums" style={axisText}>{t}</text>
        ))}
        {sel && (
          <rect x={px(selA)} y={PAD.t} width={Math.max(1, px(selB) - px(selA))} height={PH} rx="3" pointerEvents="none" style={{ fill: 'hsl(var(--brand-500) / 0.12)', stroke: 'hsl(var(--brand-500))' }} />
        )}
      </svg>
      <Brush w={w} overview={overview} />
      <p className="m-0 mt-0.5 text-center text-[10.5px] text-muted-foreground">
        Insert size (bp){Number.isFinite(peak) ? ` · peak at ${peak} bp` : ''}
      </p>
    </div>
  );
}
