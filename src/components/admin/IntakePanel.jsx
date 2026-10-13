import { useState } from 'react';
import {
  adminPauseIntake,
  adminResumeIntake,
  INTAKE_HOURS_MIN,
  INTAKE_KINDS,
  validateIntakeForm,
} from '@/services/infraApi';
import {
  cardStyle,
  cellStyle,
  findPanelError,
  fmtHours,
  fmtRelative,
  fmtTime,
  inputStyle,
  isFutureIso,
  mutedText,
  secondaryButtonClass,
  secondaryButtonStyle,
  dangerButtonStyle,
} from './infraShared';

const LABELS = { annovar: 'ANNOVAR', exomiser: 'Exomiser', module1: 'Module-1', pgx: 'PGx' };

const DURATIONS = [0.25, 0.5, 1, 2, 4, 8, 12, 24];

/**
 * Stop accepting new submissions for a pipeline for a while. Running jobs are untouched; new
 * submits get a 503 INTAKE_PAUSED with a user-facing message.
 */
function IntakeRow({ kind, entry, hoursMax, blocked, onRequest }) {
  const [hours, setHours] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const label = LABELS[kind];
  const paused = Boolean(entry && isFutureIso(entry.paused_until));
  const disabled = Boolean(blocked);

  const pause = () => {
    const err = validateIntakeForm({ hours, reason }, { hoursMax });
    setError(err);
    if (err) return;
    const h = Number(hours);
    const why = reason.trim();
    onRequest({
      title: `Pause ${label} intake for ${fmtHours(h)}`,
      danger: true,
      rows: [
        { label: 'Intake', before: paused ? `paused until ${fmtTime(entry.paused_until)}` : 'open', after: `paused for ${fmtHours(h)}` },
        { label: 'Reason', before: '', after: why },
      ],
      note: 'New submissions get a "temporarily paused for maintenance" message. Running jobs are not touched.',
      run: () => adminPauseIntake(kind, { hours: h, reason: why }),
      merge: (response) => ({ kind: 'intake', intakeKind: kind, response, paused: true }),
      successText: `${label} intake paused for ${fmtHours(h)}.`,
      onSuccess: () => setReason(''),
    });
  };

  const resume = () => {
    onRequest({
      title: `Resume ${label} intake`,
      rows: [{ label: 'Intake', before: `paused until ${fmtTime(entry.paused_until)}`, after: 'open' }],
      run: () => adminResumeIntake(kind),
      merge: (response) => ({ kind: 'intake', intakeKind: kind, response, paused: false }),
      successText: `${label} intake resumed.`,
    });
  };

  return (
    <tr className="text-xs align-middle">
      <td className="px-3 py-2 border-b font-medium" style={{ ...cellStyle, color: 'var(--text-primary)' }}>{label}</td>
      <td className="px-3 py-2 border-b" style={cellStyle}>
        {paused ? (
          <div>
            <span className="font-semibold" style={{ color: 'var(--error)' }}>Paused</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {' '}until {fmtTime(entry.paused_until)} ({fmtRelative(entry.paused_until)})
            </span>
            <div className="text-2xs" style={mutedText}>
              by {entry.by || '—'}{entry.reason ? ` — ${entry.reason}` : ''}
            </div>
          </div>
        ) : (
          <span style={{ color: 'var(--success)' }}>Open</span>
        )}
      </td>
      <td className="px-3 py-2 border-b" style={cellStyle}>
        {paused ? (
          <button type="button" disabled={disabled} onClick={resume} className={secondaryButtonClass} style={secondaryButtonStyle}>
            Resume
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={hours}
              disabled={disabled}
              onChange={(e) => setHours(e.target.value)}
              className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50"
              style={inputStyle}
            >
              {DURATIONS.filter((d) => d >= INTAKE_HOURS_MIN && d <= hoursMax).map((d) => (
                <option key={d} value={String(d)}>{fmtHours(d)}</option>
              ))}
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={disabled}
              placeholder="Reason (required)"
              className="flex-1 min-w-[120px] px-2 py-1 text-2xs rounded-md border disabled:opacity-50"
              style={inputStyle}
            />
            <button type="button" disabled={disabled} onClick={pause} className={secondaryButtonClass} style={dangerButtonStyle}>
              Pause
            </button>
          </div>
        )}
        {error && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
      </td>
    </tr>
  );
}

export default function IntakePanel({ intake, errors, bounds, blockedReason, onRequest }) {
  const hoursMax = Number(bounds?.intake_pause_hours_max) || 24;
  return (
    <div className="rounded-xl border overflow-x-auto" style={cardStyle}>
      <table className="w-full text-left" style={{ minWidth: '620px' }}>
        <thead>
          <tr className="text-2xs" style={mutedText}>
            <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Pipeline</th>
            <th className="px-3 py-2 font-medium border-b" style={cellStyle}>State</th>
            <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Lever</th>
          </tr>
        </thead>
        <tbody>
          {INTAKE_KINDS.map((kind) => {
            const panelError = findPanelError(errors, ['intake', `intake.${kind}`]);
            const blocked = blockedReason || panelError || (intake ? null : 'no intake data');
            return (
              <IntakeRow
                key={kind}
                kind={kind}
                entry={intake?.[kind] || null}
                hoursMax={hoursMax}
                blocked={blocked}
                onRequest={onRequest}
              />
            );
          })}
        </tbody>
      </table>
      {(blockedReason || findPanelError(errors, ['intake']) || !intake) && (
        <p className="text-2xs px-3 py-2" style={{ color: 'var(--warning)' }}>
          Status unavailable{findPanelError(errors, ['intake']) ? ` — ${findPanelError(errors, ['intake'])}` : ''}. Intake levers are disabled.
        </p>
      )}
    </div>
  );
}
