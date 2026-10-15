import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Check, Circle, Eye, EyeOff, Info, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Small form pieces shared by the sign-in form and the password-reset page. Label above,
 * helper or error below, 44px-tall controls so they work as touch targets.
 */

export function FieldShell({ id, label, labelAction, error, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-xs text-[var(--error)]">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
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
        className={cn('h-11 px-3 text-base sm:text-sm', className)}
        {...props}
      />
    </FieldShell>
  );
}

export const PasswordField = React.forwardRef(function PasswordField(
  { id, label, labelAction, error, hint, show: showProp, onToggle, className, ...props },
  ref,
) {
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
          className={cn('h-11 px-3 pr-12 text-base sm:text-sm', className)}
          {...props}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </FieldShell>
  );
});

const NOTICE_STYLES = {
  error: 'border-[var(--error)]/30 bg-[var(--error-soft)] text-[var(--error)]',
  success: 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]',
  info: 'border-[var(--info)]/30 bg-[var(--info-soft)] text-[var(--info)]',
};

export function Notice({ type = 'info', children, className }) {
  const Icon = type === 'error' ? AlertCircle : type === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-5', NOTICE_STYLES[type], className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

/** Primary action: keeps its label while busy so the button never goes blank. */
export function SubmitButton({ loading, loadingLabel, children, className, ...props }) {
  return (
    <Button
      type="submit"
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={cn('h-11 w-full text-sm font-medium', className)}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {loadingLabel || children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Live checklist for a new password. Only the minimum length is enforced. */
export function PasswordRules({ password, minLength = 6 }) {
  const rules = [
    { ok: password.length >= minLength, label: `At least ${minLength} characters`, required: true },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: 'Upper and lower case letters' },
    { ok: /\d/.test(password), label: 'A number' },
  ];
  return (
    <ul className="space-y-1" aria-label="Password rules">
      {rules.map((r) => (
        <li
          key={r.label}
          className={cn('flex items-center gap-2 text-xs', r.ok ? 'text-[var(--success)]' : 'text-muted-foreground')}
        >
          {r.ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
          <span>
            {r.label}
            {!r.required && <span className="text-[var(--text-tertiary)]"> (recommended)</span>}
            <span className="sr-only">{r.ok ? ', met' : ', not met'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
