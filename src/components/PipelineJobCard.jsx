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
import React, { useId, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white).
const FOCUS =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

/**
 * Workbench look (variant="panel"): one white card holding a file header, a status block, a vertical
 * timeline of steps and, last, controls / QC. One status vocabulary through `StatusPill`:
 * queued, running, done, failed, and "Not started" for anything that has not begun.
 */
const PILL_STATE = {
  queued: ['queued', 'Queued'],
  running: ['running', 'Running'],
  done: ['done', 'Done'],
  skipped: ['done', 'Done'],
  failed: ['failed', 'Failed'],
  cancelled: ['pending', 'Cancelled'],
  waiting: ['pending', 'Not started'],
  pending: ['pending', 'Not started'],
};

export function StatusPill({ status, className }) {
  const [state, word] = PILL_STATE[status] || PILL_STATE.pending;
  return (
    <span className={cn('wb-status', className)} data-state={state}>
      {word}
    </span>
  );
}

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


const NODE_CLASS = {
  done: 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]',
  skipped: 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]',
  running: 'border-transparent bg-[var(--info-soft)] text-[var(--info)]',
  failed: 'border-transparent bg-[var(--error-soft)] text-[var(--error)]',
  queued: 'border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-pill))] text-foreground',
  waiting: 'border-[hsl(var(--brand-300))] bg-[hsl(var(--wb-card))] text-[hsl(var(--brand-700))]',
  pending: 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-muted-foreground',
  cancelled: 'border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] text-muted-foreground',
};

/** Slim teal pill track with the number beside it. `value` null draws nothing. */
function ProgressPill({ value, label = 'Run progress', right = null, className }) {
  if (value == null && !right) return null;
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('space-y-1.5', className)}>
      {pct != null ? (
        <div className="flex items-center gap-3">
          <div
            className="wb-track flex-1"
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="wb-fill transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-[hsl(var(--brand-700))]">{pct}%</span>
        </div>
      ) : null}
      {right ? <p className="m-0 text-xs tabular-nums text-muted-foreground">{right}</p> : null}
    </div>
  );
}

function TimelineRow({ step, index, last, progress, reserve }) {
  const done = step.status === 'done' || step.status === 'skipped';
  const current = step.status === 'running' || step.status === 'waiting' || step.status === 'queued';
  const interactive = typeof step.onClick === 'function';
  const Row = interactive ? 'button' : 'div';
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-px flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium tabular-nums',
          NODE_CLASS[step.status] || NODE_CLASS.pending
        )}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block text-[13px] leading-5',
                step.status === 'pending' || step.status === 'cancelled' ? 'text-muted-foreground' : 'font-medium text-foreground'
              )}
            >
              {step.label}
            </span>
            {step.detail ? <span className="block text-xs leading-5 text-muted-foreground">{step.detail}</span> : null}
          </span>
          {step.time && !progress ? <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground">{step.time}</span> : null}
          <StatusPill status={step.status} className="shrink-0" />
          {interactive ? (
            <ChevronRight className="mt-[3px] size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : reserve ? (
            <span className="size-3.5 shrink-0" aria-hidden />
          ) : null}
        </span>
        {progress ? <span className="mt-2.5 block">{progress}</span> : null}
      </span>
    </>
  );
  const rowClass = cn(
    'flex w-full items-start gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none',
    current ? 'border-[hsl(var(--brand-100))] bg-[hsl(var(--brand-50))]' : 'border-transparent',
    interactive && 'hover:border-[hsl(var(--brand-200))] hover:bg-[hsl(var(--brand-50))]',
    FOCUS
  );
  return (
    <li className="relative mb-1 last:mb-0">
      {!last ? (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-3 left-[21px] top-[38px] w-0.5 rounded-full',
            done ? 'bg-[hsl(var(--brand-300))]' : 'bg-[hsl(var(--wb-line-strong))]'
          )}
        />
      ) : null}
      {interactive ? (
        <Row type="button" onClick={step.onClick} disabled={step.disabled} title={step.title} className={cn(rowClass, 'disabled:cursor-default disabled:opacity-60')}>
          {inner}
        </Row>
      ) : (
        <Row className={rowClass}>{inner}</Row>
      )}
    </li>
  );
}

/** First sentence as a lead line; the rest as a plain sentence under it. */
function splitLead(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(.+?[.!?])\s+(.*)$/s);
  return m ? { lead: m[1], rest: m[2] } : { lead: t, rest: '' };
}

function PanelBody({
  title,
  icon,
  engine,
  status,
  statusTitle,
  statusText,
  pct,
  timer,
  note,
  steps,
  stepsToggleRef,
  stepsLabel,
  headerExtra,
  chips,
  action,
  details,
  detailsLabel,
  detailsDefaultOpen,
  children,
}) {
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(Boolean(detailsDefaultOpen));
  const hasSteps = Array.isArray(steps) && steps.length > 0;
  const doneCount = hasSteps ? steps.filter((s) => s.status === 'done' || s.status === 'skipped').length : 0;
  const failed = status === 'failed';
  const showProgress = pct != null && (status === 'running' || status === 'queued');
  // The running step carries the progress pill and the clock, so the live work sits on the step it belongs to.
  const runIdx = hasSteps ? steps.findIndex((s) => s.status === 'running') : -1;
  const inline = runIdx >= 0 && (showProgress || timer);
  const lead = failed ? (statusTitle ? { lead: statusTitle, rest: statusText } : splitLead(statusText)) : null;
  const hasStatusBlock = Boolean(statusText || action || status);
  const kids = React.Children.toArray(children);
  // Screen-reader-only live regions are children too, but they must not draw an empty footer.
  const hasVisibleKids = kids.some((k) => !String(k?.props?.className || '').includes('sr-only'));
  const engineTone = engine?.tone || (engine?.warn ? 'warn' : null);

  return (
    <div>
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        {icon ? (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] [&>svg]:!size-4 [&>svg]:!text-[hsl(var(--brand-500))]"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3
            ref={hasSteps ? undefined : stepsToggleRef}
            tabIndex={hasSteps ? undefined : -1}
            className="m-0 truncate text-[15px] font-medium leading-6 text-foreground outline-none"
            title={typeof title === 'string' ? title : undefined}
          >
            {title}
          </h3>
          {engine?.label || (chips && chips.length) ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {engine?.label ? (
                <span
                  className="wb-chip"
                  data-tone={engineTone === 'brand' ? 'brand' : undefined}
                  style={
                    engineTone === 'warn'
                      ? { background: 'var(--warning-soft)', color: 'var(--warning)', borderColor: 'transparent' }
                      : undefined
                  }
                >
                  {engine.label}
                </span>
              ) : null}
              {(chips || []).map((c) => (
                <span key={c.label} className="wb-chip tabular-nums" data-tone={c.tone === 'brand' ? 'brand' : undefined}>
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {headerExtra ? <span className="flex shrink-0 items-center gap-1.5">{headerExtra}</span> : null}
      </header>

      {hasStatusBlock ? (
        <div
          className={cn(
            'mx-4 mb-4 rounded-2xl border px-3.5 py-3',
            failed
              ? 'border-[color-mix(in_srgb,var(--error)_22%,transparent)] bg-[var(--error-soft)]'
              : 'border-[hsl(var(--brand-100))] bg-[hsl(var(--brand-50))]'
          )}
        >
          {failed ? (
            <div className="flex items-start gap-2.5" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--error)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-medium leading-5 text-foreground">{lead.lead}</p>
                {lead.rest ? <p className="m-0 mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">{lead.rest}</p> : null}
              </div>
            </div>
          ) : (
            <>
              {(status && (!hasSteps || status === 'done')) || (timer && !inline) ? (
                <div className="mb-2 flex items-center gap-2">
                  {status && (!hasSteps || status === 'done') ? <StatusPill status={status} /> : null}
                  {timer && !inline ? <span className="ml-auto text-xs tabular-nums text-muted-foreground">{timer}</span> : null}
                </div>
              ) : null}
              {statusText ? (
                <p className="m-0 text-[13px] leading-5 text-foreground" aria-live="polite">
                  {statusText}
                </p>
              ) : null}
              {showProgress && !inline ? <ProgressPill value={pct} className="mt-3" /> : null}
            </>
          )}
          {note && !failed ? <p className="m-0 mt-2 text-xs leading-5 text-muted-foreground">{note}</p> : null}
          {action ? <div className="mt-3 flex justify-end">{action}</div> : null}
        </div>
      ) : null}

      {hasSteps ? (
        <section className="border-t border-[hsl(var(--wb-line))] px-2.5 pb-3 pt-3" aria-label={stepsLabel}>
          <div className="mb-1.5 flex items-center gap-2 px-2.5">
            <h4 ref={stepsToggleRef} tabIndex={-1} className="wb-card-title m-0 outline-none">
              {stepsLabel}
            </h4>
            <span className="wb-chip tabular-nums">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <ol className="m-0 list-none p-0">
            {steps.map((step, i) => (
              <TimelineRow
                key={step.id}
                step={step}
                index={i}
                last={i === steps.length - 1}
                reserve={steps.some((x) => typeof x.onClick === 'function')}
                progress={
                  inline && i === runIdx ? (
                    <ProgressPill value={showProgress ? pct : null} right={timer} />
                  ) : null
                }
              />
            ))}
          </ol>
        </section>
      ) : null}

      {details ? (
        <div className="border-t border-[hsl(var(--wb-line))] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            className={cn(
              '-ml-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--wb-pill))] hover:text-foreground motion-reduce:transition-none',
              FOCUS
            )}
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150 motion-reduce:transition-none', detailsOpen && 'rotate-90')} aria-hidden />
            {detailsLabel}
          </button>
          {detailsOpen ? (
            <div id={detailsId} className="pb-1 pt-2">
              {details}
            </div>
          ) : null}
        </div>
      ) : null}

      {kids.length > 0 ? (
        hasVisibleKids ? (
          <div className="space-y-3 border-t border-[hsl(var(--wb-line))] px-4 py-3">{kids}</div>
        ) : (
          kids
        )
      ) : null}
    </div>
  );
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
  /** panel only: extra header chips, [{ label, tone?: 'brand' }]. */
  chips = null,
  action = null,
  /** panel only: what the failure card leads with (what happened); `statusText` is then the why and next step. */
  statusTitle = null,
  /** panel only: secondary content (logs, activity) behind a collapsible "Details" pill. */
  details = null,
  detailsLabel = 'Details',
  detailsDefaultOpen = false,
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
            {statusTitle ? `${statusTitle} ` : ''}{statusText}
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
      <section aria-label={ariaLabel} className={cn('wb-card mx-1 min-w-0 shrink-0', className)}>
        <PanelBody
          title={title}
          icon={icon}
          engine={engine}
          status={status}
          statusTitle={statusTitle}
          statusText={statusText}
          pct={pct}
          timer={timer}
          note={note}
          steps={steps}
          stepsToggleRef={stepsToggleRef}
          stepsLabel={stepsLabel}
          headerExtra={headerExtra}
          chips={chips}
          action={action}
          details={details}
          detailsLabel={detailsLabel}
          detailsDefaultOpen={detailsDefaultOpen || status === 'failed'}
          children={children}
        />
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
