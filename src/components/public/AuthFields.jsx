import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dismissible, StateButton } from '@/components/motion';
import { cn } from '@/lib/utils';

/**
 * Form pieces shared by the sign-in form and the password-reset page. Label above, helper or
 * error below, 44px pill controls with a teal focus ring. Presentation only: every prop and
 * behaviour is unchanged.
 */

/** Keeps the last truthy value so a collapsing block can still render its content while it exits. */
function useLast(value) {
  const ref = useRef(value);
  if (value) ref.current = value;
  return ref.current;
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:border-[hsl(var(--brand-500))] focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--brand-300)/0.45)]';

export function FieldShell({ id, label, labelAction, error, hint, shakeKey, children }) {
  const reduce = useReducedMotion();
  const shake = useAnimationControls();
  /* A failed submit bumps `shakeKey`; the control shakes only if this field is the one in error. */
  useEffect(() => {
    if (!shakeKey || !error || reduce) return;
    shake.start({ x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.4, ease: 'easeOut' } });
  }, [shakeKey]);
  return (
    <div className="group/field space-y-1.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <label
          htmlFor={id}
          className="text-[13px] font-medium text-muted-foreground transition-colors duration-150 group-focus-within/field:text-[hsl(var(--brand-700))]"
        >
          {label}
        </label>
        {labelAction}
      </div>
      <motion.div animate={shake}>{children}</motion.div>
      {/* The message is for assistive tech only; sighted users get the red border and the shake. */}
      {error ? <p id={`${id}-error`} role="alert" className="sr-only">{error}</p> : null}
      {!error && hint ? <p id={`${id}-hint`} className="px-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({ id, label, labelAction, error, hint, shakeKey, className, ...props }) {
  return (
    <FieldShell id={id} label={label} labelAction={labelAction} error={error} hint={hint} shakeKey={shakeKey}>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn('h-11 px-4 text-base sm:text-sm', FOCUS_RING, className)}
        {...props}
      />
    </FieldShell>
  );
}

export const PasswordField = React.forwardRef(function PasswordField(
  { id, label, labelAction, error, hint, shakeKey, show: showProp, onToggle, className, ...props },
  ref,
) {
  const reduce = useReducedMotion();
  const [showLocal, setShowLocal] = useState(false);
  const controlled = typeof showProp === 'boolean';
  const show = controlled ? showProp : showLocal;
  const toggle = () => (controlled ? onToggle?.() : setShowLocal((v) => !v));

  return (
    <FieldShell id={id} label={label} labelAction={labelAction} error={error} hint={hint} shakeKey={shakeKey}>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={show ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn('h-11 px-4 pr-12 text-base sm:text-sm', FOCUS_RING, className)}
          {...props}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 sm:right-1.5 sm:size-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-500))] active:scale-95"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={show ? 'off' : 'on'}
              className="inline-flex"
              initial={reduce ? false : { opacity: 0, rotate: -40, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 40, scale: 0.7 }}
              transition={{ duration: reduce ? 0 : 0.12 }}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </FieldShell>
  );
});

const NOTICE_STYLES = {
  error: 'border-[var(--error)]/25 bg-[var(--error-soft)] text-[var(--error)]',
  success: 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-50))] text-[hsl(var(--brand-700))]',
  info: 'border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--info)]',
};

export function Notice({ type = 'info', children, className }) {
  const Icon = type === 'error' ? AlertCircle : type === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn('wb-rise flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-sm leading-5', NOTICE_STYLES[type], className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/**
 * Inline notice that collapses in and out. Pass `{ type, text }` or null; the last message stays
 * rendered while the slot closes so the content below slides up instead of jumping.
 */
export function NoticeSlot({ notice, children, className }) {
  const last = useLast(notice ? { type: notice.type, node: notice.text ?? children } : null);
  return (
    <Dismissible show={Boolean(notice)}>
      <div className={className}>
        {last ? <Notice type={last.type}>{last.node}</Notice> : null}
      </div>
    </Dismissible>
  );
}

/**
 * Primary action: idle, then running (keeps its label so it never goes blank), then a brief done
 * check when `done` is set. The parent owns the state.
 */
export function SubmitButton({ loading, loadingLabel, done, doneLabel = 'Done', children, className, disabled, ...props }) {
  const state = loading ? 'running' : done ? 'done' : 'idle';
  return (
    <StateButton
      type="submit"
      state={state}
      labels={{ idle: children, running: loadingLabel || children, done: doneLabel }}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn('h-11 w-full text-sm font-medium aria-busy:disabled:opacity-100', className)}
      {...props}
    />
  );
}

const STRENGTH = [
  null,
  { label: 'Okay', color: 'var(--warning)' },
  { label: 'Good', color: 'hsl(var(--brand-700))' },
  { label: 'Strong', color: 'var(--success)' },
  { label: 'Very strong', color: 'var(--success)' },
];

/** What would help most right now, as one short sentence. Only the minimum length is enforced. */
function nextTip(password, minLength) {
  if (!(/[a-z]/.test(password) && /[A-Z]/.test(password))) return 'Mix upper and lower case letters';
  if (!/\d/.test(password)) return 'Add a number';
  if (password.length < 12) return 'Use 12 or more characters';
  return 'Nice, that is hard to guess';
}

/**
 * New-password feedback: a four-step bar and one line of text that changes as you type. Below the
 * minimum it counts down the characters left; once the minimum is met it names the label and the
 * single next thing that would strengthen it. Screen readers hear a stable summary, not every keystroke.
 */
export function PasswordRules({ password, minLength = 6 }) {
  const reduce = useReducedMotion();
  const long = password.length >= minLength;
  const mixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const score = long ? 1 + (mixed ? 1 : 0) + (/\d/.test(password) ? 1 : 0) + (password.length >= 12 ? 1 : 0) : 0;
  const level = STRENGTH[score];
  const left = minLength - password.length;
  const tip = long ? nextTip(password, minLength) : null;
  const text = long
    ? tip
    : password.length === 0
      ? `Use at least ${minLength} characters`
      : `${left} more character${left === 1 ? '' : 's'} to go`;

  return (
    <div className="space-y-1.5 px-1" aria-label="Password strength">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className="h-1 flex-1 rounded-full"
            style={{
              backgroundColor: n <= score ? level.color : 'hsl(var(--wb-line))',
              transition: reduce ? 'none' : 'background-color 150ms',
            }}
          />
        ))}
      </div>
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span key={text} className="wb-fade text-muted-foreground">{text}</span>
        {level ? <span className="shrink-0 font-medium" style={{ color: level.color }}>{level.label}</span> : null}
      </p>
      <span className="sr-only" role="status">
        {long ? `Password strength: ${level.label}. ${tip}.` : `At least ${minLength} characters needed.`}
      </span>
    </div>
  );
}
