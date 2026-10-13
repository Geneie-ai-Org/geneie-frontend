import { useState } from 'react';

/* Shared bits for the admin Infra tab: styles matching AdminPage, formatters, and the one
 * confirm modal every write goes through. */

export const inputStyle = {
  backgroundColor: 'var(--bg-surface)',
  borderColor: 'var(--border-default)',
  color: 'var(--text-primary)',
};

export const cellStyle = { borderColor: 'var(--border-subtle)' };

export const cardStyle = {
  backgroundColor: 'var(--bg-surface-raised)',
  borderColor: 'var(--border-default)',
};

export const mutedText = { color: 'var(--text-tertiary)' };

export const primaryButtonClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50';
export const primaryButtonStyle = { backgroundColor: 'var(--accent-teal)', color: 'var(--accent-teal-contrast)' };
export const secondaryButtonClass = 'text-2xs px-2 py-1 rounded-md border disabled:opacity-50';
export const secondaryButtonStyle = { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' };
export const dangerButtonStyle = { borderColor: 'var(--error)', color: 'var(--error)' };

export function fmtTime(iso) {
  if (!iso) return '—';
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
  if (sec === null || sec === undefined || !Number.isFinite(Number(sec))) return '—';
  const s = Math.round(Number(sec));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function fmtHours(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return `${Math.round(n * 60)} min`;
  return `${n} h`;
}

export function fmtValue(v) {
  if (v === null || v === undefined) return '—';
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
 * Plain-language help: a one-line "what it does", plus a collapsed block of
 * `[label, text]` rows (When to use / What happens / Cost / Reverts, or what each number means).
 */
export function Help({ what, items, summary = 'More' }) {
  return (
    <div className="mb-2">
      {what && <p className="text-2xs" style={{ color: 'var(--text-secondary)' }}>{what}</p>}
      {items && items.length > 0 && (
        <details className="mt-1">
          <summary className="text-2xs cursor-pointer" style={mutedText}>{summary}</summary>
          <dl className="mt-1 text-2xs space-y-1">
            {items.map(([label, text]) => (
              <div key={label} className="flex gap-2">
                <dt className="shrink-0 w-32 font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</dt>
                <dd style={mutedText}>{text}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

export function Section({ title, right, help, children }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {right}
      </div>
      {help ? <Help {...help} summary={help.summary || 'What these numbers mean'} /> : <div className="mb-2" />}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <div className="tabular-nums">
      <div className="text-2xs mb-0.5" style={mutedText}>{label}</div>
      <div className="text-sm font-semibold" style={{ color: tone || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

export function Unavailable({ reason }) {
  return (
    <p className="text-2xs" style={{ color: 'var(--warning)' }}>
      Status unavailable{reason ? ` — ${reason}` : ''}. Levers are disabled until it loads.
    </p>
  );
}

/** − [n] + within [min, max]. Holds a string draft so the field can be cleared while typing. */
export function Stepper({ value, onChange, min, max, step = 1, disabled, width = 'w-16' }) {
  const n = Number(value);
  const clamp = (x) => Math.min(max, Math.max(min, x));
  const bump = (d) => {
    const base = Number.isFinite(n) ? n : min;
    onChange(String(clamp(Math.round((base + d) / step) * step)));
  };
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || !Number.isFinite(n) || n <= min}
        onClick={() => bump(-step)}
        className={secondaryButtonClass}
        style={secondaryButtonStyle}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} px-2 py-1 text-xs rounded-md border tabular-nums disabled:opacity-50`}
        style={inputStyle}
      />
      <button
        type="button"
        disabled={disabled || (Number.isFinite(n) && n >= max)}
        onClick={() => bump(step)}
        className={secondaryButtonClass}
        style={secondaryButtonStyle}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

/**
 * Confirm-before-write. `request` = {
 *   title, rows: [{ label, before, after }], note?, danger?,
 *   askReason?: boolean   // reason typed here (required) when the form did not collect one
 *   run: async (reason) => response
 * }. Errors stay in the modal so the admin can read the server's code/message and retry.
 */
export function ConfirmModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!request) return null;

  const needsReason = Boolean(request.askReason);
  const canSubmit = !submitting && (!needsReason || reason.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await request.run(needsReason ? reason.trim() : undefined);
      onDone(request, response);
    } catch (err) {
      setError(describeApiError(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
    >
      <div className="w-full max-w-md rounded-xl border p-5" style={cardStyle}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{request.title}</h3>

        <table className="w-full text-left text-xs mb-3">
          <thead>
            <tr className="text-2xs" style={mutedText}>
              <th className="py-1 pr-2 font-medium" />
              <th className="py-1 pr-2 font-medium">Before</th>
              <th className="py-1 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {request.rows.map((row) => (
              <tr key={row.label} className="align-top">
                <td className="py-1 pr-2" style={mutedText}>{row.label}</td>
                <td className="py-1 pr-2 break-all" style={{ color: 'var(--text-secondary)' }}>{fmtValue(row.before)}</td>
                <td className="py-1 break-all font-medium" style={{ color: 'var(--text-primary)' }}>{fmtValue(row.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {request.note && <p className="text-2xs mb-2" style={{ color: 'var(--text-secondary)' }}>{request.note}</p>}
        <p className="text-2xs mb-3" style={mutedText}>Takes effect within ~1-2 min.</p>

        {needsReason && (
          <label className="flex flex-col gap-1 mb-3">
            <span className="text-2xs" style={mutedText}>Reason (required)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              className="px-2 py-1.5 text-xs rounded-md border"
              style={inputStyle}
              autoFocus
            />
          </label>
        )}

        {error && (
          <p className="text-2xs mb-3 break-words" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
            style={secondaryButtonStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={primaryButtonClass}
            style={request.danger
              ? { backgroundColor: 'var(--error)', color: '#fff' }
              : primaryButtonStyle}
          >
            {submitting ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
