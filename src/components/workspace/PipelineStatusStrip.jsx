import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAnnounce } from '@/components/chat/useAnnounce';

/**
 * One quiet gray card above the composer for whatever is running or ready. It replaces the stack
 * of banner + file card + stepper that used to sit between the thread and the input; the full
 * detail lives in the workspace "Pipeline" tab (`onOpen`).
 *
 * `notice` ({ message, ctaLabel, onCta, onDismiss }) adds one muted second line inside the same
 * card (a plan or usage note with a text-link action and a dismiss). With a notice and no status
 * the card shows just that line.
 *
 * Status vocabulary (one word, never a spinner next to a contradicting label):
 *   queued | running | done | failed | idle
 *
 * Screen readers get one live region with a full phrase ("file.tsv. Running. Annotating
 * variants"), without the percentage, so it speaks on a change of state, not on every tick.
 */
const TONE = {
  queued: 'bg-[var(--info)]',
  running: 'bg-[var(--info)] animate-pulse motion-reduce:animate-none',
  done: 'bg-[var(--success)]',
  failed: 'bg-[var(--error)]',
  idle: 'bg-[var(--text-disabled)]',
};

const WORD = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', idle: '' };

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

const BTN =
  'chat-focus inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[.98] motion-reduce:transition-none [@media(pointer:coarse)]:h-11';

export default function PipelineStatusStrip({ status, onOpen, notice, className }) {
  const phrase = status
    ? [status.title, WORD[status.state], String(status.detail || '').replace(/\s*·\s*\d+(\.\d+)?%$/, '')]
        .filter(Boolean)
        .join('. ')
    : '';
  const spoken = useAnnounce(phrase);
  if (!status && !notice) return null;

  const { state, title, detail, progress, action } = status || {};
  const pct = progress != null ? Math.max(2, Math.min(100, progress)) : null;

  return (
    <div
      className={cn(
        'chat-strip relative mx-auto mb-2 w-full max-w-[var(--chat-max-width)] overflow-hidden rounded-xl bg-muted px-3.5 py-2.5 text-[13px] tabular-nums',
        className
      )}
    >
      <span role="status" className="sr-only">
        {spoken}
      </span>

      {status ? (
        <div className="chat-strip__status flex items-center gap-3 max-[480px]:flex-wrap max-[480px]:gap-x-2.5 max-[480px]:gap-y-0">
          <span className={cn('size-2 shrink-0 rounded-full', TONE[state] || TONE.idle)} aria-hidden="true" />
          <div className="min-w-0 flex-1 max-[480px]:basis-[calc(100%-1.25rem)]">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate font-medium text-foreground" title={title}>
                {title}
              </span>
              {WORD[state] ? <span className="shrink-0 text-xs text-muted-foreground">{WORD[state]}</span> : null}
            </div>
            {/* Failures are never clamped; everything else truncates with the full text on hover. */}
            <div
              className={cn('text-xs text-muted-foreground', state === 'failed' ? 'break-words' : 'truncate')}
              title={state === 'failed' ? undefined : detail}
            >
              {detail}
            </div>
          </div>
          {action?.onClick ? (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(BTN, 'border border-border bg-background text-foreground hover:bg-accent max-[480px]:ml-[1.125rem] max-[480px]:h-10 max-[480px]:rounded-full max-[480px]:px-4')}
            >
              {action.label}
            </button>
          ) : null}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className={cn(BTN, 'pr-1.5 text-muted-foreground hover:bg-accent hover:text-foreground max-[480px]:ml-auto max-[480px]:h-10 max-[480px]:rounded-full')}
            >
              View details <ChevronRight className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {notice?.message ? (
        <div
          className={cn(
            'chat-strip__notice flex items-start gap-2 text-[13px] leading-5 text-muted-foreground max-[480px]:flex-wrap',
            status && 'mt-2 border-t border-border pt-2 pl-5 max-[480px]:pl-0'
          )}
        >
          <span className="min-w-0 flex-1 py-0.5 max-[480px]:order-1 max-[480px]:basis-[calc(100%-3rem)]">{notice.message}</span>
          {notice.ctaLabel && notice.onCta ? (
            <button
              type="button"
              onClick={notice.onCta}
              className="chat-focus min-h-6 shrink-0 rounded-sm font-medium text-[hsl(var(--signal))] underline decoration-1 underline-offset-[0.18em] hover:decoration-2 [@media(pointer:coarse)]:min-h-11 max-[480px]:order-3 max-[480px]:min-h-9"
            >
              {notice.ctaLabel}
            </button>
          ) : null}
          {notice.onDismiss ? (
            <button
              type="button"
              onClick={notice.onDismiss}
              aria-label="Dismiss notice"
              className="chat-focus inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-accent hover:text-foreground active:scale-[.98] motion-reduce:transition-none [@media(pointer:coarse)]:size-11 max-[480px]:order-2 max-[480px]:-mt-1.5 max-[480px]:-mr-2"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Progress sits on the card's bottom edge, so it adds no height and nothing moves when it appears. */}
      {pct != null ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] bg-border"
          role="progressbar"
          aria-label={`${title || 'Run'} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div
            className="h-full origin-left bg-[hsl(var(--signal))] transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      ) : null}
    </div>
  );
}
