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
import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, RotateCcw, Terminal } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Collapse, CopyButton, CountUp, StageMark, StateButton, Turn } from '@/components/motion';

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

/**
 * Returns `wb-pop` once `value` has changed after mount, so a pill springs in when its state flips
 * but does not replay on first paint or on unrelated re-renders.
 */
export function usePopOnChange(value) {
  const first = useRef(value);
  const changed = useRef(false);
  if (value !== first.current) changed.current = true;
  return changed.current ? 'wb-pop' : '';
}

export function StatusPill({ status, className }) {
  const [state, word] = PILL_STATE[status] || PILL_STATE.pending;
  const pop = usePopOnChange(`${state}|${word}`);
  return (
    <span key={`${state}|${word}`} className={cn('wb-status', pop, className)} data-state={state}>
      {word}
    </span>
  );
}

/** Cycles through `frames` every `ms`; holds the first frame under reduced motion. */
function useFrames(frames, ms) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % frames.length), ms);
    return () => clearInterval(t);
  }, [frames, ms, reduce]);
  return frames[reduce ? 0 : i];
}

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** A quiet braille-dot spinner for long raw-sequencing runs. Plain text, hidden from screen readers. */
export function BrailleSpinner({ className }) {
  const frame = useFrames(BRAILLE, 80);
  return (
    <span aria-hidden="true" className={cn('inline-block w-[1ch] select-none font-mono text-[hsl(var(--brand-500))]', className)}>
      {frame}
    </span>
  );
}

/**
 * Action button for the pipeline cards: the shared StateButton morph (idle, running, done) with an
 * optional single pulse so a Retry draws the eye once when the failure card rises in.
 */
export function ActionButton({ pulse = false, ...rest }) {
  const reduce = useReducedMotion();
  const btn = <StateButton {...rest} className={cn('[@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-4', rest.className)} />;
  if (!pulse || reduce) return btn;
  return (
    <motion.span className="inline-flex" initial={{ scale: 1 }} animate={{ scale: [1, 1.07, 1] }} transition={{ delay: 0.55, duration: 0.5, ease: 'easeInOut' }}>
      {btn}
    </motion.span>
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
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
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


/** Step status -> the StageMark state (dashed ring, spinning arc, drawn check, drawn cross). */
const MARK_STATE = {
  done: 'done',
  skipped: 'done',
  running: 'running',
  failed: 'failed',
  queued: 'pending',
  waiting: 'pending',
  pending: 'pending',
  cancelled: 'pending',
};

/** The soft disc behind the mark; it fades between states so a step settling reads as one motion. */
const NODE_SURFACE = {
  done: 'bg-[hsl(var(--brand-100))]',
  running: 'bg-[var(--info-soft)]',
  failed: 'bg-[var(--error-soft)]',
  pending: 'bg-transparent',
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
            <div className="wb-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-[hsl(var(--brand-700))]">
            <CountUp value={pct} duration={0.5} />%
          </span>
        </div>
      ) : null}
      {right ? <p className="m-0 text-xs tabular-nums text-muted-foreground">{right}</p> : null}
    </div>
  );
}

/** Words for the sub-line under a step's label: one vocabulary, never colour alone. */
const STEP_SUB_WORD = {
  done: 'Done',
  skipped: 'Done',
  running: 'Running',
  failed: 'Failed',
  queued: 'Queued',
  waiting: 'Up next',
  pending: 'Not started',
  cancelled: 'Cancelled',
};

/**
 * Developer-console block for a job record: monospace, dark in both themes, one `key  value` pair per line,
 * and a copy button that puts the same plain text on the clipboard. `lines` is [[key, value], ...] or
 * { heading } separators. Values that are missing are simply not listed: nothing here is invented.
 */
export function JobConsole({ lines, title = 'job record', className }) {
  const rows = (lines || []).filter((l) => l && (l.heading || (l[1] != null && l[1] !== '')));
  if (!rows.length) return null;
  const keyW = Math.min(26, Math.max(8, ...rows.filter((r) => !r.heading).map((r) => String(r[0]).length)));
  const text = rows
    .map((r) => (r.heading ? `# ${r.heading}` : `${String(r[0]).padEnd(keyW)}  ${r[1]}`))
    .join('\n');
  return (
    <figure className={cn('wb-console m-0 overflow-hidden rounded-xl border', className)} aria-label={`Developer console: ${title}`}>
      <figcaption className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="wb-console__title font-mono text-[11px] uppercase tracking-[0.08em]">{title}</span>
        <CopyButton
          getText={() => text}
          label="Copy"
          variant="ghost"
          className="wb-console__copy h-6 rounded-full px-2 text-[11.5px] [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3.5"
          aria-label={`Copy ${title}`}
        />
      </figcaption>
      <pre className="m-0 max-h-64 overflow-auto px-3 py-2.5 font-mono text-[12px] leading-[1.65]" tabIndex={0}>
        {rows.map((r, i) =>
          r.heading ? (
            <span key={i} className="wb-console__head block pt-1.5 first:pt-0">{`# ${r.heading}`}</span>
          ) : (
            <span key={i} className="block">
              <span className="wb-console__key">{String(r[0]).padEnd(keyW)}</span>
              {'  '}
              <span className="wb-console__val">{String(r[1])}</span>
            </span>
          )
        )}
      </pre>
    </figure>
  );
}

function TimelineRow({ step, index, last, progress, reserve, expanded, onToggle }) {
  const done = step.status === 'done' || step.status === 'skipped';
  const current = step.status === 'running' || step.status === 'waiting' || step.status === 'queued';
  const markState = MARK_STATE[step.status] || 'pending';
  const detailId = useId();
  const facts = (step.facts || []).filter((f) => f && f[1] != null && f[1] !== '');
  const hasBody = Boolean(step.reason || facts.length || step.note || step.retry || step.onClick);
  const failed = step.status === 'failed';
  const sub = [STEP_SUB_WORD[step.status], step.time && !progress ? step.time : null].filter(Boolean).join(' · ');
  const head = (
    <>
      <span
        aria-hidden
        className={cn(
          'relative z-10 mt-px flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300 motion-reduce:transition-none',
          NODE_SURFACE[markState]
        )}
      >
        <StageMark state={markState} size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className={cn('block text-[13px] leading-5', step.status === 'pending' || step.status === 'cancelled' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
              {step.label}
            </span>
            <span className={cn('block text-xs leading-[18px] tabular-nums', failed ? 'text-[var(--error)]' : 'text-muted-foreground')}>
              {sub}
              {step.when ? <span className="text-muted-foreground">{` · ${step.when}`}</span> : null}
            </span>
            {step.detail ? <span className="block text-xs leading-5 text-muted-foreground">{step.detail}</span> : null}
          </span>
          {hasBody ? (
            <Turn open={expanded} className="mt-[3px] shrink-0 text-muted-foreground"><ChevronRight className="size-3.5" aria-hidden /></Turn>
          ) : reserve ? (
            <span className="size-3.5 shrink-0" aria-hidden />
          ) : null}
        </span>
        <Collapse open={Boolean(progress)}>
          <span className="block pt-2.5">{progress}</span>
        </Collapse>
      </span>
    </>
  );
  const rowClass = cn(
    'flex w-full items-start gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none',
    current ? 'border-[hsl(var(--brand-100))] bg-[hsl(var(--brand-50))]' : failed ? 'border-[color-mix(in_srgb,var(--error)_16%,transparent)]' : 'border-transparent',
    hasBody && 'hover:border-[hsl(var(--brand-200))] hover:bg-[hsl(var(--brand-50))]',
    FOCUS
  );
  return (
    <li className="relative mb-1 last:mb-0" data-step={step.id} data-status={step.status}>
      {!last ? (
        <span aria-hidden className="absolute -bottom-3 left-[21px] top-[38px] w-0.5 overflow-hidden rounded-full bg-[hsl(var(--wb-line-strong))]">
          {/* The teal line fills down once the step above settles, after its check has drawn. */}
          <span
            className="block h-full w-full origin-top bg-[hsl(var(--brand-500))] transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleY(${done ? 1 : 0})`, transitionDelay: done ? '320ms' : '0ms' }}
          />
        </span>
      ) : null}
      {hasBody ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={detailId} data-step-toggle={step.id} className={rowClass}>
          {head}
        </button>
      ) : (
        <div className={rowClass}>{head}</div>
      )}
      {hasBody ? (
        <Collapse open={expanded} id={detailId}>
          <div className="ml-[46px] mr-2 space-y-2.5 pb-2.5 pt-0.5">
            {/* Actions first: the thing to do is the first thing under the step, not buried under the facts. */}
            {step.retry || step.onClick ? (
              <div className="flex flex-wrap items-center gap-2">
                {step.retry ? (
                  <ActionButton labels={{ idle: step.retry.label }} icon={RotateCcw} onClick={step.retry.run} variant="outline" size="sm" className="max-sm:h-11" />
                ) : null}
                {step.onClick ? (
                  <button
                    type="button"
                    onClick={step.onClick}
                    disabled={step.disabled}
                    className={cn('inline-flex h-7 [@media(pointer:coarse)]:h-10 items-center gap-1 rounded-full px-2.5 [@media(pointer:coarse)]:px-3.5 text-xs font-medium text-[hsl(var(--brand-700))] transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] disabled:opacity-50 motion-reduce:transition-none', FOCUS)}
                  >
                    {step.title || `Open ${step.label}`}
                    <ArrowRight className="size-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
            {step.reason ? (
              <p className={cn('m-0 text-[13px] leading-5', failed ? 'text-foreground' : 'text-[var(--text-secondary)]')}>{step.reason}</p>
            ) : null}
            {step.note ? <p className="m-0 text-xs leading-5 text-muted-foreground">{step.note}</p> : null}
            {facts.length ? (
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs leading-5">
                {facts.map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="m-0 min-w-0 break-words tabular-nums text-foreground">{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : null}
          </div>
        </Collapse>
      ) : null}
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
  failure,
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

  // Step details are open by default (the actions and times are what people come here for); the person
  // folds the ones they don't want. A step that fails opens again by itself, even if it was folded.
  const failedId = hasSteps ? steps.find((s) => s.status === 'failed')?.id ?? null : null;
  const [folded, setFolded] = useState([]);
  useEffect(() => {
    if (failedId) setFolded((f) => (f.includes(failedId) ? f.filter((x) => x !== failedId) : f));
  }, [failedId]);
  const open = hasSteps ? steps.map((s) => s.id).filter((id) => !folded.includes(id)) : [];
  const toggle = (id) => setFolded((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const bodyIds = hasSteps ? steps.filter((s) => s.reason || s.note || s.retry || s.onClick || (s.facts && s.facts.length)).map((s) => s.id) : [];
  const allOpen = bodyIds.length > 0 && bodyIds.every((id) => !folded.includes(id));

  return (
    <div>
      <header className="tx tx--lattice relative flex items-start gap-3 rounded-t-[15px] bg-gradient-to-b from-[hsl(var(--brand-50))] to-transparent px-4 pb-3 pt-4" style={{ '--tx-at': '92% 0%', '--tx-fade': '70% 140%' }}>
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
            className="font-display m-0 truncate text-[22px] leading-[1.2] text-foreground outline-none"
            title={typeof title === 'string' ? title : undefined}
          >
            {title}
          </h3>
          {engine?.label || (chips && chips.length) ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          key={failed ? 'failed' : 'ok'}
          className={cn(
            'mx-4 mb-4 rounded-2xl border px-3.5 py-3',
            failed && 'wb-rise',
            failed
              ? 'border-[color-mix(in_srgb,var(--error)_18%,transparent)] bg-[color-mix(in_srgb,var(--error)_6%,hsl(var(--wb-card)))]'
              : 'border-[hsl(var(--brand-100))] bg-[hsl(var(--brand-50))]'
          )}
        >
          {failed ? (
            <div className="flex items-start gap-2.5" role="alert">
              <span aria-hidden="true" className="mt-px flex size-5 shrink-0 items-center justify-center"><StageMark state="failed" size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13.5px] font-medium leading-5 text-foreground">{lead.lead}</p>
                {lead.rest ? <p className="m-0 mt-0.5 text-[13px] leading-5 text-[var(--text-secondary)]">{lead.rest}</p> : null}
                {failure?.chips?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {failure.chips.map((c) => (
                      <span key={c} className={cn('wb-chip tabular-nums', /code|PIPELINE|[A-Z]{3,}_/.test(c) && 'font-mono text-[11.5px]')}>{c}</span>
                    ))}
                  </div>
                ) : null}
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
                <p key={String(statusText)} className="wb-fade m-0 text-[13px] leading-5 text-foreground" aria-live="polite">
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
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {bodyIds.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setFolded(allOpen ? bodyIds : [])}
                  className={cn('inline-flex h-6 [@media(pointer:coarse)]:h-9 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] motion-reduce:transition-none', FOCUS)}
                >
                  {allOpen ? 'Collapse all' : 'Expand all'}
                </button>
              ) : null}
              <span className="wb-chip tabular-nums">
                {doneCount} of {steps.length} done
              </span>
            </span>
          </div>
          <ol className="m-0 list-none p-0">
            {steps.map((step, i) => (
              <TimelineRow
                key={step.id}
                step={step}
                index={i}
                last={i === steps.length - 1}
                reserve={steps.some((x) => x.reason || x.note || x.retry || x.onClick || (x.facts && x.facts.length))}
                expanded={open.includes(step.id)}
                onToggle={() => toggle(step.id)}
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

      {kids.length > 0 ? (
        hasVisibleKids ? (
          <div className="space-y-3 border-t border-[hsl(var(--wb-line))] px-4 py-3">{kids}</div>
        ) : (
          kids
        )
      ) : null}
      {details ? (
        <div className="border-t border-[hsl(var(--wb-line))] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            className={cn(
              '-ml-2 inline-flex h-8 [@media(pointer:coarse)]:h-10 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--wb-pill))] hover:text-foreground motion-reduce:transition-none',
              FOCUS
            )}
          >
            <Turn open={detailsOpen}><ChevronRight className="size-3.5" aria-hidden /></Turn>
            <Terminal className="size-3.5" aria-hidden />
            {detailsLabel}
          </button>
          <Collapse open={detailsOpen} id={detailsId}>
            <div className="pb-1 pt-2">{details}</div>
          </Collapse>
        </div>
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
  /** panel only: { chips: string[] } facts shown under a failure (stage, duration, code). */
  failure = null,
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
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground"><CountUp value={Math.round(pct)} duration={0.5} />%</span>
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
            className="-mx-1.5 inline-flex min-h-8 [@media(pointer:coarse)]:min-h-11 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55"
          >
            <Turn open={Boolean(stepsOpen)}><ChevronRight className="h-3.5 w-3.5" aria-hidden /></Turn>
            {stepsOpen ? `Hide ${stepsLabel.toLowerCase()}` : `${stepsLabel}`}
            <span className="font-normal tabular-nums">
              {doneCount} of {steps.length}
            </span>
          </button>
          <Collapse open={Boolean(stepsOpen)} id={stepsId}>
            <div className="mt-1">
              <StepList steps={steps} />
            </div>
          </Collapse>
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
          failure={failure}
          details={details}
          detailsLabel={detailsLabel}
          detailsDefaultOpen={detailsDefaultOpen}
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
