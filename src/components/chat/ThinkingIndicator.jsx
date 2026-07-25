import React, { useEffect, useMemo, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';


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


export default function ThinkingIndicator({ intervalMs = 2600 }) {

  const order = useMemo(() => shuffle(THINKING_PHRASES), []);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % order.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [order.length, intervalMs]);

  return (
    <div
      className="flex items-center gap-3 pt-1"
      role="status"
      aria-live="polite"
      aria-label="Assistant is thinking"
    >
      <ThinkingOrb state="solving" size={20} />
      {/* key={idx} remounts the span so the fade-in re-triggers on each phrase change. */}
      <span
        key={idx}
        className="text-sm animate-fade-in"
      >
        {order[idx]}
      </span>
    </div>
  );
}
