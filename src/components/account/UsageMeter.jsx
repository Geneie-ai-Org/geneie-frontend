import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion';

/**
 * Usage meters for the account screens (rail footer, Settings > Plan and usage, top-up).
 * Presentation only: callers pass the numbers they already have.
 *
 * The counter is honest. `used` is never clamped for display ("49 of 10" stays "49 of 10"); only
 * the bar is clamped to full. Past the limit the meter says so in words and in the error tone.
 */

/** ok | near (80% and up) | full (used all of it) | over (used more than the limit). */
export function meterStatus(used, limit) {
  const u = Number(used) || 0;
  const l = Number(limit);
  if (!Number.isFinite(l) || l <= 0) return { state: 'ok', pct: 0, over: 0, word: null };
  const pct = Math.min((u / l) * 100, 100);
  if (u > l) return { state: 'over', pct: 100, over: u - l, word: 'Over limit' };
  if (u === l) return { state: 'full', pct: 100, over: 0, word: 'Limit reached' };
  if (pct >= 80) return { state: 'near', pct, over: 0, word: 'Almost used' };
  return { state: 'ok', pct, over: 0, word: null };
}

const FILL = {
  ok: undefined,
  near: 'var(--warning)',
  full: 'var(--error)',
  over: 'var(--error)',
};

/** The slim pill track with a fill that glides to its width. `decorative` drops the progressbar role. */
export function UsageBar({ used, limit, label = 'Usage', decorative = false, className }) {
  const reduce = useReducedMotion();
  const { state, pct, word } = meterStatus(used, limit);
  const [shown, setShown] = useState(reduce ? pct : 0);
  useEffect(() => {
    if (reduce) { setShown(pct); return undefined; }
    // The first paint is at 0; a short timer (not rAF, which a background tab pauses) then sets the width so it glides.
    const t = setTimeout(() => setShown(pct), 50);
    return () => clearTimeout(t);
  }, [pct, reduce]);
  const u = Number(used) || 0;
  const aria = decorative
    ? {}
    : {
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': Number(limit),
        'aria-valuenow': Math.min(u, Number(limit)),
        'aria-valuetext': `${u} of ${limit} used${word ? `, ${word.toLowerCase()}` : ''}`,
      };
  return (
    <div className={cn('wb-track', className)} {...aria}>
      <div className="wb-fill" style={{ width: `${shown}%`, backgroundColor: FILL[state] }} />
    </div>
  );
}

/** Status pill for a meter that is nearly or fully used. Colour is never the only signal: it has a word. */
export function MeterWord({ used, limit, className }) {
  const { state, word, over } = meterStatus(used, limit);
  if (!word) return null;
  const text = state === 'over' ? `Over limit by ${over.toLocaleString()}` : word;
  if (state === 'near') {
    return (
      <span className={cn('wb-status wb-rise', className)} style={{ backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' }}>{text}</span>
    );
  }
  return <span className={cn('wb-status wb-rise', className)} data-state="failed">{text}</span>;
}

/**
 * Label, counter, bar and (when needed) a status word.
 * `compact` is the rail footer layout; the default is the settings row.
 */
export default function UsageMeter({ label, used, limit, detail, compact = false, className }) {
  const { state } = meterStatus(used, limit);
  const u = Number(used) || 0;
  const bad = state === 'over' || state === 'full';
  return (
    <div className={className} role="group" aria-label={label}>
      <div className={cn('flex items-baseline justify-between gap-3', compact ? 'text-[12px]' : 'text-[13px]')}>
        <span className={compact ? 'text-muted-foreground' : 'font-medium text-foreground'}>{label}</span>
        <span className={cn('tabular-nums', bad ? 'font-medium text-[var(--error)]' : compact ? 'text-[var(--text-secondary)]' : 'text-muted-foreground')}>
          <CountUp value={u} duration={0.5} /> of {Number(limit).toLocaleString()}
        </span>
      </div>
      <UsageBar used={u} limit={limit} label={label} className={compact ? 'mt-1.5' : 'mt-2'} />
      {state !== 'ok' || detail ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <MeterWord used={u} limit={limit} />
          {detail ? <span className="text-[12px] tabular-nums text-muted-foreground">{detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
