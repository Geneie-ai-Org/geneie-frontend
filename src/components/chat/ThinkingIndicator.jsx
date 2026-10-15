import React, { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatDuration } from '@/lib/formatDuration';
import { useElapsed } from '@/hooks/useRunTimer';
import { useAnnounce } from './useAnnounce';

/** Kept for importers; the running line now shows the real step instead of a rotating phrase. */
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

function stepText(step) {
  if (step == null) return '';
  if (typeof step === 'string') return step;
  return step.text || step.label || '';
}

/**
 * The quiet gray status line of a turn. Finished: "Worked for 1m 24s ›". Running: "Working… 12s"
 * plus the current step when the caller knows it. When a step log exists (`steps`, strings or
 * `{ text }`) the whole line is a toggle that opens it; without data it is static.
 */
export function WorkedLine({ running = false, elapsedMs = null, step = null, steps = null, className = '', rule = false }) {
  const [open, setOpen] = useState(false);
  const logId = useId();
  const time = elapsedMs != null && elapsedMs >= 1000 ? formatDuration(elapsedMs) : null;
  const log = (steps || []).map(stepText).filter(Boolean);
  const expandable = log.length > 0;

  const label = running ? (
    <>
      <span>{time ? `Working… ${time}` : 'Working…'}</span>
      {step ? <span className="min-w-0 truncate">· {step}</span> : null}
    </>
  ) : (
    <span>{time ? `Worked for ${time}` : 'Worked for under 1s'}</span>
  );

  // The chevron only shows when there is a step log to open: no dead affordance.
  const chevron = expandable ? <ChevronRight className="chat-worked-chev" aria-hidden /> : null;

  return (
    <div className={className}>
      {expandable ? (
        <button
          type="button"
          className="chat-worked"
          aria-expanded={open}
          aria-controls={logId}
          onClick={() => setOpen((v) => !v)}
        >
          {label}
          {chevron}
        </button>
      ) : (
        <div className="chat-worked">
          {label}
        </div>
      )}
      {expandable && open && (
        <ol id={logId} className="chat-worked-log">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
      {rule && <div className="chat-worked-rule" aria-hidden />}
    </div>
  );
}

/**
 * Running state of a turn: "Working… 12s" (and the current step if given). The row has a fixed
 * height so a changing step never moves anything below it. One live region speaks a full phrase
 * ("Geneie is working: Querying ClinVar") when the step changes, never on a timer tick.
 */
export default function ThinkingIndicator({ startedAt = null, step = null, steps = null, intervalMs: _unused = 2600 }) {
  const elapsedMs = useElapsed(startedAt);
  const spoken = useAnnounce(step ? `Geneie is working: ${step}` : 'Geneie is working');
  return (
    <div>
      <span className="sr-only" role="status">{spoken}</span>
      <WorkedLine running elapsedMs={elapsedMs} step={step} steps={steps} />
    </div>
  );
}
