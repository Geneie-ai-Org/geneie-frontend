import React, { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/**
 * Small interaction pieces shared by the workbench tabs. Everything respects reduced motion
 * (it renders the final state) and only animates opacity, transform and stroke offsets.
 */

/** A number that rolls to its new value (variants in scope after a filter, etc.). */
export function CountUp({ value, duration = 0.7, className }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(Number.isFinite(Number(value)) ? Number(value) : 0);
  const from = useRef(shown);
  useEffect(() => {
    const to = Number(value);
    if (!Number.isFinite(to)) return undefined;
    if (reduce || from.current === to) { from.current = to; setShown(to); return undefined; }
    const controls = animate(from.current, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => { from.current = to; setShown(to); },
    });
    return () => { from.current = shown; controls.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

/**
 * Status glyph for a pipeline stage: dashed ring (pending), spinning arc (running),
 * ring + drawn check (done), ring + drawn cross (failed). The key replays the draw on a change.
 */
export function StageMark({ state = 'pending', size = 22, className }) {
  const tone = {
    pending: 'text-muted-foreground',
    running: 'text-[var(--info)]',
    done: 'text-[hsl(var(--brand-500))]',
    failed: 'text-[var(--error)]',
  }[state] || 'text-muted-foreground';
  return (
    <svg key={state} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`${tone} ${className || ''}`}>
      {state === 'pending' ? <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.5 3.5" opacity="0.7" /> : null}
      {state === 'running' ? (
        <g className="wb-spin">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.2" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : null}
      {state === 'done' ? (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" className="wb-draw wb-draw-ring" />
          <path d="M7.8 12.4l3 3 5.4-6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="wb-draw wb-draw-check" />
        </>
      ) : null}
      {state === 'failed' ? (
        <>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" className="wb-draw wb-draw-ring" />
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="wb-draw wb-draw-check" />
        </>
      ) : null}
    </svg>
  );
}
