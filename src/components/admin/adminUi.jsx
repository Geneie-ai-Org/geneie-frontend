import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleHelp, Copy, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* Shared presentation for the admin surfaces (Users page and Infra page): dense, token-only,
 * both themes. Nothing here talks to an API. */

/** Dense field styles (admin runs at 13px; controls are 28 / 32px). */
const fieldBase =
  'rounded-md border border-input bg-background px-2 text-xs text-foreground tabular-nums outline-none transition-colors placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50';
export const inputCls = `h-8 ${fieldBase}`;
export const inputSmCls = `h-7 ${fieldBase}`;
export const selectCls = `h-8 ${fieldBase} pr-6`;
export const selectSmCls = `h-7 ${fieldBase} pr-6`;

/** Table head cell / body cell classes shared by every admin table. */
export const thCls =
  'sticky top-0 z-10 h-9 border-b border-border bg-card px-3 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap';
export const tdCls = 'h-10 border-b border-border/60 px-3 align-middle text-xs';

const TONE_TEXT = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
  info: 'text-[var(--info)]',
  muted: 'text-muted-foreground',
};
export const toneText = (tone) => TONE_TEXT[tone] || TONE_TEXT.muted;

/** A word plus a small dot. Colour carries meaning only; the word always says it too. */
export function StatusChip({ tone = 'muted', children, className, title }) {
  return (
    <Badge variant={tone} title={title} className={cn('h-5 gap-1.5 rounded-full px-2 text-2xs', className)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </Badge>
  );
}

/** Rows of `[label, text]` plus an optional lead sentence: the body of every "?" popover. */
export function HelpBody({ what, items, children }) {
  return (
    <div className="space-y-2 text-xs leading-[18px]">
      {what && <p className="text-foreground">{what}</p>}
      {children}
      {items && items.length > 0 && (
        <dl className="space-y-1.5">
          {items.map(([label, text]) => (
            <div key={label}>
              <dt className="font-medium text-foreground">{label}</dt>
              <dd className="text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The "?" affordance. Paragraphs of explanation live here, not on the page. */
export function HelpPopover({ title, label = 'Help', align = 'end', className, children }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={title ? `${label}: ${title}` : label}
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:size-10',
          className,
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 max-w-[calc(100vw-2rem)] gap-2 p-3">
        {title && <PopoverTitle className="text-xs">{title}</PopoverTitle>}
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A mono id with an always-visible copy button. */
export function CopyId({ value, label = 'id', className }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the id is still selectable text */
    }
  };
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
      <code className="truncate font-mono text-2xs text-muted-foreground">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55"
      >
        {copied ? <Check className="size-3 text-[var(--success)]" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      </button>
    </span>
  );
}

/** Page frame shared by /admin-haha and /admin-haha/infra so the two read as one tool. */
export function AdminFrame({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}

/** Title row: tool switcher (Users | Infra), page title, help, actions. */
export function AdminHeader({ current, title, subtitle, help, actions }) {
  const tab = (key, to, text) => (
    <Link
      to={to}
      aria-current={current === key ? 'page' : undefined}
      className={cn(
        'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9',
        current === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {text}
    </Link>
  );
  return (
    <header className="mb-5">
      <nav aria-label="Admin sections" className="mb-3 flex items-center gap-1">
        {tab('users', '/admin-haha', 'Users')}
        {tab('infra', '/admin-haha/infra', 'Infra')}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            {help}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A flat hairline surface with an optional header row. Never nested in another Panel. */
export function Panel({ title, description, help, badge, actions, children, className, bodyClassName, muted = false, as: Tag = 'section' }) {
  const hasHead = title || actions || badge;
  return (
    <Tag
      className={cn(
        'rounded-lg border',
        muted ? 'border-dashed border-border bg-muted/30' : 'border-border bg-card',
        className,
      )}
    >
      {hasHead && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
            {badge}
            {help}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {description && <p className="px-4 pt-3 text-xs text-muted-foreground">{description}</p>}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Inline persistent banner for errors and warnings that must not vanish like a toast. */
export function Banner({ tone = 'error', children, action }) {
  const Icon = tone === 'info' ? Info : TriangleAlert;
  const toneCls = {
    error: 'border-[var(--error)] bg-[var(--error-soft)] text-[var(--error)]',
    warning: 'border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]',
    info: 'border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', toneCls)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words text-foreground">{children}</div>
      {action}
    </div>
  );
}

/**
 * Confirm-before-write dialog for every state-changing admin action.
 *
 *  - `title` names what is about to happen and to whom.
 *  - `children` states exactly what changes (rows, before -> after).
 *  - `undoable` + `undoText` say whether it can be undone; the button carries the verb.
 *  - `onConfirm` may throw (message shown inline, dialog stays open) or resolve to
 *    `{ ok: false, error }`; any other resolution closes the dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  undoable,
  undoText,
  confirmLabel,
  destructive = false,
  canConfirm = true,
  onConfirm,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const run = async () => {
    if (submitting || !canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result && result.ok === false) throw new Error(result.error || 'The change did not go through.');
      setSubmitting(false);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'The change did not go through.');
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-left">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {undoText && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            {undoable
              ? <Info className="mt-px size-4 shrink-0 text-[var(--info)]" aria-hidden="true" />
              : <TriangleAlert className="mt-px size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />}
            <span>
              <span className="font-medium text-foreground">{undoable ? 'Can be undone. ' : 'Cannot be undone. '}</span>
              {undoText}
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="break-words rounded-md bg-[var(--error-soft)] px-2.5 py-2 text-xs text-[var(--error)]">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={run}
            disabled={submitting || !canConfirm}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {submitting ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
