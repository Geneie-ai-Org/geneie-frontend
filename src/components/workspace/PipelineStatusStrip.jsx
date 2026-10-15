import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One-line status for whatever is running or ready, shown above the composer. It replaces the
 * stack of banner + file card + stepper that used to sit between the thread and the input; the
 * full detail lives in the workspace "Pipeline" tab (`onOpen`).
 *
 * Status vocabulary (one word, never a spinner next to a contradicting label):
 *   queued | running | done | failed | idle
 */
const TONE = {
  queued: 'bg-[var(--info)]',
  running: 'bg-[var(--info)] animate-pulse',
  done: 'bg-[var(--success)]',
  failed: 'bg-[var(--error)]',
  idle: 'bg-[var(--text-disabled)]',
};

const WORD = { queued: 'Queued', running: 'Running', done: 'Ready', failed: 'Failed', idle: '' };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive the strip's content from the page's existing state. Defensive on purpose: every input
 * may be missing, and a missing input must degrade to "no strip", never throw.
 */
export function derivePipelineStrip({
  module1Job,
  module1JobActive,
  fileName,
  uploadInProgress,
  uploadProgress,
  isRunningAnnovar,
  isApplyingProprietaryFilter,
  isRunningExomiser,
  chatEligibility,
  hasDocument,
  filteredVariantCount,
}) {
  if (module1Job && module1JobActive) {
    const phase = String(module1Job.phase || module1Job.status || '').toLowerCase();
    const queued = /queue|pending/.test(phase);
    const pct = num(module1Job.progressPercent);
    return {
      state: queued ? 'queued' : 'running',
      title: module1Job.sampleName || 'Raw sequencing run',
      detail:
        (queued ? 'Waiting for a worker' : module1Job.message || 'Running') +
        (pct != null ? ` · ${Math.round(pct)}%` : ''),
      progress: pct,
    };
  }
  if (uploadInProgress) {
    const p = num(uploadProgress);
    return { state: 'running', title: fileName || 'Variant file', detail: 'Uploading and checking the file', progress: p };
  }
  if (isRunningAnnovar) return { state: 'running', title: fileName || 'Variant file', detail: 'Annotating variants', progress: null };
  if (isRunningExomiser) return { state: 'running', title: fileName || 'Variant file', detail: 'Ranking variants by phenotype', progress: null };
  if (isApplyingProprietaryFilter) return { state: 'running', title: fileName || 'Variant file', detail: 'Applying filter', progress: null };
  if (hasDocument) {
    const allowed = chatEligibility?.allowed;
    const n = num(filteredVariantCount);
    return {
      state: allowed ? 'done' : 'idle',
      title: fileName || 'Variant file',
      detail: allowed
        ? n != null ? `${n.toLocaleString()} variants in scope · chat is ready` : 'Chat is ready'
        : chatEligibility?.requires_annovar
          ? 'Run annotation to continue'
          : 'Apply a filter to enable chat',
      progress: null,
    };
  }
  return null;
}

export default function PipelineStatusStrip({ status, onOpen, className }) {
  if (!status) return null;
  const { state, title, detail, progress, action } = status;
  return (
    <div
      className={cn(
        'mx-auto mb-2 flex w-full max-w-[var(--chat-max-width)] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-[13px]',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn('size-2 shrink-0 rounded-full', TONE[state] || TONE.idle)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-foreground">{title}</span>
          {WORD[state] ? <span className="shrink-0 text-xs text-muted-foreground">{WORD[state]}</span> : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
        {progress != null ? (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
          </div>
        ) : null}
      </div>
      {action?.onClick ? (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex shrink-0 items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {action.label}
        </button>
      ) : null}
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Details <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
