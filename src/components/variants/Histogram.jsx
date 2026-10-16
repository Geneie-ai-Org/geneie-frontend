import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

const BINS = 36;

/**
 * A tiny distribution strip that sits directly above a range slider and shares its axis.
 * Bars inside the selected span are filled teal, the rest are tinted. Height is square-root scaled so a long
 * tail stays visible; the axis is linear, so the bars line up with the slider thumbs.
 */
export function RangeHistogram({ values, rangeMin, rangeMax, lo, hi, caption, className }) {
  const model = useMemo(() => {
    const span = rangeMax - rangeMin;
    if (!values || !values.length || !(span > 0)) return null;
    const counts = new Array(BINS).fill(0);
    for (const v of values) {
      if (v < rangeMin || v > rangeMax) continue;
      counts[Math.min(BINS - 1, Math.floor(((v - rangeMin) / span) * BINS))] += 1;
    }
    const max = Math.max(...counts);
    if (!max) return null;
    let peak = 0;
    counts.forEach((c, i) => { if (c > counts[peak]) peak = i; });
    const edge = (i) => rangeMin + (span * i) / BINS;
    return { counts, max, peak, a: edge(peak), b: edge(peak + 1), span };
  }, [values, rangeMin, rangeMax]);

  if (!model) return null;
  const { counts, max, a, b, span } = model;
  const fmt = (n) => (Math.abs(n) >= 1e6 || (Math.abs(n) < 1e-3 && n !== 0) ? n.toExponential(1).replace('e+', 'e') : String(Number(n.toPrecision(3))));
  return (
    <figure className={cn('m-0', className)}>
      <div
        role="img"
        aria-label={`Distribution of ${caption || 'loaded values'}. The most common values fall between ${fmt(a)} and ${fmt(b)}.`}
        className="flex h-10 items-end gap-px"
      >
        {counts.map((c, i) => {
          const x0 = rangeMin + (span * i) / BINS;
          const x1 = rangeMin + (span * (i + 1)) / BINS;
          const inside = x1 > lo && x0 < hi;
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                'min-w-0 flex-1 rounded-t-[2px] transition-colors duration-150 motion-reduce:transition-none',
                inside ? 'bg-[hsl(var(--brand-500)/0.75)]' : 'bg-[hsl(var(--brand-300)/0.55)]'
              )}
              style={{ height: c ? `${Math.max(8, Math.sqrt(c / max) * 100)}%` : '2px', opacity: c ? 1 : 0.5 }}
            />
          );
        })}
      </div>
      {caption ? <figcaption className="mt-1 text-[11.5px] leading-snug text-muted-foreground">Distribution of {caption}.</figcaption> : null}
    </figure>
  );
}
