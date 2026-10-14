import { useState } from 'react';
import {
  adminSetConfig,
  EXOMISER_BACKENDS,
  EXOMISER_CANARY_BACKENDS,
  EXOMISER_KEYS,
  EXOMISER_OUTPUT_FORMATS,
  EXOMISER_SLOTS_RANGE,
  parseCanaryUsers,
  parseNominalSlots,
  parseShadowRate,
} from '@/services/infraApi';
import {
  cardStyle,
  cellStyle,
  dangerButtonStyle,
  fmtRelative,
  fmtTime,
  inputStyle,
  mutedText,
  secondaryButtonClass,
  secondaryButtonStyle,
  Stat,
  Unavailable,
} from './infraShared';

const BACKEND_TEXT = {
  classic: 'Normal path (a fresh Exomiser process per job)',
  shadow: 'Normal path serves; the fast engine runs silently and is compared',
  fast: 'Fast engine serves',
};

function cfg(exomiser, key, fallback) {
  const v = exomiser?.config?.[key];
  return v === undefined || v === null ? fallback : v;
}

/** `after` is what the confirm dialog shows; `value` (default: `after`) is what is written. */
function writeRequest(key, label, before, after, onRequest, { danger = false, note, value = after } = {}) {
  const show = (v) => (Array.isArray(v) ? v.join(', ') || '—' : v);
  onRequest({
    title: `Exomiser fast path: ${label}`,
    danger,
    rows: [{ label, before: show(before), after: show(after) }],
    note,
    run: () => adminSetConfig(key, value),
    merge: (response) => ({ kind: 'exomiserConfig', configKey: key, response, fallbackValue: value }),
    successText: `${label} updated.`,
  });
}

function depth(q) {
  if (!q) return '—';
  return `${q.visible ?? 0} waiting / ${q.in_flight ?? 0} running`;
}

function PathRow({ exomiser, blocked, onRequest }) {
  const backend = cfg(exomiser, EXOMISER_KEYS.backend, 'classic');
  const [pick, setPick] = useState(null);
  const chosen = pick ?? backend;
  const options = EXOMISER_BACKENDS.includes(backend) ? EXOMISER_BACKENDS : [...EXOMISER_BACKENDS, backend];
  const save = () => {
    if (chosen === backend) return;
    writeRequest(EXOMISER_KEYS.backend, 'Exomiser path', backend, chosen, onRequest, {
      note: chosen === 'shadow'
        ? 'Users still get the normal result. The fast engine also runs each eligible job and the two result tables are compared; a real difference raises an alarm.'
        : 'New jobs use the normal path only. Jobs already running finish where they started.',
    });
  };
  return (
    <div>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Who serves new Exomiser jobs</div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={chosen} disabled={Boolean(blocked)} onChange={(e) => setPick(e.target.value)}
          className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50" style={inputStyle}>
          {options.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <button type="button" disabled={Boolean(blocked) || chosen === backend} onClick={save}
          className={secondaryButtonClass} style={secondaryButtonStyle}>Apply</button>
      </div>
      <div className="text-2xs mt-1" style={mutedText}>{BACKEND_TEXT[backend] || backend}</div>
    </div>
  );
}

function ToggleRow({ label, help, configKey, exomiser, fallback = false, blocked, onRequest, danger, onWhenText, offWhenText }) {
  const on = Boolean(cfg(exomiser, configKey, fallback));
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b" style={cellStyle}>
      <div>
        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}: {on ? 'ON' : 'off'}</div>
        <div className="text-2xs" style={mutedText}>{help}</div>
      </div>
      <button type="button" disabled={Boolean(blocked)}
        onClick={() => writeRequest(configKey, label, on ? 'on' : 'off', on ? 'off' : 'on', onRequest, {
          value: !on,
          danger: danger && !on,
          note: on ? offWhenText : onWhenText,
        })}
        className={secondaryButtonClass} style={danger && !on ? dangerButtonStyle : secondaryButtonStyle}>
        Turn {on ? 'off' : 'on'}
      </button>
    </div>
  );
}

function CanaryEditor({ exomiser, blocked, onRequest }) {
  const users = cfg(exomiser, EXOMISER_KEYS.canaryUsers, []);
  const backend = cfg(exomiser, EXOMISER_KEYS.canaryBackend, 'shadow');
  const [text, setText] = useState(null);
  const [pick, setPick] = useState(null);
  const draft = text ?? users.join('\n');
  const list = parseCanaryUsers(draft);
  const chosen = pick ?? backend;
  const disabled = Boolean(blocked);
  const same = JSON.stringify(list) === JSON.stringify(users);
  return (
    <div className="mt-3">
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Canary accounts</div>
      <p className="text-2xs mb-1" style={mutedText}>
        These accounts (email or user id, one per line) get the path below regardless of the setting above. <strong>fast</strong> serves them from the
        fast engine: use it only for your own and test accounts until the licence question is answered.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <textarea value={draft} rows={3} disabled={disabled} onChange={(e) => setText(e.target.value)}
          className="px-2 py-1 text-2xs rounded-md border min-w-[240px] disabled:opacity-50" style={inputStyle} />
        <select value={chosen} disabled={disabled} onChange={(e) => setPick(e.target.value)}
          className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50" style={inputStyle}>
          {EXOMISER_CANARY_BACKENDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex flex-col gap-1">
          <button type="button" disabled={disabled || same} className={secondaryButtonClass} style={secondaryButtonStyle}
            onClick={() => writeRequest(EXOMISER_KEYS.canaryUsers, 'Canary accounts', users, list, onRequest)}>Save accounts</button>
          <button type="button" disabled={disabled || chosen === backend} className={secondaryButtonClass}
            style={chosen === 'fast' ? dangerButtonStyle : secondaryButtonStyle}
            onClick={() => writeRequest(EXOMISER_KEYS.canaryBackend, 'Canary path', backend, chosen, onRequest, {
              danger: chosen === 'fast',
              note: chosen === 'fast'
                ? 'The canary accounts get their Exomiser result from the fast engine (re-run once on the normal path if it fails, while the fall-back is on). The licence decision is still open: keep this to your own accounts.'
                : 'The canary accounts get the normal result; the fast engine runs silently and is compared.',
            })}>
            Save path
          </button>
        </div>
      </div>
    </div>
  );
}

/** One labelled number / choice with a Save button; `parse` returns { value } or { error }. */
function ValueRow({ label, help, configKey, exomiser, fallback, blocked, onRequest, input, parse, format = (v) => v }) {
  const current = cfg(exomiser, configKey, fallback);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const text = draft ?? String(current);
  const save = () => {
    const parsed = parse(text);
    if (parsed.error) { setError(parsed.error); return; }
    setError(null);
    if (parsed.value === current) return;
    writeRequest(configKey, label, format(current), format(parsed.value), onRequest, { value: parsed.value });
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 py-2 border-b" style={cellStyle}>
      <div className="max-w-md">
        <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}: {format(current)}</div>
        <div className="text-2xs" style={mutedText}>{help}</div>
        {error && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {input({ text, setText: setDraft, disabled: Boolean(blocked) })}
        <button type="button" disabled={Boolean(blocked)} onClick={save} className={secondaryButtonClass} style={secondaryButtonStyle}>Save</button>
      </div>
    </div>
  );
}

function GateChips({ gate }) {
  if (!gate) return null;
  const chip = (label, on, extra) => (
    <span key={label} className="text-2xs px-2 py-0.5 rounded-full border"
      style={{ borderColor: 'var(--border-default)', color: on ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
      {label}: {extra ?? (on ? 'on' : 'off')}
    </span>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {chip('New queue handling', gate.sqs_v2)}
        {chip('Heartbeat', gate.heartbeat)}
        {chip('Fast engines per machine', gate.slots > 0, String(gate.slots))}
        {chip('Shadow polling', gate.shadow)}
        {gate.jar_sha ? chip('Engine build', true, gate.jar_sha) : null}
      </div>
      <p className="text-2xs mt-1" style={mutedText}>
        {gate.legacy
          ? 'Worker gate: legacy (today\'s behaviour). It is changed on the machines with an admin command, not from this page.'
          : `Worker gate (read only)${gate.changed_at ? `, changed ${fmtRelative(gate.changed_at)}` : ''}. It is changed with an admin command, not from this page.`}
      </p>
    </div>
  );
}

/**
 * Exomiser fast path: which path serves Exomiser jobs, plus the fast engine's health. The normal path is the default and the
 * answer to every error; the kill switch forces it everywhere within ~45 s. `fast` is for canary accounts only until the
 * licence question is answered.
 */
export default function ExomiserFastCard({ exomiser, errors, blockedReason, onRequest }) {
  const panelErrors = Object.entries(errors || {}).filter(([k]) => k === 'exomiser_fast' || k.startsWith('exomiser_fast.'));
  const blocked = blockedReason || (errors?.exomiser_fast ? errors.exomiser_fast : null) || (exomiser ? null : 'no Exomiser data');
  if (!exomiser) return <Unavailable reason={blocked} />;
  const parity = exomiser.parity;
  const slots = exomiser.slots;
  const dlqCount = exomiser.shadow_dlq ? (exomiser.shadow_dlq.visible || 0) + (exomiser.shadow_dlq.in_flight || 0) : null;
  return (
    <div className="rounded-xl border p-4 space-y-4" style={cardStyle}>
      <p className="text-2xs" style={{ color: 'var(--warning)' }}>
        Licence decision pending: Exomiser is AGPL-3.0. The fast engine is for canary / admin accounts only; the main selector does not offer it.
      </p>
      {!exomiser.shadow_queue_configured && (
        <p className="text-2xs" style={{ color: 'var(--warning)' }}>
          Shadow runs are not wired to this API (no shadow queue configured), so only the normal path runs whatever is set below.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Shadow queue" value={depth(exomiser.shadow_queue)} />
        <Stat label="Shadow failed (dead-letter)" value={dlqCount === null ? '—' : String(dlqCount)}
          tone={dlqCount ? 'var(--error)' : undefined} />
        <Stat label="Slots busy / total" value={slots && slots.total !== null ? `${slots.busy ?? 0} / ${slots.total}` : '—'} />
        <Stat label="Last compare" value={parity?.last_at ? fmtRelative(parity.last_at) : '—'} />
      </div>
      {parity && (
        <p className="text-2xs" style={mutedText}>
          Last {parity.shown} shadow comparisons: {parity.match} identical, {parity.noise} within normal Exomiser noise, {parity.mismatch} different
          {parity.mismatch ? ' (do not serve from the fast engine until this is 0: see the alarm)' : ''}.
          {parity.p_value_crossings || parity.acmg_tie_flips || parity.tier_changes
            ? ` Noise detail: ${parity.p_value_crossings} P-VALUE threshold crossings, ${parity.acmg_tie_flips} disease-name ties, ${parity.tier_changes} priority-tier changes.`
            : ''}
          {parity.last_at ? ` Latest ${fmtTime(parity.last_at)}.` : ''}
        </p>
      )}
      <GateChips gate={exomiser.gate} />

      <PathRow exomiser={exomiser} blocked={blocked} onRequest={onRequest} />
      <CanaryEditor exomiser={exomiser} blocked={blocked} onRequest={onRequest} />

      <div>
        <ToggleRow label="Kill switch" configKey={EXOMISER_KEYS.kill} exomiser={exomiser} blocked={blocked} onRequest={onRequest} danger
          help="Force every new Exomiser job back to the normal path, everywhere, within ~45 s, and stop shadow runs. Jobs already running finish where they started."
          onWhenText="All new Exomiser jobs use the normal path, including canary accounts."
          offWhenText="The paths set above apply again." />
        <ToggleRow label="Fall back to the normal path on failure" configKey={EXOMISER_KEYS.fallback} fallback exomiser={exomiser} blocked={blocked}
          onRequest={onRequest}
          help="If a job fails on the fast engine, run it once more on the normal path instead of showing a failure."
          onWhenText="A failed fast-engine job is re-run once on the normal path." offWhenText="A failed fast-engine job fails for the user." />
        <ToggleRow label="Compare shadow results" configKey={EXOMISER_KEYS.shadowParity} fallback exomiser={exomiser} blocked={blocked}
          onRequest={onRequest}
          help="After a shadowed job, compare the two result tables and record the outcome (counts only)."
          onWhenText="Each shadowed job is compared; real differences raise an alarm." offWhenText="Shadow jobs still run but are not compared." />
        <ValueRow label="Shadow rate" configKey={EXOMISER_KEYS.shadowRate} fallback={1} exomiser={exomiser} blocked={blocked}
          onRequest={onRequest} parse={parseShadowRate}
          help="Share of eligible jobs that also get a shadow run: 0 = none, 1 = every job."
          input={({ text, setText, disabled }) => (
            <input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} inputMode="decimal"
              className="px-2 py-1 text-2xs rounded-md border w-20 disabled:opacity-50" style={inputStyle} />
          )} />
        <ValueRow label="Jobs one machine runs at once (for scaling)" configKey={EXOMISER_KEYS.nominalSlots} fallback={1} exomiser={exomiser}
          blocked={blocked} onRequest={onRequest} parse={parseNominalSlots}
          help={`Used to decide how many machines to start for a backlog (${EXOMISER_SLOTS_RANGE[0]} = today's behaviour). Set it to the number of fast engines per machine only once those are running.`}
          input={({ text, setText, disabled }) => (
            <input value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} inputMode="numeric"
              className="px-2 py-1 text-2xs rounded-md border w-16 disabled:opacity-50" style={inputStyle} />
          )} />
        <ValueRow label="Output files" configKey={EXOMISER_KEYS.outputFormats} fallback="all" exomiser={exomiser} blocked={blocked}
          onRequest={onRequest} parse={(t) => (EXOMISER_OUTPUT_FORMATS.includes(t) ? { value: t } : { error: 'Choose all or tsv_variant.' })}
          help={'"all" keeps every Exomiser output file; "tsv_variant" writes only the table the app reads.'}
          input={({ text, setText, disabled }) => (
            <select value={text} disabled={disabled} onChange={(e) => setText(e.target.value)}
              className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50" style={inputStyle}>
              {EXOMISER_OUTPUT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )} />
      </div>
      {panelErrors.length > 0 && (
        <p className="text-2xs" style={{ color: 'var(--warning)' }}>
          Some readings are unavailable: {panelErrors.map(([k, v]) => `${k.replace('exomiser_fast.', '')} (${v})`).join('; ')}.
        </p>
      )}
    </div>
  );
}
