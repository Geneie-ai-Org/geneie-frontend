/**
 * Compact job card shared by the pipeline surfaces (Module 1 stepper, the variant pipeline
 * drawer, the Automatic panel). Presentation only.
 *
 *   title + engine chip (GPU / CPU) .......................... status word + dot
 *   ONE status sentence
 *   thin progress bar with % and elapsed time
 *   quiet secondary line (region / data residency)
 *   Steps (collapsed by default, expandable)
 *   children: controls, failure box, QC (always visible, never inside the collapse)
 *
 * One status vocabulary: Queued, Running, Done, Failed, Cancelled. A spinner never sits next
 * to a label that says something else: the dot is the only status mark.
 *
 * `variant="flat"` drops the surface for hosts that draw their own (the composer drawer).
 * `variant="card"` (default) is the inline card above the composer: a bordered, rounded
 * surface. `variant="panel"` is plain content for the workspace: it fills its parent
 * (`h-full min-h-0 flex flex-col`), scrolls its own body and draws no border, radius,
 * shadow, fixed position or width, so the workspace tab supplies the chrome.
 */
import React, { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STATUS_WORDS = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const DOT_CLASS = {
  queued: 'bg-[var(--text-tertiary)]',
  running: 'bg-primary motion-safe:animate-pulse',
  done: 'bg-[var(--success)]',
  failed: 'bg-[var(--error)]',
  cancelled: 'border border-[var(--text-tertiary)] bg-transparent',
};

const WORD_CLASS = {
  queued: 'text-muted-foreground',
  running: 'text-foreground',
  done: 'text-[var(--success)]',
  failed: 'text-[var(--error)]',
  cancelled: 'text-muted-foreground',
};

/** Dot + word. The dot never animates for any status other than Running. */
export function StatusLabel({ status, className }) {
  const word = STATUS_WORDS[status];
  if (!word) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium', WORD_CLASS[status], className)}>
      <span aria-hidden className={cn('h-2 w-2 rounded-full', DOT_CLASS[status])} />
      {word}
    </span>
  );
}

/** Engine chip: "GPU", "CPU", or a warning variant such as "CPU (no GPU available)". */
export function EngineChip({ label, warn = false }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-2xs font-semibold',
        warn ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-muted text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

/** Thin bar. `value` null renders nothing: an unknown percentage is not drawn as zero. */
export function ThinProgress({ value, label = 'Progress', className }) {
  if (value == null) return null;
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const STEP_WORD = { done: 'Done', running: 'Running', failed: 'Failed', skipped: 'Skipped' };

const STEP_DOT = {
  done: 'bg-[var(--success)]',
  running: 'bg-primary motion-safe:animate-pulse',
  failed: 'bg-[var(--error)]',
  skipped: 'border border-[var(--border-strong)] bg-transparent',
  waiting: 'bg-primary',
  pending: 'border border-[var(--border-strong)] bg-transparent',
};

/**
 * Step list. `steps`: [{ id, label, status: done|running|failed|skipped|waiting|pending,
 * detail?, time?, onClick?, disabled?, title? }]. Pending steps carry no status word.
 */
export function StepList({ steps, className }) {
  return (
    <ol className={cn('m-0 list-none space-y-0.5 p-0', className)}>
      {steps.map((step) => {
        const word = STEP_WORD[step.status];
        const inner = (
          <>
            <span
              aria-hidden
              className={cn('mt-[5px] h-2 w-2 shrink-0 rounded-full', STEP_DOT[step.status] || STEP_DOT.pending)}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-xs',
                  step.status === 'failed'
                    ? 'font-medium text-[var(--error)]'
                    : step.status === 'running' || step.status === 'waiting'
                      ? 'font-medium text-foreground'
                      : step.status === 'done'
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                  step.status === 'skipped' && 'line-through'
                )}
              >
                {step.label}
              </span>
              {step.detail ? <span className="block text-2xs text-muted-foreground">{step.detail}</span> : null}
            </span>
            {step.time ? <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{step.time}</span> : null}
            {word ? (
              <span
                className={cn(
                  'w-14 shrink-0 text-right text-2xs',
                  step.status === 'failed' ? 'text-[var(--error)]' : 'text-muted-foreground'
                )}
              >
                {word}
              </span>
            ) : (
              <span className="w-14 shrink-0" aria-hidden />
            )}
          </>
        );
        return (
          <li key={step.id}>
            {step.onClick ? (
              <button
                type="button"
                onClick={step.onClick}
                disabled={step.disabled}
                title={step.title}
                className="flex min-h-8 w-full items-start gap-2.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              >
                {inner}
              </button>
            ) : (
              <div className="flex min-h-8 items-start gap-2.5 px-1.5 py-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Backend job text packs three things into one run-on line: what is happening, which compute
 * is running it, and where the data stays ("Running on GPU in Tokyo (ap-northeast-1); your
 * data stays in Mumbai. Staging hg38 reference bundle (hg38)."). Split it into the sentence
 * that belongs in the status line and the quiet residency note. Anything that does not match
 * is returned untouched as the sentence, so no information is ever dropped.
 */
export function splitJobMessage(message) {
  const text = String(message || '').trim();
  if (!text) return { sentence: '', note: '' };
  const parts = text.split(/(?<=\.)\s+/).filter(Boolean);
  const regionRe = /your data stays|data stays in|\b(?:ap|us|eu|sa|me|af|ca)-[a-z]+-\d\b/i;
  const noteParts = [];
  const sentenceParts = [];
  for (const part of parts) (regionRe.test(part) ? noteParts : sentenceParts).push(part);
  if (noteParts.length === 0) return { sentence: text, note: '' };

  const note = noteParts
    .map((part) => {
      const m = part.match(/^running on (?:gpu|cpu)\s+in\s+(.+?);\s*(.+?)\.?$/i);
      if (m) return `Compute in ${m[1]}. ${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}.`;
      return part;
    })
    .join(' ');
  // "Running on GPU in ..." only restated the engine chip; when nothing else remains the
  // sentence falls back to the caller's own phase wording.
  return { sentence: sentenceParts.join(' '), note };
}

export default function PipelineJobCard({
  variant = 'card',
  title,
  icon = null,
  engine = null,
  status,
  statusText,
  pct = null,
  timer = null,
  note = null,
  steps = null,
  stepsOpen,
  onStepsToggle,
  stepsToggleRef,
  stepsLabel = 'Steps',
  headerExtra = null,
  action = null,
  children = null,
  className,
  ariaLabel,
}) {
  const stepsId = useId();
  const isPanel = variant === 'panel';
  // "flat": the same content with no surface at all, for hosts that already draw one
  // (the composer drawer).
  const isFlat = variant === 'flat';
  const showProgress = pct != null && (status === 'running' || status === 'queued');
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  const doneCount = hasSteps ? steps.filter((s) => s.status === 'done' || s.status === 'skipped').length : 0;

  const body = (
    <div className={cn('space-y-3', isPanel ? 'p-4' : 'px-3.5 py-3')}>
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h3 className="min-w-0 truncate text-sm font-semibold text-foreground" title={typeof title === 'string' ? title : undefined}>
          {title}
        </h3>
        {engine ? <EngineChip label={engine.label} warn={engine.warn} /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {headerExtra}
          <StatusLabel status={status} />
        </span>
      </div>

      {statusText || action ? (
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <p className="min-w-[12rem] flex-1 text-xs leading-relaxed text-[var(--text-secondary)]" aria-live="polite">
            {statusText}
          </p>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      {showProgress || timer ? (
        <div className="flex items-center gap-3">
          {showProgress ? (
            <>
              <ThinProgress value={pct} label="Run progress" className="flex-1" />
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
            </>
          ) : (
            <span className="flex-1" />
          )}
          {timer ? <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{timer}</span> : null}
        </div>
      ) : null}

      {note ? <p className="text-2xs leading-relaxed text-muted-foreground">{note}</p> : null}

      {hasSteps ? (
        <div>
          <button
            ref={stepsToggleRef}
            type="button"
            onClick={onStepsToggle}
            aria-expanded={Boolean(stepsOpen)}
            aria-controls={stepsId}
            className="-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none', stepsOpen && 'rotate-90')}
              aria-hidden
            />
            {stepsOpen ? `Hide ${stepsLabel.toLowerCase()}` : `${stepsLabel}`}
            <span className="font-normal tabular-nums">
              {doneCount} of {steps.length}
            </span>
          </button>
          {stepsOpen ? (
            <div id={stepsId} className="mt-1">
              <StepList steps={steps} />
            </div>
          ) : null}
        </div>
      ) : null}

      {children}
    </div>
  );

  if (isPanel) {
    return (
      <section aria-label={ariaLabel} className={cn('flex h-full min-h-0 flex-col', className)}>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </section>
    );
  }
  if (isFlat) {
    return (
      <section aria-label={ariaLabel} className={className}>
        {body}
      </section>
    );
  }
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'relative mb-2 overflow-hidden rounded-xl border bg-card',
        status === 'failed' ? 'border-[var(--error)]' : 'border-border',
        className
      )}
    >
      {body}
    </section>
  );
}
