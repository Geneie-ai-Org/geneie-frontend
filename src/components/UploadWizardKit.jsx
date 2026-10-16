/**
 * Shared building blocks for the two upload wizards (DocumentUpload: VCF/TSV, and
 * Module1UploadForm: raw FASTQ) and the other add-data panels. Presentation + interaction only:
 * no API calls.
 *
 *   Field              label above, "Required" caption (never a red star), helper or inline error below
 *   WizardSelect       the ui/select wrapper both wizards use; disabled options explain themselves
 *   WizardStepper      numbered stage marks joined by a line that fills as you advance, "Step n of m"
 *   WizardPanes        step content that slides 8px in the direction of travel
 *   SegmentedPill      sliding pill segmented control (the app-wide replacement for PillToggle)
 *   DropZone / FileChip  the drag-and-drop area and the chip a chosen file turns into
 *   Disclosure         "Add clinical details (optional)" collapsed by default
 *   UploadErrorBanner  persistent, inline, with Retry; understands device-limit codes
 */
import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ChevronRight, RotateCw, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapse, ChipList, PopIn, SPRING, StageMark, Turn } from '@/components/motion';
import { cn } from '@/lib/utils';
import { describeLimitError } from '@/services/limitErrors';
import { humanizeError } from '@/lib/humanizeError';

const EASE = [0.22, 1, 0.36, 1];

/** Pill text input shared by every wizard: hairline, white on the canvas, teal focus ring. */
export const TEXT_INPUT_CLASS =
  'w-full h-10 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-4 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition-[color,background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.35)] disabled:cursor-not-allowed disabled:opacity-60';

/** Dashed variant for a not-yet-filled slot (file / link rows). */
export function inputBorderClass(hasError) {
  return hasError
    ? 'border-[var(--error)] hover:border-[var(--error)] focus-visible:border-[var(--error)]'
    : 'border-[hsl(var(--wb-line-strong))]';
}

/** Surface classes for the wizard dialogs: a pinned, hairline card with no inner padding. */
export const WIZARD_DIALOG_CLASS =
  '!max-w-2xl w-full top-[5vh] translate-y-0 max-h-[min(90vh,900px)] flex flex-col p-0 gap-0 overflow-hidden ring-0 border border-[hsl(var(--wb-line))] bg-popover shadow-[var(--shadow-lg)] max-sm:!top-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!max-w-full max-sm:rounded-none';

/** Round icon-only button used for dialog close / dismiss. */
export const ICON_BTN_CLASS =
  'wb-iconbtn shrink-0 disabled:opacity-40 disabled:pointer-events-none';

/** Label above, "Required" caption on the right, helper OR inline error below. */
export function Field({
  label,
  required = false,
  helper = null,
  error = null,
  htmlFor,
  children,
  className,
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
          {label}
        </label>
        {required && <span className="shrink-0 text-xs text-muted-foreground">Required</span>}
      </div>
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <FieldNote key="error" role="alert" tone="error">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </FieldNote>
        ) : helper ? (
          <FieldNote key="helper">{helper}</FieldNote>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FieldNote({ children, tone, role }) {
  const reduce = useReducedMotion();
  return (
    <motion.p
      role={role}
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.16, ease: EASE }}
      className={cn(
        'mt-1.5 flex items-start gap-1.5 px-1 text-xs leading-snug',
        tone === 'error' ? 'text-[var(--error)]' : 'text-muted-foreground'
      )}
    >
      {children}
    </motion.p>
  );
}

/** Small group heading inside a form ("Individual", "Family", "Segregation"). */
export function FieldGroup({ title, hint, children, className }) {
  return (
    <fieldset className={cn('min-w-0 border-0 p-0 m-0', className)}>
      <legend className="wb-card-title mb-2 p-0 px-1">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        {hint ? <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span> : null}
      </legend>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/**
 * Thin wrapper over the shadcn Select. Unavailable options render as greyed rows that toast
 * their reason on click (SelectItem's own `disabled` sets pointer-events: none, so the row
 * could never say why). `onTouched` fires when the list closes, which is the select's "blur":
 * the trigger itself blurs the moment the list opens, so it cannot be used for validation.
 */
export function WizardSelect({
  value,
  onChange,
  placeholder = 'Choose one',
  options,
  error = false,
  className = '',
  id,
  onTouched,
  disabled = false,
  ariaLabel,
}) {
  const items = Object.fromEntries((options || []).map((o) => [o.value, o.label]));
  return (
    <Select
      value={value || ''}
      onValueChange={onChange}
      items={items}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) onTouched?.();
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        className={cn(
          '!h-10 w-full rounded-full bg-[hsl(var(--wb-card))] px-4 text-[13px] text-foreground hover:border-[hsl(var(--brand-300))] data-placeholder:text-muted-foreground',
          error ? 'border-[var(--error)]' : 'border-[hsl(var(--wb-line-strong))]',
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="p-1.5">
        {(options || []).map((opt) =>
          opt.disabled ? (
            <div
              key={opt.value}
              role="option"
              aria-disabled="true"
              aria-selected="false"
              className="relative flex w-full cursor-not-allowed select-none items-center gap-2 rounded-full py-2 pl-2.5 pr-3 text-sm text-muted-foreground"
              // Keep the list open so the toast reads as a response to this row.
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (opt.disabledReason) toast.info(opt.disabledReason);
              }}
            >
              {opt.label}
              <span className="wb-chip ml-auto !h-5 text-[11px]">Soon</span>
            </div>
          ) : (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Segmented pill: the sliding replacement for PillToggle (same `{ options, value, onChange }`).
 * ---------------------------------------------------------------------------------------------- */

/**
 * Mutually exclusive choice as a pill track with one sliding thumb. Radio semantics with arrow-key
 * movement. Options may set `disabled` (+ `onDisabledClick`): the pill stays focusable so the click
 * can say why it is unavailable.
 */
export function SegmentedPill({ options, value, onChange, className, ariaLabel, disabled = false }) {
  const uid = useId();
  const reduce = useReducedMotion();
  const current = options.findIndex((o) => o.value === value);
  const move = (from, step) => {
    for (let i = 1; i <= options.length; i += 1) {
      const next = options[(from + step * i + options.length * i) % options.length];
      if (next && !next.disabled) {
        onChange(next.value);
        requestAnimationFrame(() => document.getElementById(`${uid}-${next.value}`)?.focus());
        return;
      }
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-full border border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] p-0.5',
        className
      )}
    >
      {options.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            id={`${uid}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={opt.disabled || undefined}
            disabled={disabled}
            tabIndex={active || (current === -1 && i === 0) ? 0 : -1}
            onClick={() => (opt.disabled ? opt.onDisabledClick?.(opt) : onChange(opt.value))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
            }}
            className={cn(
              'relative h-7 rounded-full border border-transparent px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
              opt.disabled
                ? 'cursor-not-allowed text-muted-foreground/70'
                : active
                  ? 'text-[hsl(var(--brand-700))]'
                  : 'text-muted-foreground hover:bg-[hsl(var(--brand-50))] hover:text-foreground'
            )}
          >
            {active ? (
              <motion.span
                aria-hidden="true"
                layoutId={`${uid}-thumb`}
                transition={reduce ? { duration: 0 } : SPRING}
                className="pointer-events-none absolute -inset-px rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))]"
              />
            ) : null}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Wizard chrome
 * ---------------------------------------------------------------------------------------------- */

/**
 * Step indicator: a numbered stage mark per step, joined by a line that fills as you advance, plus
 * a plain "Step n of m" for screen readers and anyone scanning. `steps`: [{ id, label, optional? }],
 * `current`: zero-based index.
 */
export function WizardStepper({ steps, current, className }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <ol className="m-0 flex min-w-0 flex-1 list-none items-center gap-2 p-0" aria-label="Steps">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <React.Fragment key={step.id}>
              {i > 0 && (
                <li aria-hidden className="relative h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-[hsl(var(--wb-line))]">
                  <span
                    className="absolute inset-0 origin-left rounded-full bg-[hsl(var(--brand-500))]"
                    style={{
                      transform: `scaleX(${i <= current ? 1 : 0})`,
                      transition: reduce ? 'none' : 'transform 240ms cubic-bezier(.22,1,.36,1)',
                    }}
                  />
                </li>
              )}
              <li className="flex shrink-0 items-center gap-2" aria-current={active ? 'step' : undefined}>
                <span className="relative flex size-6 items-center justify-center">
                  {done ? (
                    <StageMark state="done" size={24} />
                  ) : (
                    <>
                      {active ? null : <StageMark state="pending" size={24} />}
                      <span
                        className={cn(
                          'absolute inset-0 flex items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                          active
                            ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))]'
                            : 'border-transparent text-muted-foreground'
                        )}
                      >
                        {i + 1}
                      </span>
                    </>
                  )}
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-[13px]',
                    active ? 'font-medium text-foreground' : 'text-muted-foreground max-sm:hidden'
                  )}
                >
                  {step.label}
                  {step.optional ? (
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  ) : null}
                </span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" role="status" aria-live="polite">
        Step {Math.min(current + 1, steps.length)} of {steps.length}
      </span>
    </div>
  );
}

/**
 * Step content: the old pane leaves, the new one slides in 8px from the side you are heading to.
 * Remounts per `step` (same as the plain conditional renders it replaces), so each step's own state
 * lives in the parent. Reduced motion: no movement.
 */
export function WizardPanes({ step, index, children, className }) {
  const reduce = useReducedMotion();
  // Direction comes from the previous index, kept in state so a StrictMode double render agrees.
  const [seen, setSeen] = useState({ index, dir: 1 });
  if (seen.index !== index) setSeen({ index, dir: index > seen.index ? 1 : -1 });
  const dir = seen.dir;
  const dist = reduce ? 0 : 8;
  // While the old pane has left and the new one has not mounted yet, hold the old height so the
  // dialog does not collapse and spring back (one jump to the new height instead of two).
  const wrapRef = useRef(null);
  const prevIndex = useRef(index);
  const [lock, setLock] = useState(null);
  useLayoutEffect(() => {
    if (prevIndex.current === index) return;
    prevIndex.current = index;
    if (wrapRef.current) setLock(wrapRef.current.offsetHeight);
  }, [index]);
  return (
    <div ref={wrapRef} style={lock ? { minHeight: lock } : undefined}>
      <AnimatePresence
        mode="wait"
        initial={false}
        custom={dir}
        onExitComplete={() => {
          // The next step starts at the top of the scroll area, not where the last one was left.
          const scroller = wrapRef.current?.closest('[data-wizard-scroll]');
          if (scroller) scroller.scrollTop = 0;
        }}
      >
        <motion.div
          key={step}
          custom={dir}
          variants={{
            enter: (d) => ({ opacity: 0, x: dist * d }),
            center: { opacity: 1, x: 0 },
            exit: (d) => ({ opacity: 0, x: -dist * d }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
          onAnimationStart={(def) => { if (def === 'center') setLock(null); }}
          className={className}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Drag-and-drop target. Presentational: the caller owns the hidden file input (`htmlFor` is its
 * id), the drag state and the drop handler. On drag-over the area tints and grows slightly.
 */
export function DropZone({
  htmlFor,
  dragOver = false,
  disabled = false,
  busy = false,
  title = 'Choose a file or drag it here',
  dropTitle = 'Drop to add this file',
  formats = [],
  onDragOver,
  onDragLeave,
  onDrop,
  className,
}) {
  const reduce = useReducedMotion();
  return (
    <label
      htmlFor={htmlFor}
      data-drag={dragOver || undefined}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        // Moving over a child fires dragleave on the label; only a real exit clears the tint.
        if (e.currentTarget.contains(e.relatedTarget)) return;
        onDragLeave?.(e);
      }}
      onDrop={onDrop}
      className={cn(
        'group flex w-full flex-col items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed px-6 py-9 text-center outline-none transition-[background-color,border-color,transform] duration-200 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[hsl(var(--brand-500)/0.5)] motion-reduce:transition-none',
        dragOver
          ? 'border-[hsl(var(--brand-500))] bg-[hsl(var(--brand-100))] ' + (reduce ? '' : 'scale-[1.015]')
          : 'border-[hsl(var(--brand-300))] bg-[hsl(var(--wb-card))] hover:border-[hsl(var(--brand-500))] hover:bg-[hsl(var(--brand-50))]',
        disabled || busy ? 'pointer-events-none opacity-60' : 'cursor-pointer',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-11 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-700))] transition-transform duration-200 ease-out motion-reduce:transition-none',
          dragOver && !reduce && '-translate-y-1'
        )}
      >
        {busy ? <span className="wb-spin-inline" /> : <Upload className="size-5" strokeWidth={1.8} />}
      </span>
      <span className="relative block h-5 w-full text-[15px] font-medium leading-5 text-foreground">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={busy ? 'busy' : dragOver ? 'drop' : 'idle'}
            className="absolute inset-0"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
          >
            {busy ? 'Processing' : dragOver ? dropTitle : title}
          </motion.span>
        </AnimatePresence>
      </span>
      {formats.length > 0 ? (
        <span className="flex flex-wrap items-center justify-center gap-1.5" aria-label={`Accepted: ${formats.join(', ')}`}>
          {formats.map((f) => (
            <span key={f} className="wb-chip font-mono tabular-nums">{f}</span>
          ))}
        </span>
      ) : null}
    </label>
  );
}

/** A chosen file as a chip: pops in with a drawn check, then name, size and kind. */
export function FileChip({ name, size, kind, onRemove, className }) {
  return (
    <span
      className={cn(
        'wb-pop inline-flex max-w-full items-center gap-2 rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] py-1 pl-1.5 pr-3 text-xs text-foreground',
        className
      )}
    >
      <StageMark state="done" size={20} />
      <span className="min-w-0 truncate font-mono text-[12px]" title={name}>{name}</span>
      {size ? <span className="shrink-0 tabular-nums text-muted-foreground">{size}</span> : null}
      {kind ? <span className="wb-chip !h-5 shrink-0 text-[11px]" data-tone="brand">{kind}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="-mr-1.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** Collapsed-by-default section. `summary` is the quiet right-hand count ("3 added"). */
export function Disclosure({ label, summary, open, onToggle, children, className }) {
  const regionId = useId();
  return (
    <div className={cn('wb-card overflow-hidden', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-500)/0.5)]"
      >
        <Turn open={open} className="shrink-0 text-muted-foreground">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Turn>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {summary ? <span className="wb-chip shrink-0 tabular-nums" data-tone="brand">{summary}</span> : null}
      </button>
      <Collapse open={open} id={regionId}>
        <div className="space-y-6 border-t border-[hsl(var(--wb-line))] px-3.5 pb-4 pt-4">{children}</div>
      </Collapse>
    </div>
  );
}

/** "Too many active sessions (n)": n only when the count is known and positive. */
function deviceFailure(devices) {
  const count = Number(devices?.activeCount);
  const n = Number.isFinite(count) && count > 0 ? count : null;
  return {
    title: 'Could not upload',
    message: `Too many active sessions${n != null ? ` (${n})` : ''}. Close or sign out one, then retry.`,
    retryable: true,
    kind: 'device',
  };
}

/** Reasons a submit can fail, in the words a user can act on. */
export function describeUploadError(input, { devices = null } = {}) {
  const err = typeof input === 'string' ? { message: input } : input && typeof input === 'object' ? input : {};
  const limit = err.code ? describeLimitError(err) : null;

  if (limit && (limit.family === 'deviceFrozen' || limit.family === 'deviceLimit')) {
    return deviceFailure(devices);
  }
  if (limit) {
    return { title: limit.title, message: limit.message, retryable: false, kind: 'limit' };
  }

  const raw = humanizeError(typeof err.message === 'string' ? err.message : '') || '';
  let message = raw.trim();
  // The upload services throw a bare Error (status/code dropped), so a device block reaches
  // us as the backend's sentence. Recognise it so the user still gets the way out.
  if (/device|another session|active session/i.test(message) && /frozen|too many|another session|different device|limit/i.test(message)) {
    return deviceFailure(devices);
  }
  if (!message) {
    message = err.status ? `The server rejected the request (${err.status}). Try again.` : 'Something went wrong. Try again.';
  } else if (/network error|failed to fetch|networkerror/i.test(message)) {
    message = 'Could not reach the server. Check your connection, then retry.';
  }
  return { title: 'Could not upload', message, retryable: true, kind: 'generic' };
}

/**
 * Persistent inline error for a failed submit. It stays until the user retries or dismisses
 * it, because a dialog that closes on failure tells the user nothing.
 */
export function UploadErrorBanner({ error, devices, onRetry, onDismiss, retrying = false, className }) {
  if (!error) return null;
  const info = describeUploadError(error, { devices });
  return (
    <div
      role="alert"
      className={cn(
        'wb-rise flex items-start gap-3 rounded-2xl border border-[var(--error)]/40 bg-[var(--error-soft)] p-3',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--error)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{info.title}</p>
        <p className="mt-0.5 break-words text-[13px] text-[var(--text-secondary)]">{info.message}</p>
        {info.retryable && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3.5 text-[13px] font-medium text-foreground outline-none transition-[background-color,transform] duration-150 hover:bg-[hsl(var(--brand-50))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500)/0.5)] active:scale-[0.97] disabled:opacity-50"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            Retry upload
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="wb-iconbtn -m-1 shrink-0"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** What still blocks "Continue", as dashed pending pills that pop away as each is filled. */
export function MissingHint({ items, className }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)} aria-live="polite">
      <span>To continue:</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <ChipList>
          {items.map((item) => (
            <PopIn key={item}>
              <span className="wb-chip !border-dashed !bg-transparent text-muted-foreground">{item}</span>
            </PopIn>
          ))}
        </ChipList>
      </span>
    </div>
  );
}

/** Quiet "not provided" line shown instead of a confirm dialog. */
export function QuietSummary({ children, className }) {
  if (!children) return null;
  return <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>{children}</p>;
}
