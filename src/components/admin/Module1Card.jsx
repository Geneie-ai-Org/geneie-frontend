import { useState } from 'react';
import {
  adminResetConfig,
  adminSetConfig,
  adminSetModule1Cap,
  MODULE1_CAP_HOURS_MAX,
  MODULE1_CAP_HOURS_MIN,
  MODULE1_KEYS,
  validateInstanceTypes,
  validateModule1CapForm,
} from '@/services/infraApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HelpBody, HelpPopover, Panel, StatusChip, inputCls, selectCls, toneText } from './adminUi';
import {
  ChangeLine,
  Field,
  Lever,
  fmtAge,
  fmtHours,
  fmtRelative,
  fmtTime,
  isFutureIso,
  Stat,
  Stepper,
  Unavailable,
} from './infraShared';
import { capHelp, INSTANCE_TYPES_HELP, SECTION_HELP, SUBNETS_HELP } from './infraHelp';

/** A raise above the recorded default reverts after this many hours unless the admin says otherwise. */
const DEFAULT_RAISE_REVERT_HOURS = 4;

function num(v) {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
}

function parseTypes(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * One lane cap (GPU or CPU). Goes through POST /api/admin/infra/module1/cap with an optional
 * expiry: a raise above the recorded default suggests "revert after 4 h", anything else
 * suggests permanent. Both suggestions hold until the admin touches the checkbox.
 */
function CapLever({ lane, label, lanePanel, currentCap, defaultCap, range, blocked, onRequest }) {
  const configKey = lane === 'gpu' ? MODULE1_KEYS.gpuCap : MODULE1_KEYS.cpuCap;
  const [capDraft, setCapDraft] = useState(null);
  const [expiryDraft, setExpiryDraft] = useState(null); // null = follow the suggestion
  const [hours, setHours] = useState(String(DEFAULT_RAISE_REVERT_HOURS));
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const capValue = capDraft ?? (currentCap !== null ? String(currentCap) : '');
  const capNum = num(capValue);
  // Without a known default, treat "higher than what is running now" as the raise.
  const baseline = defaultCap ?? currentCap;
  // Only a change suggests it: re-showing an already-raised cap should not tick the box.
  const suggestExpiry = capNum !== null && baseline !== null && capNum > baseline && capNum !== currentCap;
  const withExpiry = expiryDraft ?? suggestExpiry;
  const capUntil = lanePanel?.cap_until || null;
  const disabled = Boolean(blocked || !range);
  const raised = capUntil && isFutureIso(capUntil);

  const submit = () => {
    const h = withExpiry ? hours : null;
    const err = validateModule1CapForm({ cap: capValue, hours: h, reason }, range);
    setError(err);
    if (err) return;
    const cap = Number(capValue);
    const hoursNum = h === null ? null : Number(h);
    const why = reason.trim();
    onRequest({
      title: `Module-1 ${label} cap → ${cap}`,
      confirmLabel: 'Set cap',
      rows: [
        { label: 'Cap', before: currentCap ?? '–', after: cap },
        {
          label: 'Expiry',
          before: capUntil ? `${fmtTime(capUntil)}` : 'permanent',
          after: hoursNum === null ? 'permanent (until reset)' : `reverts to default after ${fmtHours(hoursNum)}`,
        },
        { label: 'Reason', before: '', after: why },
      ],
      note: 'Applies to new dispatches; running jobs are not stopped.',
      undo: {
        undoable: true,
        text: hoursNum === null
          ? 'Use Reset on this card to go back to the recorded default.'
          : 'It reverts by itself at the expiry, or use Reset on this card to go back sooner.',
      },
      run: () => adminSetModule1Cap({ lane, cap, hours: hoursNum, reason: why }),
      merge: (response) => ({ kind: 'module1Cap', lane, configKey, cap, hours: hoursNum, response }),
      successText: `Module-1 ${label} cap set to ${cap}${hoursNum === null ? '' : ` for ${fmtHours(hoursNum)}`}.`,
      onSuccess: () => { setReason(''); setCapDraft(null); setExpiryDraft(null); },
    });
  };

  const reset = () => {
    onRequest({
      title: `Reset Module-1 ${label} cap`,
      confirmLabel: 'Reset cap',
      rows: [{ label: 'Cap', before: currentCap ?? '–', after: defaultCap ?? 'recorded default' }],
      undo: { undoable: true, text: 'Set the previous cap again from this card.' },
      run: () => adminResetConfig(configKey),
      merge: (response) => ({ kind: 'config', configKey, response }),
      successText: `Module-1 ${label} cap reset to default.`,
      onSuccess: () => { setCapDraft(null); setExpiryDraft(null); },
    });
  };

  return (
    <Lever title={`${label} cap`} help={capHelp(lane)}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground tabular-nums">
        <span>Now <span className="text-sm font-semibold text-foreground">{currentCap ?? '–'}</span></span>
        {defaultCap !== null && <span>Default {defaultCap}</span>}
        {range && <span>Allowed {range[0]}–{range[1]}</span>}
        {raised && (
          <StatusChip tone="warning" title={fmtTime(capUntil)}>
            Raised, reverts {fmtRelative(capUntil)}
          </StatusChip>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cap" hint={range ? `${range[0]}–${range[1]}` : undefined}>
          <Stepper label={`${label} cap`} value={capValue} onChange={setCapDraft} min={range?.[0] ?? 0} max={range?.[1] ?? 0} disabled={disabled} />
        </Field>
        <label className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground max-md:h-10">
          <input
            type="checkbox"
            checked={withExpiry}
            disabled={disabled}
            onChange={(e) => setExpiryDraft(e.target.checked)}
            className="size-3.5 accent-[hsl(var(--primary))]"
          />
          Revert after
        </label>
        {withExpiry && (
          <Field label="Hours" hint={`${MODULE1_CAP_HOURS_MIN}–${MODULE1_CAP_HOURS_MAX}`}>
            <Stepper
              label="Revert hours"
              value={hours}
              onChange={setHours}
              min={MODULE1_CAP_HOURS_MIN}
              max={MODULE1_CAP_HOURS_MAX}
              step={0.5}
              disabled={disabled}
            />
          </Field>
        )}
        <Field label="Reason" hint="required" className="min-w-[140px] flex-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={disabled}
            className={cn(inputCls, 'w-full max-md:h-10')}
          />
        </Field>
        <Button variant="outline" disabled={disabled} onClick={submit} className="max-md:h-10">Set cap…</Button>
        <Button variant="ghost" disabled={Boolean(blocked)} onClick={reset} className="max-md:h-10">Reset to default…</Button>
      </div>
      {error && <p role="alert" className="mt-1 text-2xs text-[var(--error)]">{error}</p>}
    </Lever>
  );
}

/** Ordered multi-select for GPU instance types (first = preferred). Written via the config store. */
function InstanceTypesLever({ current, allowlist, blocked, onRequest }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const list = draft ?? current;
  const remaining = (allowlist || []).filter((t) => !list.includes(t));
  const disabled = Boolean(blocked || !Array.isArray(allowlist));
  const dirty = draft !== null && draft.join(',') !== current.join(',');

  const move = (i, d) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  const save = () => {
    const err = validateInstanceTypes(list, allowlist);
    setError(err);
    if (err) return;
    const value = list.join(',');
    onRequest({
      title: 'Module-1 GPU instance types',
      confirmLabel: 'Save order',
      rows: [{ label: 'Order', before: current.join(', ') || '–', after: list.join(', ') }],
      note: 'Tried in this order when a GPU job is dispatched.',
      undo: { undoable: true, text: 'Reorder again from this card, or use Reset to go back to the recorded default.' },
      run: () => adminSetConfig(MODULE1_KEYS.gpuTypes, value),
      merge: (response) => ({ kind: 'config', configKey: MODULE1_KEYS.gpuTypes, response, fallbackValue: value }),
      successText: 'GPU instance types updated.',
      onSuccess: () => setDraft(null),
    });
  };

  const reset = () => {
    onRequest({
      title: 'Reset Module-1 GPU instance types',
      confirmLabel: 'Reset order',
      rows: [{ label: 'Order', before: current.join(', ') || '–', after: 'recorded default' }],
      undo: { undoable: true, text: 'Enter the previous order again from this card.' },
      run: () => adminResetConfig(MODULE1_KEYS.gpuTypes),
      merge: (response) => ({ kind: 'config', configKey: MODULE1_KEYS.gpuTypes, response }),
      successText: 'GPU instance types reset to default.',
      onSuccess: () => setDraft(null),
    });
  };

  const iconBtn = 'size-8 max-md:size-10';

  return (
    <Lever title="GPU instance types, in order of preference" help={INSTANCE_TYPES_HELP}>
      <ol className="mb-2 space-y-1">
        {list.length === 0 && <li className="text-xs text-muted-foreground">None selected.</li>}
        {list.map((t, i) => (
          <li key={t} className="flex min-h-8 items-center gap-2 rounded-md bg-muted/50 px-2 text-xs">
            <span className="w-4 tabular-nums text-muted-foreground">{i + 1}</span>
            <code className="font-mono text-foreground">{t}</code>
            {allowlist && !allowlist.includes(t) && (
              <StatusChip tone="warning">not in allowlist</StatusChip>
            )}
            <span className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className={iconBtn} disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${t} up`}>↑</Button>
              <Button variant="ghost" size="icon" className={iconBtn} disabled={disabled || i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${t} down`}>↓</Button>
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setDraft(list.filter((x) => x !== t))} aria-label={`Remove ${t}`}>Remove</Button>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          disabled={disabled || remaining.length === 0}
          aria-label="Add a GPU instance type"
          onChange={(e) => e.target.value && setDraft([...list, e.target.value])}
          className={cn(selectCls, 'max-md:h-10')}
        >
          <option value="">{remaining.length ? 'Add a type…' : 'All allowed types added'}</option>
          {remaining.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button variant="outline" disabled={disabled || !dirty} onClick={save} className="max-md:h-10">Save order…</Button>
        {draft !== null && (
          <Button variant="ghost" onClick={() => { setDraft(null); setError(null); }} className="max-md:h-10">Discard</Button>
        )}
        <Button variant="ghost" disabled={Boolean(blocked)} onClick={reset} className="max-md:h-10">Reset to default…</Button>
      </div>
      {error && <p role="alert" className="mt-1 text-2xs text-[var(--error)]">{error}</p>}
    </Lever>
  );
}

export default function Module1Card({ module1, bounds, defaults, blockedReason, onRequest, lastChange }) {
  const blocked = blockedReason || (!module1 ? 'no Module-1 data' : null);
  const config = module1?.config || {};
  const gpuRange = Array.isArray(bounds?.[MODULE1_KEYS.gpuCap]) ? bounds[MODULE1_KEYS.gpuCap] : null;
  const cpuRange = Array.isArray(bounds?.[MODULE1_KEYS.cpuCap]) ? bounds[MODULE1_KEYS.cpuCap] : null;
  const allowlist = Array.isArray(bounds?.['module1.gpu_instance_types_allowlist'])
    ? bounds['module1.gpu_instance_types_allowlist']
    : null;
  // The lane's live cap first: an expired `_until` reverts to the env default without
  // rewriting the config key, so the raw config value can be stale.
  const gpuCap = num(module1?.gpu?.cap) ?? num(config[MODULE1_KEYS.gpuCap]);
  const cpuCap = num(module1?.cpu?.cap) ?? num(config[MODULE1_KEYS.cpuCap]);
  const types = parseTypes(config[MODULE1_KEYS.gpuTypes]);

  let chip = { tone: 'muted', text: 'No data' };
  if (module1) {
    if (!module1.head_in_service) chip = { tone: 'error', text: 'Head box down' };
    else if (module1.gpu_capacity_unavailable) chip = { tone: 'warning', text: 'GPU capacity unavailable' };
    else chip = { tone: 'success', text: 'Running' };
  }

  return (
    <Panel
      title="Module-1"
      badge={<StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
      help={(
        <HelpPopover title="Module-1" align="start">
          <HelpBody what={SECTION_HELP.module1.what} items={SECTION_HELP.module1.items} />
        </HelpPopover>
      )}
      bodyClassName="flex flex-col gap-3"
    >
      {blocked && <Unavailable reason={blocked} />}

      {module1 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="GPU running / cap" value={`${module1.gpu?.running ?? '–'} / ${module1.gpu?.cap ?? '–'}`} />
          <Stat label="CPU running / cap" value={`${module1.cpu?.running ?? '–'} / ${module1.cpu?.cap ?? '–'}`} />
          <Stat label="Queued GPU / CPU" value={`${module1.queued_gpu ?? '–'} / ${module1.queued_cpu ?? '–'}`} />
          <Stat label="Oldest queued" value={fmtAge(module1.oldest_queued_age_sec)} />
          <Stat
            label="GPU capacity"
            value={module1.gpu_capacity_unavailable ? 'Unavailable' : 'OK'}
            tone={toneText(module1.gpu_capacity_unavailable ? 'error' : 'success')}
          />
          <Stat
            label="Head box"
            value={module1.head_in_service ? 'In service' : 'Not in service'}
            tone={toneText(module1.head_in_service ? 'success' : 'error')}
          />
        </div>
      )}

      <ChangeLine by={lastChange?.actor} at={lastChange?.at} reason={lastChange?.reason} />

      <CapLever
        lane="gpu"
        label="GPU"
        lanePanel={module1?.gpu}
        currentCap={gpuCap}
        defaultCap={num(defaults?.gpu)}
        range={gpuRange}
        blocked={blocked}
        onRequest={onRequest}
      />
      <CapLever
        lane="cpu"
        label="CPU"
        lanePanel={module1?.cpu}
        currentCap={cpuCap}
        defaultCap={num(defaults?.cpu)}
        range={cpuRange}
        blocked={blocked}
        onRequest={onRequest}
      />
      <InstanceTypesLever current={types} allowlist={allowlist} blocked={blocked} onRequest={onRequest} />

      <div className="border-t border-border pt-3 text-2xs text-muted-foreground">
        <span className="font-medium text-foreground">GPU subnets</span>
        <StatusChip tone="muted" className="ml-2">Read-only</StatusChip>
        <code className="mt-1 block break-all font-mono">{config[MODULE1_KEYS.gpuSubnets] || '–'}</code>
        <p className="mt-1">{SUBNETS_HELP}</p>
      </div>
    </Panel>
  );
}
