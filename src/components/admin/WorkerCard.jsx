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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HelpBody, HelpPopover, Panel, StatusChip, inputCls } from './adminUi';
import {
  ChangeLine,
  Field,
  Lever,
  fmtHours,
  fmtRelative,
  fmtTime,
  isFutureIso,
  Stat,
  Stepper,
  Unavailable,
} from './infraShared';
import { floorHelp, maxRaiseHelp, SCALE_IN_HELP, SECTION_HELP } from './infraHelp';

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

/** Current state of an active floor / raise, with the one-click way out. */
function ActiveState({ tone, title, detail, action }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-2">
      <div className="min-w-0 text-xs">
        <StatusChip tone={tone}>{title}</StatusChip>
        <span className="ml-2 text-muted-foreground">{detail}</span>
      </div>
      {action}
    </div>
  );
}

/**
 * One worker fleet (ANNOVAR or Exomiser): live counts plus three levers — a temporary floor
 * ("keep N running"), a temporary max raise ("allow up to M"), and scale-in-now.
 *
 * Drafts are `null` until the admin edits them, and until then show a suggestion derived from
 * the live status. That way the 30 s poll never overwrites a half-typed form.
 * `lastChange` (optional) is the newest matching audit row, for the "last changed" line.
 */
export default function WorkerCard({ kind, worker, bounds, blockedReason, onRequest, lastChange }) {
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
      confirmLabel: 'Set floor',
      rows: [
        { label: 'Floor', before: floorActive ? floor.floor : 'none', after: n },
        { label: 'Desired', before: desired ?? '–', after: desired === null ? `max(current, ${n})` : Math.max(desired, n) },
        { label: 'Until', before: floorActive ? fmtTime(floor.until) : '–', after: `now + ${fmtHours(h)}` },
        { label: 'Reason', before: '', after: reason },
      ],
      note: costNote(kind),
      undo: { undoable: true, text: 'Clear the floor from this card at any time; otherwise it ends by itself at the end time.' },
      run: () => adminSetWorkerFloor(kind, { floor: n, hours: h, reason }),
      merge: mergeInto,
      successText: `${meta.label} floor set to ${n} for ${fmtHours(h)}.`,
      onSuccess: () => { setFloorReason(''); setFloorDraft(null); },
    });
  };

  const clearFloor = () => {
    onRequest({
      title: `${meta.label}: clear the worker floor`,
      confirmLabel: 'Clear floor',
      rows: [{ label: 'Floor', before: `${floor.floor} until ${fmtTime(floor.until)}`, after: 'none' }],
      note: 'The scale-in Lambda goes back to sizing on the queue alone.',
      undo: { undoable: true, text: 'Set a new floor from this card if you need the workers back.' },
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
      confirmLabel: 'Raise max',
      rows: [
        { label: 'ASG max', before: asg?.max ?? '–', after: m },
        { label: 'Until', before: raiseActive ? fmtTime(raise.until) : '–', after: `now + ${fmtHours(h)}` },
        { label: 'Reverts to', before: '', after: maxDefault },
        { label: 'Reason', before: '', after: reason },
      ],
      note: `${costNote(kind)} The max reverts to ${maxDefault} after expiry, once desired is back at or below it (busy workers are never terminated to lower it).`,
      undo: { undoable: true, text: 'End the raise early from this card; otherwise it reverts by itself at the end time.' },
      run: () => adminRaiseWorkerMax(kind, { max: m, hours: h, reason }),
      merge: mergeInto,
      successText: `${meta.label} max raised to ${m} for ${fmtHours(h)}.`,
      onSuccess: () => { setMaxReason(''); setMaxDraft(null); },
    });
  };

  const endRaise = () => {
    onRequest({
      title: `${meta.label}: end the max raise early`,
      confirmLabel: 'End raise',
      rows: [{ label: 'ASG max', before: `${raise.max} until ${fmtTime(raise.until)}`, after: `${maxDefault ?? 'default'} (once desired ≤ default)` }],
      note: 'The Lambda lowers the max only when the group is back at or below the default; until then it shows "reverting…".',
      undo: { undoable: true, text: 'Raise the max again from this card if you still need the headroom.' },
      run: () => adminEndWorkerMaxRaise(kind),
      merge: mergeInto,
      successText: `${meta.label} max raise ending — the Lambda reverts it within a minute or two.`,
    });
  };

  const scaleIn = () => {
    onRequest({
      title: `${meta.label}: scale in now`,
      confirmLabel: 'Scale in now',
      danger: true,
      askReason: true,
      rows: [
        { label: 'Desired', before: asg?.desired ?? '–', after: asg?.min ?? 'min' },
        { label: 'Floor', before: floorActive ? floor.floor : 'none', after: 'none' },
        { label: 'Queue', before: `${queueTotal} (visible + in flight)`, after: '' },
      ],
      note: 'Server re-checks the queue and refuses (409) if anything arrived meanwhile. Running workers are terminated.',
      undo: { undoable: false, text: 'Stopped workers are gone, but new ones start by themselves when jobs arrive.' },
      run: (reason) => adminScaleInNow(kind, { reason }),
      merge: mergeInto,
      successText: `${meta.label} scaled in to min.`,
    });
  };

  const activities = Array.isArray(worker?.activities) ? worker.activities.slice(0, 5) : [];

  // One word for the card header: what the fleet is doing right now.
  let chip = { tone: 'muted', text: 'No data' };
  if (worker) {
    const inService = num(asg?.in_service) ?? 0;
    const waiting = num(queue?.visible) ?? 0;
    if (waiting > 0 && inService === 0) chip = { tone: 'warning', text: 'Queue waiting, no workers' };
    else if (inService > 0) chip = { tone: 'success', text: `${inService} running` };
    else chip = { tone: 'muted', text: 'Idle' };
  }

  const changeBy = lastChange?.actor || (raiseActive ? raise?.by : floorActive ? floor?.by : null);
  const changeAt = lastChange?.at || null;

  return (
    <Panel
      title={`${meta.label} workers`}
      badge={<StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
      help={(
        <HelpPopover title={`${meta.label} workers`} align="start">
          <HelpBody what={SECTION_HELP.workers.what} items={SECTION_HELP.workers.items} />
        </HelpPopover>
      )}
      className="flex flex-col"
      bodyClassName="flex flex-col gap-3"
    >
      {blocked && <Unavailable reason={blocked} />}

      {worker && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Stat label="Queue waiting" value={queue?.visible ?? '–'} sub={`${queue?.in_flight ?? '–'} in flight`} />
          <Stat label="In service" value={asg ? asg.in_service : '–'} sub={asg ? `${asg.pending} pending` : undefined} />
          <Stat label="ASG min / desired / max" value={asg ? `${asg.min} / ${asg.desired} / ${asg.max}` : '–'} />
          <Stat label="Warm pool ready" value={warm ? warm.warmed : '–'} sub={warm ? `${warm.warming} warming` : undefined} />
          <Stat label="Ledger outstanding" value={worker.ledger_outstanding ?? '–'} />
        </div>
      )}

      <ChangeLine by={changeBy} at={changeAt} reason={lastChange?.reason} />

      {/* Lever 1: temporary floor */}
      <Lever title="Keep N workers running for H hours" help={floorHelp(meta)}>
        {worker && (floorActive ? (
          <ActiveState
            tone="info"
            title={`Floor ${floor.floor}`}
            detail={`until ${fmtTime(floor.until)} (${fmtRelative(floor.until)}) by ${floor.by || '–'}${floor.reason ? `: ${floor.reason}` : ''}`}
            action={<Button variant="outline" size="sm" disabled={Boolean(blocked)} onClick={clearFloor}>Clear floor…</Button>}
          />
        ) : (
          <p className="mb-2 text-2xs text-muted-foreground">
            No floor{floor?.until ? ` (last one expired ${fmtRelative(floor.until)})` : ''}.
          </p>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Workers" hint={`0–${floorMax ?? '?'}`}>
            <Stepper label="Workers" value={floorValue} onChange={setFloorDraft} min={0} max={floorMax ?? 0} disabled={Boolean(floorBlocked)} />
          </Field>
          <Field label="Hours" hint={`${FLOOR_HOURS_MIN}–${floorHoursMax}`}>
            <Stepper label="Hours" value={floorHours} onChange={setFloorHours} min={FLOOR_HOURS_MIN} max={floorHoursMax} step={0.5} disabled={Boolean(floorBlocked)} />
          </Field>
          <Field label="Reason" hint="required" className="min-w-[140px] flex-1">
            <input value={floorReason} onChange={(e) => setFloorReason(e.target.value)} disabled={Boolean(floorBlocked)} className={cn(inputCls, 'w-full max-md:h-10')} />
          </Field>
          <Button variant="outline" disabled={Boolean(floorBlocked)} onClick={submitFloor} className="max-md:h-10">Set floor…</Button>
        </div>
        {floorError && <p role="alert" className="mt-1 text-2xs text-[var(--error)]">{floorError}</p>}
      </Lever>

      {/* Lever 2: temporary max raise */}
      <Lever title="Allow up to M workers for H hours" help={maxRaiseHelp(meta, maxDefault, maxCeiling)}>
        {worker && (raiseActive ? (
          <ActiveState
            tone="warning"
            title={`Max raised to ${raise.max}`}
            detail={`until ${fmtTime(raise.until)} (${fmtRelative(raise.until)}) by ${raise.by || '–'}${raise.reason ? `: ${raise.reason}` : ''}${raise.reverting ? ' · reverting…' : ''}`}
            action={!raise.reverting && (
              <Button variant="outline" size="sm" disabled={Boolean(blocked)} onClick={endRaise}>End early…</Button>
            )}
          />
        ) : (
          <p className="mb-2 text-2xs text-muted-foreground">
            Max at default{maxDefault !== null ? ` (${maxDefault}` : ''}
            {maxCeiling !== null ? `, ceiling ${maxCeiling})` : maxDefault !== null ? ')' : ''}.
          </p>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Max" hint={`${maxDefault ?? '?'}–${maxCeiling ?? '?'}`}>
            <Stepper label="Max" value={maxValue} onChange={setMaxDraft} min={maxDefault ?? 0} max={maxCeiling ?? 0} disabled={Boolean(maxBlocked)} />
          </Field>
          <Field label="Hours" hint={`${MAX_RAISE_HOURS_MIN}–${raiseHoursMax}`}>
            <Stepper label="Hours" value={maxHours} onChange={setMaxHours} min={MAX_RAISE_HOURS_MIN} max={raiseHoursMax} step={0.5} disabled={Boolean(maxBlocked)} />
          </Field>
          <Field label="Reason" hint="required" className="min-w-[140px] flex-1">
            <input value={maxReason} onChange={(e) => setMaxReason(e.target.value)} disabled={Boolean(maxBlocked)} className={cn(inputCls, 'w-full max-md:h-10')} />
          </Field>
          <Button variant="outline" disabled={Boolean(maxBlocked)} onClick={submitMax} className="max-md:h-10">Raise max…</Button>
        </div>
        {maxError && <p role="alert" className="mt-1 text-2xs text-[var(--error)]">{maxError}</p>}
      </Lever>

      {/* Lever 3: scale in now */}
      <Lever title="Scale in now" help={SCALE_IN_HELP}>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!scaleInEnabled}
            onClick={scaleIn}
            className="border-[var(--error)] text-[var(--error)] hover:bg-[var(--error-soft)] hover:text-[var(--error)] max-md:h-10"
          >
            Scale in now…
          </Button>
          <span className="text-2xs text-muted-foreground">
            {scaleInEnabled
              ? 'Queue is empty: sets desired to min and clears any floor.'
              : 'Available only when the queue (waiting + in flight) is 0.'}
          </span>
        </div>
      </Lever>

      {worker && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55">
            Recent scaling activity
          </summary>
          <div className="mt-2 space-y-3">
            {activities.length === 0 ? (
              <p className="text-2xs text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-1 text-2xs">
                {activities.map((a, i) => (
                  <li key={`${a.time}-${i}`} className="text-muted-foreground">
                    <span className="tabular-nums">{fmtTime(a.time)}</span>{' '}
                    <span className={a.status === 'Successful' ? 'text-foreground' : 'text-[var(--warning)]'}>{a.status}</span>
                    {': '}{a.description}
                  </li>
                ))}
              </ul>
            )}
            <div>
              <div className="mb-1 text-2xs font-medium text-foreground">Scale-in Lambda, last decision</div>
              {worker.lambda_last ? (
                <div className="text-2xs text-muted-foreground">
                  <span className="tabular-nums">{fmtTime(worker.lambda_last.time)} </span>
                  <code className="break-all font-mono">{worker.lambda_last.line}</code>
                </div>
              ) : (
                <p className="text-2xs text-muted-foreground">Nothing recorded yet.</p>
              )}
            </div>
          </div>
        </details>
      )}
    </Panel>
  );
}
