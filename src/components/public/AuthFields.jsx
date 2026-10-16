import React, { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
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

export function FieldShell({ id, label, labelAction, error, hint, children }) {
  const reduce = useReducedMotion();
  const [focusCount, setFocusCount] = useState(0);
  const lastError = useLast(error);
  return (
    <div className="group/field space-y-1.5" onFocusCapture={() => setFocusCount((n) => n + 1)}>
      <div className="flex items-center justify-between gap-3 px-1">
        {/* The label settles into place each time the field takes focus. */}
        <motion.label
          key={focusCount}
          htmlFor={id}
          initial={reduce || focusCount === 0 ? false : { y: 3, opacity: 0.55 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className="text-[13px] font-medium text-muted-foreground transition-colors duration-150 group-focus-within/field:text-[hsl(var(--brand-700))]"
        >
          {label}
        </motion.label>
        {labelAction}
      </div>
      {children}
      <Dismissible show={Boolean(error)}>
        <p id={`${id}-error`} className="flex items-start gap-1.5 px-1 pt-0.5 text-xs text-[var(--error)]">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{lastError}</span>
        </p>
      </Dismissible>
      {!error && hint ? <p id={`${id}-hint`} className="px-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextField({ id, label, labelAction, error, hint, className, ...props }) {
  return (
    <FieldShell id={id} label={label} labelAction={labelAction} error={error} hint={hint}>
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
  { id, label, labelAction, error, hint, show: showProp, onToggle, className, ...props },
  ref,
) {
  const reduce = useReducedMotion();
  const [showLocal, setShowLocal] = useState(false);
  const controlled = typeof showProp === 'boolean';
  const show = controlled ? showProp : showLocal;
  const toggle = () => (controlled ? onToggle?.() : setShowLocal((v) => !v));

  return (
    <FieldShell id={id} label={label} labelAction={labelAction} error={error} hint={hint}>
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

/** Live checklist for a new password, as pills that turn teal when met. Only the minimum length is enforced. */
export function PasswordRules({ password, minLength = 6 }) {
  const reduce = useReducedMotion();
  const rules = [
    { ok: password.length >= minLength, label: `At least ${minLength} characters`, required: true },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: 'Upper and lower case letters' },
    { ok: /\d/.test(password), label: 'A number' },
  ];
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Password rules">
      {rules.map((r) => (
        <li
          key={r.label}
          className="wb-chip"
          data-tone={r.ok ? 'brand' : undefined}
          style={{ transition: reduce ? 'none' : 'background-color 150ms, border-color 150ms, color 150ms' }}
        >
          <span className="relative inline-flex size-3 items-center justify-center" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              {r.ok ? (
                <motion.span
                  key="ok"
                  className="inline-flex"
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                >
                  <Check className="size-3" strokeWidth={2.4} />
                </motion.span>
              ) : (
                <motion.span key="no" className="inline-block size-2 rounded-full border border-current opacity-60" exit={{ opacity: 0 }} transition={{ duration: 0.1 }} />
              )}
            </AnimatePresence>
          </span>
          <span>
            {r.label}
            {!r.required && <span className="opacity-70"> (recommended)</span>}
            <span className="sr-only">{r.ok ? ', met' : ', not met'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
