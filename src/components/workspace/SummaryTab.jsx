import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CountUp, StageMark } from './motion';

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

function Stage({ stage }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-px flex size-6 shrink-0 items-center justify-center"><StageMark state={stage.state} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-[13px] font-medium', stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{stage.label}</span>
          <span className="wb-status" data-state={stage.state}>{STATE_WORD[stage.state]}</span>
        </div>
        {stage.detail ? <p className="mt-1 text-xs leading-5 tabular-nums text-muted-foreground">{stage.detail}</p> : null}
      </div>
    </li>
  );
}

function JumpRow({ title, meta, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn('wb-row disabled:pointer-events-none disabled:opacity-50', FOCUS)}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-foreground">{title}</span>
        {meta ? <span className="block truncate text-xs tabular-nums text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--wb-pill))] text-muted-foreground" aria-hidden="true">
        <ChevronRight className="wb-chev size-3.5" />
      </span>
    </button>
  );
}

export default function SummaryTab({ summary, jumps = [], emptyAction, className }) {
  if (!summary) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center gap-1.5 px-8 text-center', className)}>
        <span className="mb-1 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
          <FileText className="size-5" />
        </span>
        <p className="text-[15px] font-medium text-foreground">No file yet</p>
        <p className="max-w-xs text-[13px] leading-5 text-muted-foreground">Add a variants file or raw sequencing data from the composer. This tab then tracks where it stands.</p>
        {emptyAction ? (
          <Button variant="outline" size="sm" onClick={emptyAction.onClick} className="mt-2">{emptyAction.label}</Button>
        ) : null}
      </div>
    );
  }
  const { fileName, meta, inScope, total, stages, nextAction } = summary;
  const pct = inScope != null && total ? Math.max(2, Math.min(100, (inScope / total) * 100)) : null;
  const chips = meta ? meta.split(' · ') : [];
  return (
    <div className={cn('h-full min-h-0 space-y-3 overflow-y-auto px-4 pb-6 pt-1', className)}>
      <section className="wb-card wb-rise p-4" aria-label="File">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-medium text-foreground" title={fileName}>{fileName || 'Untitled file'}</h2>
            {chips.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((c) => <span key={c} className="wb-chip">{c}</span>)}
              </div>
            ) : null}
          </div>
        </div>

        {inScope != null ? (
          <div className="mt-4 rounded-xl bg-[hsl(var(--brand-50))] px-3.5 py-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-medium leading-none tabular-nums tracking-tight text-[hsl(var(--brand-700))]"><CountUp value={inScope} /></span>
              <span className="text-[13px] text-muted-foreground">{total != null ? `of ${nf(total)} variants in scope` : 'variants in scope'}</span>
            </div>
            {pct != null && pct < 100 ? (
              <div className="wb-track mt-3" role="progressbar" aria-label="Variants in scope" aria-valuemin={0} aria-valuemax={total} aria-valuenow={inScope}>
                <div className="wb-fill" style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {nextAction ? (
          <Button type="button" onClick={nextAction.onClick} className="mt-4 w-full" size="lg">
            {nextAction.label}
          </Button>
        ) : null}
      </section>

      <section className="wb-card wb-rise px-4 py-3" style={{ animationDelay: '60ms' }} aria-label="Progress">
        <h3 className="wb-card-title mb-1">Progress</h3>
        <ol className="divide-y divide-[hsl(var(--wb-line))]">
          {stages.map((s) => (
            <Stage key={s.id} stage={s} />
          ))}
        </ol>
      </section>

      {jumps.length > 0 ? (
        <section className="wb-rise" style={{ animationDelay: '120ms' }} aria-label="Open">
          <h3 className="wb-card-title mb-2 px-1">Open</h3>
          <ul className="space-y-2">
            {jumps.map((j) => (
              <li key={j.id}>
                <JumpRow title={j.title} meta={j.meta} onClick={j.onClick} disabled={j.disabled} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
