import React from 'react';
import { Check, ChevronRight, CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

/**
 * Summary: the first tab of the workbench. One place to see where a file stands.
 *
 *   file header  ->  stages (uploaded, annotated, filtered, chat ready)  ->  jump-to cards
 *
 * State words are fixed so nothing contradicts itself: done | running | pending | failed.
 * Pure presentation; `deriveSummary` turns the page's existing state into props.
 */

const STAGE_ICON = {
  done: () => <Check className="size-3" strokeWidth={2.4} aria-hidden="true" />,
  running: () => <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />,
  failed: () => <CircleAlert className="size-3" aria-hidden="true" />,
  pending: () => null,
};

const STAGE_TONE = {
  done: 'bg-[var(--success-soft)] text-[var(--success)]',
  running: 'bg-[var(--info-soft)] text-[var(--info)]',
  failed: 'bg-[var(--error-soft)] text-[var(--error)]',
  pending: 'border border-[var(--border-strong)] text-transparent',
};

// One vocabulary for every stage: nothing is ever shown by colour or icon alone.
export const STATE_WORD = { done: 'Done', running: 'Running', failed: 'Failed', pending: 'Not started' };

function nf(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : null;
}

/** Turn the page state into summary props. Defensive: every input may be missing. */
export function deriveSummary({
  fileName,
  genome,
  analysisType,
  sequencingType,
  totalVariants,
  filteredVariantCount,
  hasAnnotatedFile,
  requiresAnnovar,
  isRunningAnnovar,
  annovarFailed,
  isFiltering,
  filterActive,
  filterLabel,
  chatAllowed,
  chatReason,
  nextAction,
}) {
  const total = Number(totalVariants);
  const filtered = Number(filteredVariantCount);
  const annotated = Boolean(hasAnnotatedFile) || requiresAnnovar === false;
  const stages = [
    { id: 'uploaded', label: 'File uploaded', state: 'done', detail: Number.isFinite(total) ? `${nf(total)} variants` : null },
    {
      id: 'annotated',
      label: 'Annotated',
      state: isRunningAnnovar ? 'running' : annovarFailed ? 'failed' : annotated ? 'done' : 'pending',
      detail: isRunningAnnovar
        ? 'Adding clinical and population data'
        : annovarFailed
          ? 'Annotation did not finish, so ACMG and phenotype filters stay locked. Run it again.'
          : annotated ? null : 'Needed before ACMG and phenotype filters',
    },
    {
      id: 'filtered',
      label: 'Filtered',
      state: isFiltering ? 'running' : filterActive ? 'done' : 'pending',
      detail: isFiltering ? 'Applying filter' : filterActive ? filterLabel || 'Filter applied' : 'Optional: narrow the set before asking questions',
    },
    {
      id: 'chat',
      label: 'Ready to chat',
      state: chatAllowed ? 'done' : 'pending',
      detail: chatAllowed ? 'Ask about this set in the thread' : chatReason || 'Apply a filter to enable chat',
    },
  ];
  return {
    fileName,
    meta: [genome, sequencingType, analysisType].filter(Boolean).join(' · '),
    inScope: Number.isFinite(filtered) ? filtered : Number.isFinite(total) ? total : null,
    total: Number.isFinite(total) ? total : null,
    stages,
    nextAction: nextAction || null,
  };
}

function Stage({ stage, last }) {
  const Icon = STAGE_ICON[stage.state] || STAGE_ICON.pending;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last ? <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-border" aria-hidden="true" /> : null}
      <span className={cn('mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full', STAGE_TONE[stage.state])}>
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-[13px] font-medium', stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{stage.label}</span>
          <span className={cn('text-xs', stage.state === 'failed' ? 'text-[var(--error)]' : 'text-muted-foreground')}>{STATE_WORD[stage.state]}</span>
        </div>
        {stage.detail ? <p className="mt-0.5 text-xs leading-5 tabular-nums text-muted-foreground">{stage.detail}</p> : null}
      </div>
    </li>
  );
}

function JumpRow({ title, meta, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-10 w-full items-center gap-3 px-1 py-2 text-left transition-colors duration-150 hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
        FOCUS,
        'focus-visible:-outline-offset-2'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-foreground">{title}</span>
        {meta ? <span className="block truncate text-xs tabular-nums text-muted-foreground">{meta}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export default function SummaryTab({ summary, jumps = [], emptyAction, className }) {
  if (!summary) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-1 px-8 text-center', className)}>
        <p className="text-[15px] font-medium text-foreground">No file yet</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">Add a variants file or raw sequencing data from the composer. This tab then tracks where it stands.</p>
        {emptyAction ? (
          <Button variant="outline" size="sm" onClick={emptyAction.onClick} className="mt-2">{emptyAction.label}</Button>
        ) : null}
      </div>
    );
  }
  const { fileName, meta, inScope, total, stages, nextAction } = summary;
  const pct = inScope != null && total ? Math.max(1, Math.min(100, (inScope / total) * 100)) : null;
  return (
    <div className={cn('h-full min-h-0 overflow-y-auto px-4 py-4', className)}>
      <div>
        <h2 className="truncate text-[15px] font-medium text-foreground" title={fileName}>{fileName || 'Untitled file'}</h2>
        {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
      </div>

      {inScope != null ? (
        <div className="mt-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-medium tabular-nums text-foreground">{nf(inScope)}</span>
            <span className="text-[13px] text-muted-foreground">{total != null ? `of ${nf(total)} variants in scope` : 'variants in scope'}</span>
          </div>
          {pct != null && pct < 100 ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-[hsl(var(--signal))]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      <ol className="mt-6" aria-label="Progress">
        {stages.map((s, i) => (
          <Stage key={s.id} stage={s} last={i === stages.length - 1} />
        ))}
      </ol>

      {nextAction ? (
        <Button type="button" size="sm" onClick={nextAction.onClick} className={cn('mt-4', 'focus-visible:border-transparent focus-visible:ring-[hsl(var(--ring))]')}>
          {nextAction.label}
        </Button>
      ) : null}

      {jumps.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Jump to</h3>
          <ul className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {jumps.map((j) => (
              <li key={j.id}>
                <JumpRow title={j.title} meta={j.meta} onClick={j.onClick} disabled={j.disabled} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
