import React, { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const DOT_INTERVAL_MS = 420;

/**
 * A status line that types itself out and then keeps a trailing run of dots moving.
 *
 * Used where a job is running but its progress isn't worth a number or a stroke: the
 * text itself is the liveness cue, so the card can stay a plain card. Any trailing dots
 * or ellipsis in `text` are dropped — the animated ones replace them.
 *
 * Reduced motion gets the finished line with a static ellipsis.
 */
export default function TypewriterText({
  text,
  speedMs = 22,
  className = '',
  style = undefined,
}) {
  const reduceMotion = useReducedMotion();
  const base = useMemo(() => String(text || '').replace(/[.…\s]+$/, ''), [text]);
  const [typed, setTyped] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (reduceMotion) {
      setTyped(base.length);
      return undefined;
    }
    setTyped(0);
    if (!base) return undefined;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= base.length) clearInterval(timer);
    }, speedMs);
    return () => clearInterval(timer);
  }, [base, speedMs, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const timer = setInterval(() => setDots((d) => (d % 3) + 1), DOT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const settled = typed >= base.length;

  return (
    <span className={className} style={style} aria-label={`${base}…`}>
      <span aria-hidden>
        {base.slice(0, typed)}
        {/* Dots hold their width so the line doesn't jitter as they cycle. */}
        {settled && (
          <span className="inline-block w-[1.1em] text-left">
            {reduceMotion ? '…' : '.'.repeat(dots)}
          </span>
        )}
      </span>
    </span>
  );
}
