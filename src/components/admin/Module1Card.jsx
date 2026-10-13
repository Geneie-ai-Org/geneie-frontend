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
import {
  cardStyle,
  fmtAge,
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
import { capHelp, INSTANCE_TYPES_HELP, SUBNETS_HELP } from './infraHelp';

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
      rows: [
        { label: 'Cap', before: currentCap ?? '—', after: cap },
        {
          label: 'Expiry',
          before: capUntil ? `${fmtTime(capUntil)}` : 'permanent',
          after: hoursNum === null ? 'permanent (until reset)' : `reverts to default after ${fmtHours(hoursNum)}`,
        },
        { label: 'Reason', before: '', after: why },
      ],
      note: 'Applies to new dispatches; running jobs are not stopped.',
      run: () => adminSetModule1Cap({ lane, cap, hours: hoursNum, reason: why }),
      merge: (response) => ({ kind: 'module1Cap', lane, configKey, cap, hours: hoursNum, response }),
      successText: `Module-1 ${label} cap set to ${cap}${hoursNum === null ? '' : ` for ${fmtHours(hoursNum)}`}.`,
      onSuccess: () => { setReason(''); setCapDraft(null); setExpiryDraft(null); },
    });
  };

  const reset = () => {
    onRequest({
      title: `Reset Module-1 ${label} cap`,
      rows: [{ label: 'Cap', before: currentCap ?? '—', after: defaultCap ?? 'recorded default' }],
      run: () => adminResetConfig(configKey),
      merge: (response) => ({ kind: 'config', configKey, response }),
      successText: `Module-1 ${label} cap reset to default.`,
      onSuccess: () => { setCapDraft(null); setExpiryDraft(null); },
    });
  };

  return (
    <div className="mb-3">
      <div className="text-2xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label} cap{range ? ` (${range[0]}–${range[1]})` : ''}
        {defaultCap !== null ? ` · default ${defaultCap}` : ''}
        {capUntil && isFutureIso(capUntil) ? ` · reverts ${fmtTime(capUntil)} (${fmtRelative(capUntil)})` : ''}
      </div>
      <Help {...capHelp(lane)} />
      <div className="flex flex-wrap items-end gap-3">
        <Stepper value={capValue} onChange={setCapDraft} min={range?.[0] ?? 0} max={range?.[1] ?? 0} disabled={disabled} />
        <label className="flex items-center gap-1 text-2xs" style={mutedText}>
          <input
            type="checkbox"
            checked={withExpiry}
            disabled={disabled}
            onChange={(e) => setExpiryDraft(e.target.checked)}
          />
          Revert after
        </label>
        {withExpiry && (
          <Stepper
            value={hours}
            onChange={setHours}
            min={MODULE1_CAP_HOURS_MIN}
            max={MODULE1_CAP_HOURS_MAX}
            step={0.5}
            disabled={disabled}
          />
        )}
        {withExpiry && <span className="text-2xs" style={mutedText}>h</span>}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          placeholder="Reason (required)"
          className="flex-1 min-w-[120px] px-2 py-1 text-xs rounded-md border disabled:opacity-50"
          style={inputStyle}
        />
        <button type="button" disabled={disabled} onClick={submit} className={primaryButtonClass} style={primaryButtonStyle}>
          Set
        </button>
        <button type="button" disabled={Boolean(blocked)} onClick={reset} className={secondaryButtonClass} style={secondaryButtonStyle}>
          Reset
        </button>
      </div>
      {error && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
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
      rows: [{ label: 'Order', before: current.join(', ') || '—', after: list.join(', ') }],
      note: 'Tried in this order when a GPU job is dispatched.',
      run: () => adminSetConfig(MODULE1_KEYS.gpuTypes, value),
      merge: (response) => ({ kind: 'config', configKey: MODULE1_KEYS.gpuTypes, response, fallbackValue: value }),
      successText: 'GPU instance types updated.',
      onSuccess: () => setDraft(null),
    });
  };

  const reset = () => {
    onRequest({
      title: 'Reset Module-1 GPU instance types',
      rows: [{ label: 'Order', before: current.join(', ') || '—', after: 'recorded default' }],
      run: () => adminResetConfig(MODULE1_KEYS.gpuTypes),
      merge: (response) => ({ kind: 'config', configKey: MODULE1_KEYS.gpuTypes, response }),
      successText: 'GPU instance types reset to default.',
      onSuccess: () => setDraft(null),
    });
  };

  return (
    <div className="mb-3">
      <div className="text-2xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        GPU instance types (in order of preference)
      </div>
      <Help {...INSTANCE_TYPES_HELP} />
      <ol className="text-xs space-y-1 mb-2">
        {list.length === 0 && <li style={mutedText}>None selected.</li>}
        {list.map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <span className="w-4 text-2xs tabular-nums" style={mutedText}>{i + 1}.</span>
            <code style={{ color: 'var(--text-primary)' }}>{t}</code>
            {allowlist && !allowlist.includes(t) && (
              <span className="text-2xs" style={{ color: 'var(--warning)' }}>not in allowlist</span>
            )}
            <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className={secondaryButtonClass} style={secondaryButtonStyle} aria-label={`Move ${t} up`}>↑</button>
            <button type="button" disabled={disabled || i === list.length - 1} onClick={() => move(i, 1)} className={secondaryButtonClass} style={secondaryButtonStyle} aria-label={`Move ${t} down`}>↓</button>
            <button type="button" disabled={disabled} onClick={() => setDraft(list.filter((x) => x !== t))} className={secondaryButtonClass} style={secondaryButtonStyle}>Remove</button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          disabled={disabled || remaining.length === 0}
          onChange={(e) => e.target.value && setDraft([...list, e.target.value])}
          className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50"
          style={inputStyle}
        >
          <option value="">{remaining.length ? 'Add a type…' : 'All allowed types added'}</option>
          {remaining.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" disabled={disabled || !dirty} onClick={save} className={primaryButtonClass} style={primaryButtonStyle}>
          Save order
        </button>
        {draft !== null && (
          <button type="button" onClick={() => { setDraft(null); setError(null); }} className={secondaryButtonClass} style={secondaryButtonStyle}>
            Discard
          </button>
        )}
        <button type="button" disabled={Boolean(blocked)} onClick={reset} className={secondaryButtonClass} style={secondaryButtonStyle}>
          Reset
        </button>
      </div>
      {error && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  );
}

export default function Module1Card({ module1, bounds, defaults, blockedReason, onRequest }) {
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

  return (
    <div className="rounded-xl border p-4" style={cardStyle}>
      {blocked && <div className="mb-3"><Unavailable reason={blocked} /></div>}

      {module1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="GPU running / cap" value={`${module1.gpu?.running ?? '—'} / ${module1.gpu?.cap ?? '—'}`} />
          <Stat label="CPU running / cap" value={`${module1.cpu?.running ?? '—'} / ${module1.cpu?.cap ?? '—'}`} />
          <Stat label="Queued GPU / CPU" value={`${module1.queued_gpu ?? '—'} / ${module1.queued_cpu ?? '—'}`} />
          <Stat label="Oldest queued" value={fmtAge(module1.oldest_queued_age_sec)} />
          <Stat
            label="GPU capacity"
            value={module1.gpu_capacity_unavailable ? 'Unavailable' : 'OK'}
            tone={module1.gpu_capacity_unavailable ? 'var(--error)' : 'var(--success)'}
          />
          <Stat
            label="Head box"
            value={module1.head_in_service ? 'In service' : 'Not in service'}
            tone={module1.head_in_service ? 'var(--success)' : 'var(--error)'}
          />
        </div>
      )}

      <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
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

        <div className="text-2xs" style={mutedText}>
          GPU subnets (read-only):{' '}
          <code className="break-all" style={{ color: 'var(--text-secondary)' }}>
            {config[MODULE1_KEYS.gpuSubnets] || '—'}
          </code>
          <div>{SUBNETS_HELP}</div>
        </div>
      </div>
    </div>
  );
}
