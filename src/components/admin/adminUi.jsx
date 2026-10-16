import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, CircleHelp, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapse, CopyButton, HoldButton, SPRING, SelectionMarker, Turn } from '@/components/motion';

/* Shared presentation for the admin surfaces (Users page and Infra page): dense, token-only,
 * both themes, pills and hairline cards on the faint canvas (see docs/DESIGN_PLAYBOOK.md G).
 * Nothing here talks to an API. */

/** Full-alpha 2px ring (the global one is 45% alpha, under 3:1 on white). */
export const FOCUS = 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]';

/** Pill field styles (admin runs at 13px; controls are 32px). */
const fieldBase =
  'rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 text-[13px] text-foreground tabular-nums outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--ring))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)] disabled:cursor-not-allowed disabled:opacity-50';
export const inputCls = `h-8 ${fieldBase}`;
export const inputSmCls = `h-7 ${fieldBase}`;
export const selectCls = `h-8 ${fieldBase} pr-7`;
export const selectSmCls = `h-7 ${fieldBase} pr-7`;
/** Multi-line fields cannot be a full pill; they keep a generous radius. */
export const areaCls = 'w-full rounded-2xl border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-3 py-2 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--ring))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)] disabled:cursor-not-allowed disabled:opacity-50';

/** Table head cell / body cell classes shared by every admin table (36px rows). */
export const thCls =
  'sticky top-0 z-10 h-9 border-b border-[hsl(var(--wb-line))] bg-[hsl(var(--wb-card))] px-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap';
export const tdCls = 'h-9 border-b border-[hsl(var(--wb-line)/0.6)] px-3 align-middle text-[13px]';

const TONE_TEXT = {
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
  info: 'text-[var(--info)]',
  muted: 'text-muted-foreground',
};
/** Outline-red action pill (the Button's own variants lose to the scope's outline rule, hence the `!`). */
export const DANGER_BTN = '!border-[var(--error)] !text-[var(--error)] hover:!bg-[var(--error-soft)] hover:!text-[var(--error)]';

export const toneText = (tone) => TONE_TEXT[tone] || TONE_TEXT.muted;

/**
 * A word plus a small dot, in the workbench status-pill shape. Colour carries meaning only; the
 * word always says it too. success -> done (teal), error -> failed, muted -> neutral; warning and
 * info are static (the pulsing "running" look is reserved for work that is really running).
 */
export function StatusChip({ tone = 'muted', children, className, title }) {
  const state = { success: 'done', error: 'failed', muted: 'queued' }[tone];
  const extra = tone === 'warning'
    ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
    : tone === 'info'
      ? 'bg-[var(--info-soft)] text-[var(--info)]'
      : '';
  return (
    <span className={cn('wb-status', extra, className)} data-state={state} title={title}>
      {children}
    </span>
  );
}

/** Rows of `[label, text]` plus an optional lead sentence: the body of every "?" popover. */
export function HelpBody({ what, items, children }) {
  return (
    <div className="space-y-2 text-[13px] leading-5">
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
          'relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 after:absolute after:-inset-2.5 after:content-[\'\'] md:after:hidden hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] data-[popup-open]:bg-[hsl(var(--brand-100))] data-[popup-open]:text-[hsl(var(--brand-700))]',
          FOCUS,
          className,
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 max-w-[calc(100vw-2rem)] gap-2 p-3">
        {title && <PopoverTitle className="text-[13px]">{title}</PopoverTitle>}
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A mono id with an always-visible copy button (the shared CopyButton, icon only). */
export function CopyId({ value, label = 'id', className, shown, mono = true }) {
  if (!value) return null;
  return (
    <span className={cn('inline-flex max-w-full items-center gap-0.5', className)}>
      <code className={cn('truncate text-xs text-muted-foreground', mono && 'font-mono')} title={String(value)}>{shown ?? value}</code>
      <CopyIcon value={value} label={label} />
    </span>
  );
}

/** Icon-only copy button: ghost pill, label slides to a drawn check for ~1.6 s. */
export function CopyIcon({ value, label = 'value', className }) {
  return (
    <CopyButton
      getText={() => String(value)}
      label=""
      copiedLabel=""
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${label}`}
      className={cn('size-6 text-muted-foreground max-md:-mx-1 max-md:-my-2 max-md:size-10', FOCUS, className)}
    />
  );
}

/** Page frame shared by /admin-haha and /admin-haha/infra so the two read as one tool. */
export function AdminFrame({ children }) {
  return (
    <div className="wb-scope adm-scope min-h-screen text-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </div>
  );
}

/** Title row: tool switcher (Users | Infra), page title, help, actions. */
export function AdminHeader({ current, title, subtitle, help, actions }) {
  /* The two tools are separate routes, so the page remounts on a switch: the selected pill is
   * static rather than a shared-layout slide (there is nothing to glide from). */
  const tab = (key, to, text) => {
    const on = current === key;
    return (
      <Link
        to={to}
        aria-current={on ? 'page' : undefined}
        data-selected={on ? 'true' : 'false'}
        className={cn('wb-tab px-3.5 text-[13px] font-medium', FOCUS)}
      >
        {text}
      </Link>
    );
  };
  return (
    <header className="mb-5">
      <nav aria-label="Admin sections" className="mb-4 flex items-center gap-1.5">
        {tab('users', '/admin-haha', 'Users')}
        {tab('infra', '/admin-haha/infra', 'Infra')}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-[18px] font-semibold leading-6 text-foreground">{title}</h1>
            {help}
          </div>
          {subtitle && <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A white hairline card with an optional header row. Never nested in another Panel. */
export function Panel({ title, description, help, badge, actions, children, className, bodyClassName, as: Tag = 'section', ...rest }) {
  const hasHead = title || actions || badge;
  return (
    <Tag className={cn('wb-card', className)} {...rest}>
      {hasHead && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--wb-line))] px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {title && <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>}
            {badge}
            {help}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {description && <p className="px-4 pt-3 text-[13px] text-muted-foreground">{description}</p>}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Inline persistent banner for errors and warnings that must not vanish like a toast. */
export function Banner({ tone = 'error', children, action }) {
  const Icon = tone === 'info' ? Info : TriangleAlert;
  const toneCls = {
    error: 'bg-[var(--error-soft)] [&>svg]:text-[var(--error)]',
    warning: 'bg-[var(--warning-soft)] [&>svg]:text-[var(--warning)]',
    info: 'bg-[var(--info-soft)] [&>svg]:text-[var(--info)]',
  }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px]', toneCls)}>
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words leading-5 text-foreground">{children}</div>
      {action}
    </div>
  );
}

/** Skeleton bar that matches the size of the content it stands in for. */
export function Bar({ className, style }) {
  return <span aria-hidden="true" style={style} className={cn('wb-shimmer block h-3 rounded-full', className)} />;
}

/** Empty / error body for a table or card: what this is, why, one action. */
export function StateBlock({ tone = 'empty', title, children, action, className }) {
  const error = tone === 'error';
  return (
    <div role={error ? 'alert' : 'status'} className={cn('flex flex-col items-center justify-center gap-1.5 px-6 py-8 text-center', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'mb-1 flex size-9 items-center justify-center rounded-full border',
          error
            ? 'border-transparent bg-[var(--error-soft)] text-[var(--error)]'
            : 'border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]',
        )}
      >
        {error ? <TriangleAlert className="size-[18px]" /> : <Info className="size-[18px]" />}
      </span>
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {children && <p className="max-w-md break-words text-[13px] leading-5 text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** A details toggle: a pill button with aria-expanded, a turning chevron and a smooth Collapse. */
export function Disclosure({ label, children, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useRef(`disc-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn('inline-flex h-7 items-center gap-1 rounded-full border border-transparent pl-1.5 pr-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--wb-card))] hover:text-foreground', FOCUS)}
      >
        <Turn open={open}><ChevronRight className="size-4" aria-hidden="true" /></Turn>
        {label}
      </button>
      <Collapse open={open} id={id}>
        <div className="pt-2">{children}</div>
      </Collapse>
    </div>
  );
}

/**
 * Keyboard row selection for a data table: roving tabindex, Up/Down/Home/End on the focused row
 * move a sliding SelectionMarker, Enter hands focus to the row's last control (its menu or action button). Nothing here
 * ever triggers an action. Usage:
 *   const nav = useRowNav(keys); <tbody onKeyDown={nav.onKeyDown}>
 *   <tr {...nav.rowProps(key)}> <td>{nav.marker(key)} ...
 */
export function useRowNav(keys, group) {
  const [sel, setSel] = useState(null);
  const refs = useRef(new Map());
  const active = keys.includes(sel) ? sel : null;
  const tabKey = active ?? keys[0];

  const go = (key) => {
    setSel(key);
    const el = refs.current.get(key);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView?.({ block: 'nearest' }); }
  };
  const onKeyDown = (e) => {
    if (e.target?.tagName !== 'TR' || !keys.length) return;
    const i = Math.max(0, keys.indexOf(active ?? tabKey));
    if (e.key === 'ArrowDown') { e.preventDefault(); go(keys[Math.min(keys.length - 1, i + 1)]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(keys[Math.max(0, i - 1)]); }
    else if (e.key === 'Home') { e.preventDefault(); go(keys[0]); }
    else if (e.key === 'End') { e.preventDefault(); go(keys[keys.length - 1]); }
    else if (e.key === 'Enter') {
      const ctls = e.target.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href]');
      const ctl = ctls[ctls.length - 1]; // the row's action control (menu or button)
      if (ctl) { e.preventDefault(); ctl.focus(); }
    }
  };
  const rowProps = (key) => ({
    ref: (el) => { if (el) refs.current.set(key, el); else refs.current.delete(key); },
    tabIndex: key === tabKey ? 0 : -1,
    'data-selected': key === active ? 'true' : undefined,
    'aria-current': key === active ? 'true' : undefined,
    onFocus: () => setSel(key),
    onClick: () => setSel(key),
    className: 'relative isolate outline-none transition-colors duration-150 hover:bg-[hsl(var(--brand-50))] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))]',
  });
  const marker = (key) => (key === active ? (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <SelectionMarker group={group || 'rows'} />
    </span>
  ) : null);
  return { onKeyDown, rowProps, marker, selected: active };
}

/** Scroll container that tells motion about its scroll offset so the SelectionMarker glides true. */
export function ScrollBox({ className, children, label, style }) {
  return (
    <motion.div layoutScroll role="region" tabIndex={0} aria-label={label} style={style} className={cn('overflow-auto outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[hsl(var(--ring))]', className)}>
      {children}
    </motion.div>
  );
}

/** Pill segmented switcher with a sliding pill; roving Left/Right/Home/End. `items`: [{ key, label, count }]. */
export function Segmented({ items, value, onChange, label, group }) {
  const reduce = useReducedMotion();
  const refs = useRef([]);
  const idx = Math.max(0, items.findIndex((i) => i.key === value));
  const onKeyDown = (e) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap items-center gap-1 max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1 [&>*]:shrink-0">
      {items.map((it, i) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-selected={on ? 'true' : 'false'}
            onClick={() => onChange(it.key)}
            className={cn('wb-tab wb-tab--slide gap-1.5 px-3 text-[13px] font-medium', FOCUS)}
          >
            {on && <motion.span layoutId={`${group}-pill`} transition={reduce ? { duration: 0 } : SPRING} className="wb-tab-pill" aria-hidden="true" />}
            <span className="relative">{it.label}</span>
            {it.count !== undefined && <span className="wb-tab-badge relative">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Confirm-before-write dialog for every state-changing admin action.
 *
 *  - `title` names what is about to happen and to whom.
 *  - `children` states exactly what changes (rows, before -> after).
 *  - `undoable` + `undoText` say whether it can be undone; the button carries the verb.
 *  - `hold` (default: `destructive`) makes the confirm a press-and-hold button, so a stray click
 *    cannot write. While the request is in flight it becomes a disabled "Working..." button; if the
 *    server refuses, the hold re-arms and the message shows inline.
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
  hold,
  canConfirm = true,
  onConfirm,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const useHold = hold ?? destructive;

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
          <AlertDialogTitle className="text-[15px] font-semibold">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-left text-[13px] leading-5">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        {undoText && (
          <div className="flex flex-col items-start gap-1.5 text-[13px] leading-5 text-muted-foreground">
            <StatusChip tone={undoable ? 'success' : 'warning'}>{undoable ? 'Can be undone' : 'Cannot be undone'}</StatusChip>
            <span>{undoText}</span>
          </div>
        )}
        {error && (
          <p role="alert" className="break-words rounded-2xl bg-[var(--error-soft)] px-3.5 py-2.5 text-[13px] leading-5 text-[var(--error)]">
            {error}
          </p>
        )}
        <AlertDialogFooter className="items-center">
          {useHold && !submitting && canConfirm && (
            <span className="mr-auto text-xs text-muted-foreground">Press and hold to confirm</span>
          )}
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          {submitting ? (
            <Button type="button" disabled aria-live="polite">Working…</Button>
          ) : useHold ? (
            <HoldButton
              key={`${title}-${error ? 'retry' : 'first'}`}
              tone={destructive ? 'danger' : 'brand'}
              holdMs={destructive ? 1200 : 900}
              doneLabel="Sending…"
              disabled={!canConfirm}
              onConfirm={run}
              className="h-8"
            >
              {confirmLabel}
            </HoldButton>
          ) : (
            <Button type="button" onClick={run} disabled={!canConfirm}>{confirmLabel}</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
