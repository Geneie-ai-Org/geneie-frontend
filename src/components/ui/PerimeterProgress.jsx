import { useEffect, useRef, useState } from 'react';

/**
 * Progress drawn as a stroke travelling the container's perimeter.
 *
 * The direction is fixed everywhere in the app: it starts at the bottom-left, runs up
 * the left edge, across the top, and down the right edge. So progress always reads as
 * "wrapping around the thing that is working", never as a bar you have to find.
 *
 * `variant="u"` leaves the bottom edge out — for surfaces whose bottom is occluded
 * (the pipeline drawer tucks under the composer). `variant="loop"` closes the path
 * along the bottom, for free-standing cards and dialogs.
 *
 * `progress` is 0–100, or null/undefined for indeterminate, which sweeps a short dash
 * along the same path instead of growing.
 *
 * The parent must be `position: relative`. Real pixel dimensions are needed because a
 * normalized viewBox would distort the corner radii and the stroke width, so the
 * element measures itself; `pathLength="100"` then makes the dash maths resolution-
 * independent.
 */
export default function PerimeterProgress({
  progress = null,
  radius = 16,
  strokeWidth = 2,
  color = 'var(--accent-teal)',
  variant = 'loop',
  className = '',
}) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  if (!w || !h) return <span ref={ref} className="hidden" aria-hidden />;

  const half = strokeWidth / 2;
  const x0 = half;
  const y0 = half;
  const x1 = w - half;
  const y1 = h - half;
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));

  // Bottom-left → up the left edge → across the top → down the right edge.
  const bottomY = variant === 'u' ? h : y1 - r;
  let d =
    `M${x0},${bottomY} L${x0},${y0 + r}` +
    ` A${r},${r} 0 0 1 ${x0 + r},${y0}` +
    ` L${x1 - r},${y0}` +
    ` A${r},${r} 0 0 1 ${x1},${y0 + r}` +
    ` L${x1},${bottomY}`;
  if (variant === 'loop') {
    d +=
      ` A${r},${r} 0 0 1 ${x1 - r},${y1}` +
      ` L${x0 + r},${y1}` +
      ` A${r},${r} 0 0 1 ${x0},${y1 - r}`;
  }

  const indeterminate = progress == null || Number.isNaN(Number(progress));
  const pct = indeterminate ? 0 : Math.max(0, Math.min(100, Number(progress)));

  return (
    <svg
      ref={ref}
      className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${className}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength="100"
        className={indeterminate ? 'perimeter-progress--indeterminate' : undefined}
        strokeDasharray={indeterminate ? '18 82' : `${pct} 100`}
        style={indeterminate ? undefined : { transition: 'stroke-dasharray var(--transition-slow)' }}
      />
    </svg>
  );
}
