import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion';
import { Banner, ConfirmDialog, HelpBody, HelpPopover, StatusChip, inputCls } from './adminUi';

/* Shared bits for the admin Infra page: formatters, small layout pieces, and the one confirm
 * dialog every write goes through. Styling is token-only (see adminUi.jsx). */

export function fmtTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** "5 min ago" / "in 2 h" — rough on purpose; the absolute time sits next to it. */
export function fmtRelative(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  let text;
  if (abs < 60) text = `${abs} s`;
  else if (abs < 3600) text = `${Math.round(abs / 60)} min`;
  else if (abs < 86400) text = `${(abs / 3600).toFixed(abs < 36000 ? 1 : 0)} h`;
  else text = `${Math.round(abs / 86400)} d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

export function fmtAge(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '–';
  const s = Math.round(Number(sec));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function fmtHours(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return '–';
  if (n < 1) return `${Math.round(n * 60)} min`;
  return `${n} h`;
}

export function fmtValue(v) {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function isFutureIso(iso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** `CODE: message (HTTP 409)` — whatever the server gave us, never a bare "failed". */
export function describeApiError(error) {
  if (!error) return 'Unknown error.';
  const code = error.code && error.code !== error.message ? `${error.code}: ` : '';
  const status = error.status ? ` (HTTP ${error.status})` : '';
  return `${code}${error.message || 'Request failed'}${status}`;
}

/**
 * The status payload reports a failed AWS read per panel in `errors`. The contract does not pin
 * the key names, so a panel matches its own key, any dotted child (`workers.annovar`) or a
 * dotted parent (`workers` blocks both worker cards).
 */
export function findPanelError(errors, keys) {
  if (!errors || typeof errors !== 'object') return null;
  for (const [errKey, errVal] of Object.entries(errors)) {
    if (!errVal) continue;
    for (const k of keys) {
      if (errKey === k || errKey.startsWith(`${k}.`) || k.startsWith(`${errKey}.`)) {
        return typeof errVal === 'string' ? errVal : JSON.stringify(errVal);
      }
    }
  }
  return null;
}

/**
 * Newest audit row matching `predicate`, or null. The audit list is only the last N actions
 * and its target shape is loose, so callers pass a deliberately narrow predicate and the
 * "last changed" line simply does not render when nothing matches.
 */
export function latestAudit(audit, predicate) {
  if (!Array.isArray(audit)) return null;
  let best = null;
  let bestAt = -Infinity;
  for (const row of audit) {
    let ok = false;
    try { ok = predicate(row); } catch { ok = false; }
    if (!ok) continue;
    const t = new Date(row.at).getTime();
    if (Number.isFinite(t) && t > bestAt) { best = row; bestAt = t; }
  }
  return best;
}

export const targetText = (row) => fmtValue(row?.target).toLowerCase();

/** "Last changed by x, 5 min ago" — renders nothing without data. */
export function ChangeLine({ by, at, reason, className }) {
  if (!by && !at) return null;
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      Last changed{by ? <> by <span className="text-foreground">{by}</span></> : null}
      {at ? <span title={fmtTime(at)}> · {fmtRelative(at)}</span> : null}
      {reason ? <> · {reason}</> : null}
    </p>
  );
}

/** A "?" popover for a `{ what, items }` help object. */
export function LeverHelp({ help, title }) {
  if (!help) return null;
  return (
    <HelpPopover title={title} align="start">
      <HelpBody what={help.what} items={help.items} />
    </HelpPopover>
  );
}

/** A control group inside a card: title, "?" help, then the control. */
export function Lever({ title, help, children, className }) {
  return (
    <div className={cn('border-t border-[hsl(var(--wb-line))] pt-3.5', className)}>
      <div className="mb-2 flex items-center gap-0.5">
        <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        <LeverHelp help={help} title={title} />
      </div>
      {children}
    </div>
  );
}

/** Label above, control below, optional bounds hint. */
export function Field({ label, hint, className, children }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 font-normal tabular-nums">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/** "3", "12 / 40" or "2 / 4 / 8": every part numeric -> each part counts up; anything else is text. */
function Value({ value }) {
  if (typeof value === 'number' && Number.isFinite(value)) return <CountUp value={value} startAt={0} />;
  if (typeof value === 'string' && /^-?\d+( \/ -?\d+)*$/.test(value)) {
    const parts = value.split(' / ');
    return parts.map((p, i) => (
      <span key={i}>{i > 0 ? ' / ' : ''}<CountUp value={Number(p)} startAt={0} /></span>
    ));
  }
  return value;
}

/** One number with a quiet label. `over` shows an error pill (e.g. running above its cap). */
export function Stat({ label, value, tone, sub, over }) {
  return (
    <div className="min-w-0 tabular-nums">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('truncate text-[15px] font-semibold leading-6 text-foreground', tone)}>
        <Value value={value} />
      </div>
      {over ? <StatusChip tone="error" className="mt-0.5">{over}</StatusChip> : null}
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function Unavailable({ reason }) {
  return (
    <Banner tone="warning">
      Status unavailable{reason ? `: ${reason}` : ''}. Controls are disabled until it loads.
    </Banner>
  );
}

/** − [n] + within [min, max], as one pill. Holds a string draft so the field can be cleared while typing. */
export function Stepper({ value, onChange, min, max, step = 1, disabled, width = 'w-12', label }) {
  const n = Number(value);
  const clamp = (x) => Math.min(max, Math.max(min, x));
  const bump = (d) => {
    const base = Number.isFinite(n) ? n : min;
    onChange(String(clamp(Math.round((base + d) / step) * step)));
  };
  const btn = 'size-7 rounded-full text-muted-foreground max-md:size-10';
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] px-0.5 max-md:h-11 transition-colors duration-150 hover:border-[hsl(var(--brand-300))] focus-within:border-[hsl(var(--ring))] focus-within:ring-2 focus-within:ring-[hsl(var(--ring)/0.35)]',
        disabled && 'opacity-50',
      )}
      role="group"
      aria-label={label}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || !Number.isFinite(n) || n <= min}
        onClick={() => bump(-step)}
        aria-label={label ? `Decrease ${label}` : 'Decrease'}
        className={btn}
      >
        <span aria-hidden="true">−</span>
      </Button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-7 bg-transparent text-center text-[13px] max-md:h-10 max-md:text-base tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none', width)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled || (Number.isFinite(n) && n >= max)}
        onClick={() => bump(step)}
        aria-label={label ? `Increase ${label}` : 'Increase'}
        className={btn}
      >
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}

/**
 * Confirm-before-write (press and hold: every write here changes live infrastructure or config). `request` = {
 *   title, rows: [{ label, before, after }], note?, danger?,
 *   confirmLabel?: string        // the verb on the button ("Set floor"); defaults to "Apply"
 *   undo?: { undoable: boolean, text: string }   // whether and how this can be reverted
 *   askReason?: boolean          // reason typed here (required) when the form did not collect one
 *   run: async (reason) => response
 * }. Errors stay in the dialog so the admin can read the server's code/message and retry.
 */
export function ConfirmModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  if (!request) return null;

  const needsReason = Boolean(request.askReason);
  const canSubmit = !needsReason || reason.trim().length > 0;

  const submit = async () => {
    let response;
    try {
      response = await request.run(needsReason ? reason.trim() : undefined);
    } catch (err) {
      throw new Error(describeApiError(err));
    }
    onDone(request, response);
  };

  const rows = request.rows || [];

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={request.title}
      confirmLabel={request.confirmLabel || 'Apply'}
      destructive={Boolean(request.danger)}
      hold
      canConfirm={canSubmit}
      undoable={Boolean(request.undo?.undoable)}
      undoText={request.undo?.text}
      onConfirm={submit}
    >
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--wb-line))]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-[hsl(var(--wb-pill))] text-xs text-muted-foreground">
                <th className="px-3 py-1.5 font-medium"><span className="sr-only">Setting</span></th>
                <th className="px-3 py-1.5 font-medium">Now</th>
                <th className="px-3 py-1.5 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-[hsl(var(--wb-line))] align-top">
                  <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
                  <td className="break-all px-3 py-1.5 tabular-nums text-muted-foreground">{row.before === '' ? '–' : fmtValue(row.before)}</td>
                  <td className="break-all px-3 py-1.5 font-medium tabular-nums text-foreground">{fmtValue(row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {request.note && <p className="text-[13px] leading-5 text-muted-foreground">{request.note}</p>}
      <p className="text-[13px] leading-5 text-muted-foreground">Takes effect within ~1-2 min and is recorded in the audit log.</p>

      {needsReason && (
        <Field label="Reason (required)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={cn(inputCls, 'w-full')}
            autoFocus
          />
        </Field>
      )}
    </ConfirmDialog>
  );
}
