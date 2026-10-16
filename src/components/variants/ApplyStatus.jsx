import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { CountUp, SPRING } from '@/components/motion';
import { cn } from '@/lib/utils';

const STEPS = [
  ['draft', 'Draft'],
  ['applying', 'Applying'],
  ['applied', 'Applied'],
];

/** "2 added, 1 changed" from a diff of filter columns. Empty string when nothing differs. */
export function describeDiff(d) {
  if (!d) return '';
  const parts = [];
  if (d.added) parts.push(`${d.added} added`);
  if (d.changed) parts.push(`${d.changed} changed`);
  if (d.removed) parts.push(`${d.removed} removed`);
  return parts.join(', ');
}

/**
 * The apply state machine, shown once: Draft (unapplied edits) -> Applying (request in flight) -> Applied.
 * A sliding pill marks the current step. After an apply, the diff stays: what changed and how the count moved.
 * `phase` is 'clean' | 'dirty' | 'applying' | 'applied'.
 */
export default function ApplyStatus({ phase, pending, diff, scopeNow }) {
  const reduce = useReducedMotion();
  const active = phase === 'dirty' ? 'draft' : phase === 'applying' ? 'applying' : phase === 'applied' ? 'applied' : null;
  const pendingText = describeDiff(pending);
  const diffText = describeDiff(diff);
  const delta = diff ? diff.to - diff.from : 0;
  if (phase === 'clean') return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <ol aria-label="Apply progress" className="m-0 flex list-none items-center gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] p-0.5">
          {STEPS.map(([key, label]) => {
            const on = active === key;
            return (
              <li
                key={key}
                aria-current={on ? 'step' : undefined}
                className={cn(
                  'relative inline-flex h-6 items-center rounded-full px-2.5 text-[12px] transition-colors duration-150 motion-reduce:transition-none',
                  on ? 'font-medium text-[hsl(var(--brand-700))]' : 'text-muted-foreground'
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="apply-phase-pill"
                    aria-hidden
                    transition={reduce ? { duration: 0 } : SPRING}
                    style={{ borderRadius: 9999 }}
                    className="absolute inset-0 border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]"
                  />
                ) : null}
                <span className="relative">{label}</span>
              </li>
            );
          })}
        </ol>
        {diff && phase !== 'dirty' ? (
          <span
            className="wb-chip tabular-nums"
            data-tone="brand"
            title={`${diff.from.toLocaleString()} to ${diff.to.toLocaleString()} variants in scope${diffText ? `. ${diffText}` : ''}`}
          >
            <span>{diff.from.toLocaleString()}</span>
            <ArrowRight aria-hidden className="size-3" />
            <span className="font-medium"><CountUp value={diff.to} startAt={diff.from} duration={0.6} /></span>
            {delta !== 0 ? <span className="text-[hsl(var(--brand-700))]/80">{delta > 0 ? '+' : '−'}{Math.abs(delta).toLocaleString()}</span> : null}
          </span>
        ) : phase === 'dirty' ? (
          <span className="wb-chip tabular-nums" title="Variants in scope right now">{scopeNow.toLocaleString()} now</span>
        ) : null}
      </div>
      {phase === 'dirty' && pendingText ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          {pendingText.charAt(0).toUpperCase() + pendingText.slice(1)}. The count updates when you apply.
        </p>
      ) : phase === 'applied' && diffText ? (
        <p className="text-[12px] leading-snug text-muted-foreground">{diffText.charAt(0).toUpperCase() + diffText.slice(1)}.</p>
      ) : null}
    </div>
  );
}
