/**
 * Shared building blocks for the two upload wizards (DocumentUpload: VCF/TSV, and
 * Module1UploadForm: raw FASTQ). Presentation only: no state, no API calls.
 *
 *   Field            label above, "Required" caption (never a red star), helper or inline error below
 *   WizardSelect     the ui/select wrapper both wizards use; disabled options explain themselves
 *   WizardStepper    "1 Essentials / 2 Details / 3 Phenotype" with a text label per step
 *   Disclosure       "Add clinical details (optional)" collapsed by default
 *   UploadErrorBanner  persistent, inline, with Retry; understands device-limit codes
 */
import React, { useId } from 'react';
import { AlertCircle, Check, ChevronRight, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { describeLimitError } from '@/services/limitErrors';
import { humanizeError } from '@/lib/humanizeError';

export const TEXT_INPUT_CLASS =
  'w-full h-10 rounded-lg border bg-[var(--bg-input)] px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60';

export function inputBorderClass(hasError) {
  return hasError ? 'border-[var(--error)]' : 'border-border';
}

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
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {required && <span className="shrink-0 text-2xs text-muted-foreground">Required</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 flex items-start gap-1 text-2xs text-[var(--error)]">
          <AlertCircle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : helper ? (
        <p className="mt-1.5 text-2xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

/** Small group heading inside a form ("Individual", "Family", "Segregation"). */
export function FieldGroup({ title, hint, children, className }) {
  return (
    <fieldset className={cn('min-w-0 border-0 p-0 m-0', className)}>
      <legend className="mb-2 p-0 text-xs font-semibold text-foreground">
        {title}
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
          '!h-10 w-full rounded-lg bg-[var(--bg-input)] px-3 text-sm text-foreground hover:border-[var(--border-strong)] data-placeholder:text-muted-foreground',
          error ? 'border-[var(--error)]' : 'border-border',
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
              className="relative flex w-full cursor-not-allowed select-none items-center gap-2 rounded-md py-2 pl-2.5 pr-8 text-sm text-muted-foreground"
              // Keep the list open so the toast reads as a response to this row.
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (opt.disabledReason) toast.info(opt.disabledReason);
              }}
            >
              {opt.label}
              <span className="ml-auto text-2xs">Soon</span>
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

/**
 * Step indicator with a text label per step. Only the current label shows below 640px so it
 * fits a phone; the numbered dots keep their order either way.
 * `steps`: [{ id, label, optional? }], `current`: zero-based index.
 */
export function WizardStepper({ steps, current, className }) {
  return (
    <ol className={cn('m-0 flex list-none items-center gap-2 p-0', className)} aria-label="Steps">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <li
                aria-hidden
                className={cn('h-px min-w-3 flex-1', done || active ? 'bg-primary' : 'bg-border')}
              />
            )}
            <li
              className="flex shrink-0 items-center gap-1.5"
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border text-2xs font-medium tabular-nums',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary text-primary',
                  !done && !active && 'border-border text-muted-foreground'
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs',
                  active ? 'font-medium text-foreground' : 'hidden text-muted-foreground sm:inline'
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
  );
}

/** Collapsed-by-default section. `summary` is the quiet right-hand count ("3 added"). */
export function Disclosure({ label, summary, open, onToggle, children, className }) {
  const regionId = useId();
  return (
    <div className={cn('rounded-lg border border-border', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-90'
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {summary ? <span className="shrink-0 text-2xs font-normal text-muted-foreground">{summary}</span> : null}
      </button>
      {open ? (
        <div id={regionId} className="space-y-6 border-t border-border px-3 pb-4 pt-4">
          {children}
        </div>
      ) : null}
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
        'flex items-start gap-3 rounded-lg border border-[var(--error)] bg-[var(--error-soft)] p-3',
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--error)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{info.title}</p>
        <p className="mt-0.5 break-words text-xs text-[var(--text-secondary)]">{info.message}</p>
        {info.retryable && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-50"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
            Retry
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/55"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** "Missing: genome, sequencing type" as visible text (a disabled button cannot show a tooltip). */
export function MissingHint({ items, className }) {
  if (!items || items.length === 0) return null;
  return (
    <p className={cn('text-2xs text-muted-foreground', className)} aria-live="polite">
      To continue: {items.join(', ')}.
    </p>
  );
}

/** Quiet "not provided" line shown instead of a confirm dialog. */
export function QuietSummary({ children, className }) {
  if (!children) return null;
  return <p className={cn('text-2xs leading-relaxed text-muted-foreground', className)}>{children}</p>;
}
