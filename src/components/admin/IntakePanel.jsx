import { useState } from 'react';
import {
  adminPauseIntake,
  adminResumeIntake,
  INTAKE_HOURS_MIN,
  INTAKE_KINDS,
  validateIntakeForm,
} from '@/services/infraApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Banner, StatusChip, inputCls, DANGER_BTN } from './adminUi';
import AdminSelect from './AdminSelect';
import {
  ChangeLine,
  Field,
  findPanelError,
  fmtHours,
  fmtRelative,
  fmtTime,
  isFutureIso,
} from './infraShared';

const LABELS = { annovar: 'ANNOVAR', exomiser: 'Exomiser', module1: 'Module-1', pgx: 'PGx' };

const DURATIONS = [0.25, 0.5, 1, 2, 4, 8, 12, 24];

/**
 * Stop accepting new submissions for a pipeline for a while. Running jobs are untouched; new
 * submits get a 503 INTAKE_PAUSED with a user-facing message. One compact card per pipeline:
 * its state as a word, and the one action that fits that state.
 */
function IntakeCard({ kind, entry, hoursMax, blocked, onRequest }) {
  const [hours, setHours] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
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
      confirmLabel: `Pause ${label} intake`,
      danger: true,
      rows: [
        { label: 'Intake', before: paused ? `paused until ${fmtTime(entry.paused_until)}` : 'open', after: `paused for ${fmtHours(h)}` },
        { label: 'Reason', before: '', after: why },
      ],
      note: 'New submissions get a "temporarily paused for maintenance" message. Running jobs are not touched.',
      undo: { undoable: true, text: 'Resume intake from this card at any time; otherwise it reopens by itself at the end time.' },
      run: () => adminPauseIntake(kind, { hours: h, reason: why }),
      merge: (response) => ({ kind: 'intake', intakeKind: kind, response, paused: true }),
      successText: `${label} intake paused for ${fmtHours(h)}.`,
      onSuccess: () => { setReason(''); setFormOpen(false); },
    });
  };

  const resume = () => {
    onRequest({
      title: `Resume ${label} intake`,
      confirmLabel: 'Resume intake',
      rows: [{ label: 'Intake', before: `paused until ${fmtTime(entry.paused_until)}`, after: 'open' }],
      undo: { undoable: true, text: 'Pause it again from this card if you need to.' },
      run: () => adminResumeIntake(kind),
      merge: (response) => ({ kind: 'intake', intakeKind: kind, response, paused: false }),
      successText: `${label} intake resumed.`,
    });
  };

  return (
    <div className={cn('wb-card flex flex-col gap-2 p-3.5', paused && '!border-[var(--warning)]')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-foreground">{label}</h3>
        <StatusChip tone={paused ? 'warning' : 'success'}>{paused ? 'Paused' : 'Open'}</StatusChip>
      </div>

      {paused ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            Until <span className="tabular-nums text-foreground">{fmtTime(entry.paused_until)}</span> ({fmtRelative(entry.paused_until)})
          </p>
          <ChangeLine by={entry.by} reason={entry.reason} />
          <div className="mt-auto pt-1">
            <Button variant="outline" size="sm" disabled={disabled} onClick={resume} className="max-md:h-10">Resume intake…</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">Accepting new submissions.</p>
          {formOpen ? (
            <div className="flex flex-col gap-2">
              <Field label="Pause for">
                <AdminSelect
                  value={hours}
                  disabled={disabled}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full max-md:h-10"
                >
                  {DURATIONS.filter((d) => d >= INTAKE_HOURS_MIN && d <= hoursMax).map((d) => (
                    <option key={d} value={String(d)}>{fmtHours(d)}</option>
                  ))}
                </AdminSelect>
              </Field>
              <Field label="Reason" hint="required">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={disabled}
                  className={cn(inputCls, 'w-full max-md:h-10')}
                />
              </Field>
              {error && <p role="alert" className="text-xs text-[var(--error)]">{error}</p>}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={pause}
                  className={cn(DANGER_BTN, 'max-md:h-10')}
                >
                  Pause…
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setFormOpen(false); setError(null); }} className="max-md:h-10">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-1">
              <Button variant="outline" size="sm" disabled={disabled} onClick={() => setFormOpen(true)} className="max-md:h-10">Pause intake…</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function IntakePanel({ intake, errors, bounds, blockedReason, onRequest }) {
  const hoursMax = Number(bounds?.intake_pause_hours_max) || 24;
  const intakeError = findPanelError(errors, ['intake']);
  return (
    <div className="space-y-3">
      {(blockedReason || intakeError || !intake) && (
        <Banner tone="warning">
          Status unavailable{intakeError ? `: ${intakeError}` : ''}. Intake controls are disabled.
        </Banner>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INTAKE_KINDS.map((kind) => {
          const panelError = findPanelError(errors, ['intake', `intake.${kind}`]);
          const blocked = blockedReason || panelError || (intake ? null : 'no intake data');
          return (
            <IntakeCard
              key={kind}
              kind={kind}
              entry={intake?.[kind] || null}
              hoursMax={hoursMax}
              blocked={blocked}
              onRequest={onRequest}
            />
          );
        })}
      </div>
    </div>
  );
}
