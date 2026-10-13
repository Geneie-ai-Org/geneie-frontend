import { useState } from 'react';
import {
  adminClearWorkerFloor,
  adminEndWorkerMaxRaise,
  adminRaiseWorkerMax,
  adminScaleInNow,
  adminSetWorkerFloor,
  FLOOR_HOURS_MIN,
  MAX_RAISE_HOURS_MIN,
  validateFloorForm,
  validateMaxRaiseForm,
} from '@/services/infraApi';
import {
  cardStyle,
  dangerButtonStyle,
  fmtHours,
  fmtRelative,
  fmtTime,
  inputStyle,
  isFutureIso,
  mutedText,
  primaryButtonClass,
  primaryButtonStyle,
  secondaryButtonClass,
  secondaryButtonStyle,
  Stat,
  Stepper,
  Unavailable,
  Help,
} from './infraShared';
import { floorHelp, maxRaiseHelp, SCALE_IN_HELP } from './infraHelp';

/** Display name, rough on-demand cost and cold-start time per worker kind (shown in confirms). */
export const WORKER_META = {
  annovar: { label: 'ANNOVAR', costPerHour: '$0.75', coldStartMin: 8, coldStartWhy: 'reference data copy' },
  exomiser: { label: 'Exomiser', costPerHour: '$1', coldStartMin: 3 },
};

function costNote(kind) {
  const meta = WORKER_META[kind];
  return `Each extra running ${meta.label} worker ≈ ${meta.costPerHour}/hour. A worker beyond the warm pool needs ~${meta.coldStartMin} min before it takes jobs.`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * One worker fleet (ANNOVAR or Exomiser): live counts plus three levers — a temporary floor
 * ("keep N running"), a temporary max raise ("allow up to M"), and scale-in-now.
 *
 * Drafts are `null` until the admin edits them, and until then show a suggestion derived from
 * the live status. That way the 30 s poll never overwrites a half-typed form.
 */
export default function WorkerCard({ kind, worker, bounds, blockedReason, onRequest }) {
  const meta = WORKER_META[kind];
  const floorMax = num(bounds?.[`${kind}_floor_max`]);
  const floorHoursMax = num(bounds?.floor_hours_max) ?? 8;
  const maxDefault = num(bounds?.[`${kind}_max_default`]);
  const maxCeiling = num(bounds?.[`${kind}_max_ceiling`]);
  const raiseHoursMax = num(bounds?.max_raise_hours_max) ?? 24;

  const [floorDraft, setFloorDraft] = useState(null);
  const [floorHours, setFloorHours] = useState('2');
  const [floorReason, setFloorReason] = useState('');
  const [floorError, setFloorError] = useState(null);

  const [maxDraft, setMaxDraft] = useState(null);
  const [maxHours, setMaxHours] = useState('4');
  const [maxReason, setMaxReason] = useState('');
  const [maxError, setMaxError] = useState(null);

  const queue = worker?.queue || null;
  const asg = worker?.asg || null;
  const warm = worker?.warm_pool || null;
  const floor = worker?.floor || null;
  const raise = worker?.max_raise || null;
  const floorActive = Boolean(floor && isFutureIso(floor.until));
  const raiseActive = Boolean(raise && (isFutureIso(raise.until) || raise.reverting));

  const blocked = blockedReason || (!worker ? 'no data for this worker' : null);
  const floorBlocked = blocked || (floorMax === null ? 'floor bounds missing' : null);
  const maxBlocked = blocked || (maxDefault === null || maxCeiling === null ? 'max bounds missing' : null);
  const queueTotal = queue ? (num(queue.visible) ?? 0) + (num(queue.in_flight) ?? 0) : null;
  const scaleInEnabled = !blocked && queue !== null && queueTotal === 0;

  const floorValue = floorDraft ?? String(floorActive ? floor.floor : Math.min(1, floorMax ?? 1));
  const maxValue = maxDraft ?? String(
    raiseActive && num(raise.max) !== null
      ? raise.max
      : maxDefault !== null ? Math.min((maxCeiling ?? maxDefault), maxDefault + 1) : '',
  );

  const mergeInto = (response) => ({ kind: 'worker', workerKind: kind, response });

  const submitFloor = () => {
    const err = validateFloorForm(
      { floor: floorValue, hours: floorHours, reason: floorReason },
      { floorMax, hoursMax: floorHoursMax },
    );
    setFloorError(err);
    if (err) return;
    const n = Number(floorValue);
    const h = Number(floorHours);
    const reason = floorReason.trim();
    const desired = num(asg?.desired);
    onRequest({
      title: `${meta.label}: keep ${n} worker${n === 1 ? '' : 's'} running for ${fmtHours(h)}`,
      rows: [
        { label: 'Floor', before: floorActive ? floor.floor : 'none', after: n },
        { label: 'Desired', before: desired ?? '—', after: desired === null ? `max(current, ${n})` : Math.max(desired, n) },
        { label: 'Until', before: floorActive ? fmtTime(floor.until) : '—', after: `now + ${fmtHours(h)}` },
        { label: 'Reason', before: '', after: reason },
      ],
      note: costNote(kind),
      run: () => adminSetWorkerFloor(kind, { floor: n, hours: h, reason }),
      merge: mergeInto,
      successText: `${meta.label} floor set to ${n} for ${fmtHours(h)}.`,
      onSuccess: () => { setFloorReason(''); setFloorDraft(null); },
    });
  };

  const clearFloor = () => {
    onRequest({
      title: `${meta.label}: clear the worker floor`,
      rows: [{ label: 'Floor', before: `${floor.floor} until ${fmtTime(floor.until)}`, after: 'none' }],
      note: 'The scale-in Lambda goes back to sizing on the queue alone.',
      run: () => adminClearWorkerFloor(kind),
      merge: mergeInto,
      successText: `${meta.label} floor cleared.`,
    });
  };

  const submitMax = () => {
    const err = validateMaxRaiseForm(
      { max: maxValue, hours: maxHours, reason: maxReason },
      { maxDefault, maxCeiling, hoursMax: raiseHoursMax },
    );
    setMaxError(err);
    if (err) return;
    const m = Number(maxValue);
    const h = Number(maxHours);
    const reason = maxReason.trim();
    onRequest({
      title: `${meta.label}: allow up to ${m} workers for ${fmtHours(h)}`,
      rows: [
        { label: 'ASG max', before: asg?.max ?? '—', after: m },
        { label: 'Until', before: raiseActive ? fmtTime(raise.until) : '—', after: `now + ${fmtHours(h)}` },
        { label: 'Reverts to', before: '', after: maxDefault },
        { label: 'Reason', before: '', after: reason },
      ],
      note: `${costNote(kind)} The max reverts to ${maxDefault} after expiry, once desired is back at or below it (busy workers are never terminated to lower it).`,
      run: () => adminRaiseWorkerMax(kind, { max: m, hours: h, reason }),
      merge: mergeInto,
      successText: `${meta.label} max raised to ${m} for ${fmtHours(h)}.`,
      onSuccess: () => { setMaxReason(''); setMaxDraft(null); },
    });
  };

  const endRaise = () => {
    onRequest({
      title: `${meta.label}: end the max raise early`,
      rows: [{ label: 'ASG max', before: `${raise.max} until ${fmtTime(raise.until)}`, after: `${maxDefault ?? 'default'} (once desired ≤ default)` }],
      note: 'The Lambda lowers the max only when the group is back at or below the default; until then it shows "reverting…".',
      run: () => adminEndWorkerMaxRaise(kind),
      merge: mergeInto,
      successText: `${meta.label} max raise ending — the Lambda reverts it within a minute or two.`,
    });
  };

  const scaleIn = () => {
    onRequest({
      title: `${meta.label}: scale in now`,
      danger: true,
      askReason: true,
      rows: [
        { label: 'Desired', before: asg?.desired ?? '—', after: asg?.min ?? 'min' },
        { label: 'Floor', before: floorActive ? floor.floor : 'none', after: 'none' },
        { label: 'Queue', before: `${queueTotal} (visible + in flight)`, after: '' },
      ],
      note: 'Server re-checks the queue and refuses (409) if anything arrived meanwhile. Running workers are terminated.',
      run: (reason) => adminScaleInNow(kind, { reason }),
      merge: mergeInto,
      successText: `${meta.label} scaled in to min.`,
    });
  };

  const activities = Array.isArray(worker?.activities) ? worker.activities.slice(0, 5) : [];

  return (
    <div className="rounded-xl border p-4" style={cardStyle}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{meta.label}</h3>

      {blocked && <div className="mb-3"><Unavailable reason={blocked} /></div>}

      {worker && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat label="Queue visible" value={queue?.visible ?? '—'} />
            <Stat label="In flight" value={queue?.in_flight ?? '—'} />
            <Stat label="Ledger outstanding" value={worker.ledger_outstanding ?? '—'} />
            <Stat label="ASG min / desired / max" value={asg ? `${asg.min} / ${asg.desired} / ${asg.max}` : '—'} />
            <Stat label="In service / pending" value={asg ? `${asg.in_service} / ${asg.pending}` : '—'} />
            <Stat label="Warm pool warmed / warming" value={warm ? `${warm.warmed} / ${warm.warming}` : '—'} />
          </div>

          {floorActive ? (
            <div className="text-2xs mb-2 flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span>
                <span className="font-semibold" style={{ color: 'var(--accent-teal)' }}>Floor {floor.floor}</span>
                {' '}until {fmtTime(floor.until)} ({fmtRelative(floor.until)}) by {floor.by || '—'}
                {floor.reason ? ` — ${floor.reason}` : ''}
              </span>
              <button type="button" disabled={Boolean(blocked)} onClick={clearFloor} className={secondaryButtonClass} style={secondaryButtonStyle}>
                Clear
              </button>
            </div>
          ) : (
            <p className="text-2xs mb-2" style={mutedText}>
              No floor{floor?.until ? ` (last one expired ${fmtRelative(floor.until)})` : ''}.
            </p>
          )}

          {raiseActive ? (
            <div className="text-2xs mb-2 flex flex-wrap items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
              <span>
                <span className="font-semibold" style={{ color: 'var(--warning)' }}>Max raised to {raise.max}</span>
                {' '}until {fmtTime(raise.until)} ({fmtRelative(raise.until)}) by {raise.by || '—'}
                {raise.reason ? ` — ${raise.reason}` : ''}
                {raise.reverting ? ' · reverting…' : ''}
              </span>
              {!raise.reverting && (
                <button type="button" disabled={Boolean(blocked)} onClick={endRaise} className={secondaryButtonClass} style={secondaryButtonStyle}>
                  End early
                </button>
              )}
            </div>
          ) : (
            <p className="text-2xs mb-2" style={mutedText}>
              Max at default{maxDefault !== null ? ` (${maxDefault}` : ''}
              {maxCeiling !== null ? `, ceiling ${maxCeiling})` : maxDefault !== null ? ')' : ''}.
            </p>
          )}
        </>
      )}

      {/* Lever 1: temporary floor */}
      <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-2xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Keep N workers running for H hours</div>
        <Help {...floorHelp(meta)} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs" style={mutedText}>Workers (0–{floorMax ?? '?'})</span>
            <Stepper value={floorValue} onChange={setFloorDraft} min={0} max={floorMax ?? 0} disabled={Boolean(floorBlocked)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs" style={mutedText}>Hours ({FLOOR_HOURS_MIN}–{floorHoursMax})</span>
            <Stepper value={floorHours} onChange={setFloorHours} min={FLOOR_HOURS_MIN} max={floorHoursMax} step={0.5} disabled={Boolean(floorBlocked)} />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <span className="text-2xs" style={mutedText}>Reason (required)</span>
            <input
              value={floorReason}
              onChange={(e) => setFloorReason(e.target.value)}
              disabled={Boolean(floorBlocked)}
              className="px-2 py-1 text-xs rounded-md border disabled:opacity-50"
              style={inputStyle}
            />
          </label>
          <button type="button" disabled={Boolean(floorBlocked)} onClick={submitFloor} className={primaryButtonClass} style={primaryButtonStyle}>
            Set floor
          </button>
        </div>
        {floorError && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{floorError}</p>}
      </div>

      {/* Lever 2: temporary max raise */}
      <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-2xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Allow up to M workers for H hours</div>
        <Help {...maxRaiseHelp(meta, maxDefault, maxCeiling)} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs" style={mutedText}>Max ({maxDefault ?? '?'}–{maxCeiling ?? '?'})</span>
            <Stepper value={maxValue} onChange={setMaxDraft} min={maxDefault ?? 0} max={maxCeiling ?? 0} disabled={Boolean(maxBlocked)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs" style={mutedText}>Hours ({MAX_RAISE_HOURS_MIN}–{raiseHoursMax})</span>
            <Stepper value={maxHours} onChange={setMaxHours} min={MAX_RAISE_HOURS_MIN} max={raiseHoursMax} step={0.5} disabled={Boolean(maxBlocked)} />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <span className="text-2xs" style={mutedText}>Reason (required)</span>
            <input
              value={maxReason}
              onChange={(e) => setMaxReason(e.target.value)}
              disabled={Boolean(maxBlocked)}
              className="px-2 py-1 text-xs rounded-md border disabled:opacity-50"
              style={inputStyle}
            />
          </label>
          <button type="button" disabled={Boolean(maxBlocked)} onClick={submitMax} className={primaryButtonClass} style={primaryButtonStyle}>
            Raise max
          </button>
        </div>
        {maxError && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{maxError}</p>}
      </div>

      {/* Lever 3: scale in now */}
      <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <Help {...SCALE_IN_HELP} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!scaleInEnabled} onClick={scaleIn} className={secondaryButtonClass} style={dangerButtonStyle}>
            Scale in now
          </button>
          <span className="text-2xs" style={mutedText}>
            {scaleInEnabled
              ? 'Queue is empty — sets desired to min and clears any floor.'
              : 'Enabled only when the queue (visible + in flight) is 0.'}
          </span>
        </div>
      </div>

      {worker && (
        <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-2xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Last scaling activities</div>
          {activities.length === 0 ? (
            <p className="text-2xs" style={mutedText}>None.</p>
          ) : (
            <ul className="text-2xs space-y-1">
              {activities.map((a, i) => (
                <li key={`${a.time}-${i}`} style={{ color: 'var(--text-secondary)' }}>
                  <span style={mutedText}>{fmtTime(a.time)}</span>{' '}
                  <span style={{ color: a.status === 'Successful' ? 'var(--text-secondary)' : 'var(--warning)' }}>{a.status}</span>
                  {' — '}{a.description}
                </li>
              ))}
            </ul>
          )}

          <div className="text-2xs font-medium mt-3 mb-1" style={{ color: 'var(--text-secondary)' }}>Scale-in Lambda, last decision</div>
          {worker.lambda_last ? (
            <div className="text-2xs">
              <span style={mutedText}>{fmtTime(worker.lambda_last.time)} </span>
              <code className="break-all" style={{ color: 'var(--text-secondary)' }}>{worker.lambda_last.line}</code>
            </div>
          ) : (
            <p className="text-2xs" style={mutedText}>Nothing recorded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
