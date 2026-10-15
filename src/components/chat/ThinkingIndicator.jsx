import React, { useEffect, useMemo, useState } from 'react';
import { formatDuration } from '@/lib/formatDuration';
import { useElapsed } from '@/hooks/useRunTimer';


export const THINKING_PHRASES = [
  'Reading between the base pairs',
  'Following the evidence',
  'Consulting the literature',
  'Untangling the helix',
  'Looking for the signal',
  'Weighing the possibilities',
  'Sequencing my thoughts',
  'Checking what the databases say',
  'Connecting a few dots',
  'Asking the reference genome nicely',
  'Narrowing things down',
  'Thinking in nucleotides',
  'Cross-referencing the usual suspects',
  'Considering the alternatives',
  'Aligning my reads',
  'Sifting through the noise',
  'Interrogating the annotations',
  'Splicing together an answer',
  'Consulting the chromosomes',
  'Double-checking the details',
  'Waiting on the polymerase',
  'Putting it in context',
  'Translating to plain English',
  'Blaming it on a frameshift',
  'Almost there',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


/**
 * One quiet line: a small pulsing dot, the current step (when the caller knows it) or a rotating
 * phrase, and the elapsed time. The row has a fixed height so a changing phrase never moves
 * anything below it. The live region announces a stable label once, not every phrase.
 */
export default function ThinkingIndicator({ intervalMs = 2600, startedAt = null, step = null }) {

  const order = useMemo(() => shuffle(THINKING_PHRASES), []);
  const [idx, setIdx] = useState(0);
  const elapsedMs = useElapsed(startedAt);
  // Nothing for the first second: a counter that flickers "0s" the instant you hit send
  // reads as a glitch rather than a measurement.
  const elapsed = elapsedMs != null && elapsedMs >= 1000 ? formatDuration(elapsedMs) : null;

  useEffect(() => {
    if (step) return undefined;
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % order.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [order.length, intervalMs, step]);

  return (
    <div
      className="flex h-6 items-center gap-2 text-[13px]"
      role="status"
      aria-live="polite"
      aria-label={step ? `Geneie is working: ${step}` : 'Geneie is thinking'}
      style={{ color: 'var(--text-secondary)' }}
    >
      <span className="chat-thinking-dot shrink-0" aria-hidden />
      {/* key={idx} remounts the span so the fade-in re-triggers on each phrase change. */}
      <span key={step || idx} className="animate-fade-in truncate" aria-hidden>
        {step || `${order[idx]}…`}
      </span>
      {elapsed && (
        <span
          className="shrink-0 text-xs tabular-nums"
          style={{ color: 'var(--text-tertiary)' }}
          title="Time spent on this answer so far"
        >
          {elapsed}
        </span>
      )}
    </div>
  );
}
