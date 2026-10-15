import { useState } from 'react';
import {
  adminSetConfig,
  EXOMISER_BACKENDS,
  EXOMISER_CANARY_BACKENDS,
  EXOMISER_KEYS,
  EXOMISER_OUTPUT_FORMATS,
  EXOMISER_SLOTS_RANGE,
  parseNominalSlots,
  parseShadowRate,
} from '@/services/infraApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Banner, HelpBody, HelpPopover, Panel, StatusChip, inputCls, selectCls, toneText } from './adminUi';
import { ChangeLine, fmtRelative, fmtTime, Stat, Unavailable } from './infraShared';
import { CanaryEditor, depth, ToggleRow } from './routingShared';
import { SECTION_HELP } from './infraHelp';

const BACKEND_TEXT = {
  classic: 'Normal path (a fresh Exomiser process per job)',
  shadow: 'Normal path serves; the fast engine runs silently and is compared',
  fast: 'Fast engine serves',
};

const DEFAULT_UNDO = {
  undoable: true,
  text: 'Change it back from this card at any time. There is no timer: the setting stays until you change it.',
};

function cfg(exomiser, key, fallback) {
  const v = exomiser?.config?.[key];
  return v === undefined || v === null ? fallback : v;
}

/** `after` is what the confirm dialog shows; `value` (default: `after`) is what is written. */
function writeRequest(key, label, before, after, onRequest, { danger = false, note, value = after, confirmLabel = 'Save', undo = DEFAULT_UNDO } = {}) {
  const show = (v) => (Array.isArray(v) ? v.join(', ') || '–' : v);
  onRequest({
    title: `Exomiser fast path: ${label}`,
    confirmLabel,
    danger,
    rows: [{ label, before: show(before), after: show(after) }],
    note,
    undo,
    run: () => adminSetConfig(key, value),
    merge: (response) => ({ kind: 'exomiserConfig', configKey: key, response, fallbackValue: value }),
    successText: `${label} updated.`,
  });
}

function PathRow({ exomiser, blocked, onRequest }) {
  const backend = cfg(exomiser, EXOMISER_KEYS.backend, 'classic');
  const [pick, setPick] = useState(null);
  const chosen = pick ?? backend;
  const options = EXOMISER_BACKENDS.includes(backend) ? EXOMISER_BACKENDS : [...EXOMISER_BACKENDS, backend];
  const save = () => {
    if (chosen === backend) return;
    writeRequest(EXOMISER_KEYS.backend, 'Exomiser path', backend, chosen, onRequest, {
      confirmLabel: `Switch to ${chosen}`,
      undo: {
        undoable: true,
        text: `Switch back to ${backend} from this card, or use the kill switch to send every new job to the normal path within ~45 s. Jobs already running finish where they started.`,
      },
      note: chosen === 'shadow'
        ? 'Users still get the normal result. The fast engine also runs each eligible job and the two result tables are compared; a real difference raises an alarm.'
        : 'New jobs use the normal path only. Jobs already running finish where they started.',
    });
  };
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-foreground">Who serves new Exomiser jobs</h3>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={backend === 'classic' ? 'muted' : 'info'}>{backend}</StatusChip>
        <select
          value={chosen}
          disabled={Boolean(blocked)}
          aria-label="Exomiser path"
          onChange={(e) => setPick(e.target.value)}
          className={cn(selectCls, 'max-md:h-10')}
        >
          {options.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <Button variant="outline" size="sm" disabled={Boolean(blocked) || chosen === backend} onClick={save} className="max-md:h-10">Apply…</Button>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">{BACKEND_TEXT[backend] || backend}</p>
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border py-2.5">
      <div className="min-w-0 max-w-md">
        <div className="text-xs font-medium text-foreground">
          {label}: <span className="tabular-nums">{format(current)}</span>
        </div>
        <p className="mt-0.5 text-2xs text-muted-foreground">{help}</p>
        {error && <p role="alert" className="mt-1 text-2xs text-[var(--error)]">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {input({ text, setText: setDraft, disabled: Boolean(blocked), label })}
        <Button variant="outline" size="sm" disabled={Boolean(blocked)} onClick={save} className="max-md:h-10">Save…</Button>
      </div>
    </div>
  );
}

function GateChips({ gate }) {
  if (!gate) return null;
  const chip = (label, on, extra) => (
    <StatusChip key={label} tone={on ? 'success' : 'muted'}>
      {label}: {extra ?? (on ? 'on' : 'off')}
    </StatusChip>
  );
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
        Worker gate <StatusChip tone="muted" className="font-normal">Read-only</StatusChip>
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {chip('New queue handling', gate.sqs_v2)}
        {chip('Heartbeat', gate.heartbeat)}
        {chip('Fast engines per machine', gate.slots > 0, String(gate.slots))}
        {chip('Shadow polling', gate.shadow)}
        {gate.jar_sha ? chip('Engine build', true, gate.jar_sha) : null}
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">
        {gate.legacy
          ? 'Legacy (today\'s behaviour). It is changed on the machines with an admin command, not from this page.'
          : `${gate.changed_at ? `Changed ${fmtRelative(gate.changed_at)}. ` : ''}It is changed with an admin command, not from this page.`}
      </p>
    </div>
  );
}

const smallInput = (extra) => cn(inputCls, 'max-md:h-10', extra);

/**
 * Exomiser fast path: which path serves Exomiser jobs, plus the fast engine's health. The normal path is the default and the
 * answer to every error; the kill switch forces it everywhere within ~45 s. `fast` is for canary accounts only until the
 * licence question is answered. `lastChange` (optional) is the newest matching audit row.
 */
export default function ExomiserFastCard({ exomiser, errors, blockedReason, onRequest, lastChange }) {
  const panelErrors = Object.entries(errors || {}).filter(([k]) => k === 'exomiser_fast' || k.startsWith('exomiser_fast.'));
  const blocked = blockedReason || (errors?.exomiser_fast ? errors.exomiser_fast : null) || (exomiser ? null : 'no Exomiser data');
  const help = (
    <HelpPopover title="Exomiser fast path" align="start">
      <HelpBody what={SECTION_HELP.exomiserFast.what} items={SECTION_HELP.exomiserFast.items} />
    </HelpPopover>
  );
  if (!exomiser) {
    return <Panel title="Exomiser fast path" help={help}><Unavailable reason={blocked} /></Panel>;
  }
  const parity = exomiser.parity;
  const slots = exomiser.slots;
  const dlqCount = exomiser.shadow_dlq ? (exomiser.shadow_dlq.visible || 0) + (exomiser.shadow_dlq.in_flight || 0) : null;
  const killOn = Boolean(cfg(exomiser, EXOMISER_KEYS.kill, false));
  const backend = cfg(exomiser, EXOMISER_KEYS.backend, 'classic');

  let chip;
  if (killOn) chip = { tone: 'warning', text: 'Kill switch on: normal path everywhere' };
  else if (dlqCount) chip = { tone: 'error', text: `${dlqCount} failed shadow job${dlqCount === 1 ? '' : 's'}` };
  else if (backend === 'classic') chip = { tone: 'success', text: 'Normal path serving' };
  else chip = { tone: 'info', text: `Path: ${backend}` };

  const toggle = (label, configKey, fallback, { danger, onWhenText, offWhenText }) => {
    const on = Boolean(cfg(exomiser, configKey, fallback));
    writeRequest(configKey, label, on ? 'on' : 'off', on ? 'off' : 'on', onRequest, {
      value: !on,
      danger: danger && !on,
      confirmLabel: `Turn ${on ? 'off' : 'on'}`,
      note: on ? offWhenText : onWhenText,
    });
  };
  const row = (label, configKey, fallback, opts) => (
    <ToggleRow
      label={label}
      on={Boolean(cfg(exomiser, configKey, fallback))}
      blocked={blocked}
      danger={opts.danger}
      help={opts.help}
      onToggle={() => toggle(label, configKey, fallback, opts)}
    />
  );

  return (
    <Panel
      title="Exomiser fast path"
      badge={<StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
      help={help}
      bodyClassName="flex flex-col gap-4"
    >
      <Banner tone="warning">
        Licence decision pending: Exomiser is AGPL-3.0. The fast engine is for canary / admin accounts only; the main selector does not offer it.
      </Banner>
      {!exomiser.shadow_queue_configured && (
        <Banner tone="warning">
          Shadow runs are not wired to this API (no shadow queue configured), so only the normal path runs whatever is set below.
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        <Stat label="Shadow queue" value={depth(exomiser.shadow_queue)} />
        <Stat
          label="Shadow failed (dead-letter)"
          value={dlqCount === null ? '–' : String(dlqCount)}
          tone={dlqCount ? toneText('error') : undefined}
        />
        <Stat label="Slots busy / total" value={slots && slots.total !== null ? `${slots.busy ?? 0} / ${slots.total}` : '–'} />
        <Stat label="Last compare" value={parity?.last_at ? fmtRelative(parity.last_at) : '–'} />
      </div>
      {parity && (
        <p className="text-2xs text-muted-foreground">
          Last {parity.shown} shadow comparisons: {parity.match} identical, {parity.noise} within normal Exomiser noise, {parity.mismatch} different
          {parity.mismatch ? ' (do not serve from the fast engine until this is 0: see the alarm)' : ''}.
          {parity.p_value_crossings || parity.acmg_tie_flips || parity.tier_changes
            ? ` Noise detail: ${parity.p_value_crossings} P-VALUE threshold crossings, ${parity.acmg_tie_flips} disease-name ties, ${parity.tier_changes} priority-tier changes.`
            : ''}
          {parity.last_at ? ` Latest ${fmtTime(parity.last_at)}.` : ''}
        </p>
      )}
      <GateChips gate={exomiser.gate} />

      <ChangeLine by={lastChange?.actor} at={lastChange?.at} reason={lastChange?.reason} />

      <PathRow exomiser={exomiser} blocked={blocked} onRequest={onRequest} />

      <CanaryEditor
        users={cfg(exomiser, EXOMISER_KEYS.canaryUsers, [])}
        backend={cfg(exomiser, EXOMISER_KEYS.canaryBackend, 'shadow')}
        options={EXOMISER_CANARY_BACKENDS}
        blocked={blocked}
        dangerValue="fast"
        intro={(
          <>
            These accounts get the path below regardless of the setting above. <strong className="font-medium text-foreground">fast</strong> serves them from the
            fast engine: use it only for your own and test accounts until the licence question is answered.
          </>
        )}
        onSaveUsers={(users, list) => writeRequest(EXOMISER_KEYS.canaryUsers, 'Canary accounts', users, list, onRequest, { confirmLabel: 'Save accounts' })}
        onSavePath={(current, chosen) => writeRequest(EXOMISER_KEYS.canaryBackend, 'Canary path', current, chosen, onRequest, {
          danger: chosen === 'fast',
          confirmLabel: `Serve canaries from ${chosen}`,
          note: chosen === 'fast'
            ? 'The canary accounts get their Exomiser result from the fast engine (re-run once on the normal path if it fails, while the fall-back is on). The licence decision is still open: keep this to your own accounts.'
            : 'The canary accounts get the normal result; the fast engine runs silently and is compared.',
        })}
      />

      <div className="border-t border-border pt-1">
        {row('Kill switch', EXOMISER_KEYS.kill, false, {
          danger: true,
          help: 'Force every new Exomiser job back to the normal path, everywhere, within ~45 s, and stop shadow runs. Jobs already running finish where they started.',
          onWhenText: 'All new Exomiser jobs use the normal path, including canary accounts.',
          offWhenText: 'The paths set above apply again.',
        })}
        {row('Fall back to the normal path on failure', EXOMISER_KEYS.fallback, true, {
          help: 'If a job fails on the fast engine, run it once more on the normal path instead of showing a failure.',
          onWhenText: 'A failed fast-engine job is re-run once on the normal path.',
          offWhenText: 'A failed fast-engine job fails for the user.',
        })}
        {row('Compare shadow results', EXOMISER_KEYS.shadowParity, true, {
          help: 'After a shadowed job, compare the two result tables and record the outcome (counts only).',
          onWhenText: 'Each shadowed job is compared; real differences raise an alarm.',
          offWhenText: 'Shadow jobs still run but are not compared.',
        })}
        <ValueRow
          label="Shadow rate"
          configKey={EXOMISER_KEYS.shadowRate}
          fallback={1}
          exomiser={exomiser}
          blocked={blocked}
          onRequest={onRequest}
          parse={parseShadowRate}
          help="Share of eligible jobs that also get a shadow run: 0 = none, 1 = every job."
          input={({ text, setText, disabled, label }) => (
            <input value={text} disabled={disabled} aria-label={label} onChange={(e) => setText(e.target.value)} inputMode="decimal" className={smallInput('w-20')} />
          )}
        />
        <ValueRow
          label="Jobs one machine runs at once (for scaling)"
          configKey={EXOMISER_KEYS.nominalSlots}
          fallback={1}
          exomiser={exomiser}
          blocked={blocked}
          onRequest={onRequest}
          parse={parseNominalSlots}
          help={`Used to decide how many machines to start for a backlog (${EXOMISER_SLOTS_RANGE[0]} = today's behaviour). Set it to the number of fast engines per machine only once those are running.`}
          input={({ text, setText, disabled, label }) => (
            <input value={text} disabled={disabled} aria-label={label} onChange={(e) => setText(e.target.value)} inputMode="numeric" className={smallInput('w-16')} />
          )}
        />
        <ValueRow
          label="Output files"
          configKey={EXOMISER_KEYS.outputFormats}
          fallback="all"
          exomiser={exomiser}
          blocked={blocked}
          onRequest={onRequest}
          parse={(t) => (EXOMISER_OUTPUT_FORMATS.includes(t) ? { value: t } : { error: 'Choose all or tsv_variant.' })}
          help={'"all" keeps every Exomiser output file; "tsv_variant" writes only the table the app reads.'}
          input={({ text, setText, disabled, label }) => (
            <select value={text} disabled={disabled} aria-label={label} onChange={(e) => setText(e.target.value)} className={cn(selectCls, 'max-md:h-10')}>
              {EXOMISER_OUTPUT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        />
      </div>

      {panelErrors.length > 0 && (
        <Banner tone="warning">
          Some readings are unavailable: {panelErrors.map(([k, v]) => `${k.replace('exomiser_fast.', '')} (${v})`).join('; ')}.
        </Banner>
      )}
    </Panel>
  );
}
