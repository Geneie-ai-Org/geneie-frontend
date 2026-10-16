import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small shared pieces for the Variants sidebar modes (ACMG, Phenotype). */

const PILL_TONES = {
  success: { state: 'done' },
  info: { state: 'running' },
  error: { state: 'failed' },
  muted: { state: 'pending' },
  warning: { state: 'pending', warn: true },
};

/** The mode status as a shared status pill (dot plus word). Warning keeps the amber tint. */
export function ModePill({ tone = 'muted', children }) {
  const t = PILL_TONES[tone] || PILL_TONES.muted;
  return (
    <span
      className="wb-status shrink-0"
      data-state={t.state}
      style={t.warn ? { background: 'var(--warning-soft)', color: 'var(--warning)', borderColor: 'transparent' } : undefined}
    >
      {children}
    </span>
  );
}

/** "AI suggested": a dashed brand outline and a sparkle, so it never reads like a user-made pick. */
export function AiSuggestedTag({ className, children = 'AI suggested' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-dashed border-[hsl(var(--brand-300))] px-1.5 text-[11px] font-medium text-[hsl(var(--brand-700))]',
        className
      )}
    >
      <Sparkles aria-hidden className="size-3" />
      {children}
    </span>
  );
}

/** A quiet placeholder pill used in calm previews of a locked state. */
export function GhostPill({ w = 72, className }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-6 rounded-full border border-dashed border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-pill)/0.6)]', className)}
      style={{ width: w }}
    />
  );
}
