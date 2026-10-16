import { useState } from 'react';
import {
  adminSetConfig,
  DATAPLANE_BACKENDS,
  DATAPLANE_KEYS,
  validateDataplaneRelease,
} from '@/services/infraApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Banner, HelpBody, HelpPopover, Panel, StatusChip, inputCls, selectCls, toneText, DANGER_BTN } from './adminUi';
import { ChangeLine, Field, fmtRelative, fmtTime, Stat, Unavailable } from './infraShared';
import { CanaryEditor, depth, ToggleRow } from './routingShared';
import { SECTION_HELP } from './infraHelp';

const BACKEND_TEXT = {
  annovar: 'Old path (EC2 workers)',
  shadow: 'Old path serves; new path runs silently and is compared',
  v2: 'New path serves (Lambda + table)',
};

const DEFAULT_UNDO = {
  undoable: true,
  text: 'Change it back from this card at any time. There is no timer: the setting stays until you change it.',
};

function cfg(dataplane, key, fallback) {
  const v = dataplane?.config?.[key];
  return v === undefined || v === null ? fallback : v;
}

/** `after` is what the confirm dialog shows; `value` (default: `after`) is what is written. */
function writeRequest(key, label, before, after, onRequest, { danger = false, note, value = after, confirmLabel = 'Save', undo = DEFAULT_UNDO } = {}) {
  onRequest({
    title: `Data plane: ${label}`,
    confirmLabel,
    danger,
    rows: [{ label, before: Array.isArray(before) ? before.join(', ') || '–' : before, after: Array.isArray(after) ? after.join(', ') || '–' : after }],
    note,
    undo,
    run: () => adminSetConfig(key, value),
    merge: (response) => ({ kind: 'dataplaneConfig', configKey: key, response, fallbackValue: value }),
    successText: `${label} updated.`,
  });
}

/** One build (hg38 / hg19): who serves new jobs, and which data release the new path reads. */
function BackendRow({ build, backendKey, releaseKey, dataplane, blocked, onRequest }) {
  const backend = cfg(dataplane, backendKey, 'annovar');
  const release = cfg(dataplane, releaseKey, '');
  const [pick, setPick] = useState(null);
  const [rel, setRel] = useState(null);
  const [error, setError] = useState(null);
  const chosen = pick ?? backend;
  const relDraft = rel ?? release;
  const disabled = Boolean(blocked);

  const saveBackend = () => {
    if (chosen === backend) return;
    if (chosen !== 'annovar' && !release) {
      setError('Set a release id first: without one the router keeps using the old path.');
      return;
    }
    setError(null);
    writeRequest(backendKey, `${build} annotation path`, backend, chosen, onRequest, {
      danger: chosen === 'v2',
      confirmLabel: `Switch ${build} to ${chosen}`,
      undo: {
        undoable: true,
        text: `Switch ${build} back to ${backend} from this card, or use the kill switch to send every new job to the old path within ~45 s. Jobs already running finish where they started.`,
      },
      note: chosen === 'v2'
        ? 'Every new job for this build goes to the new path. If a job fails there it is re-run once on the old path automatically (when that fallback is on). Jobs already running are not moved.'
        : chosen === 'shadow'
          ? 'Users still get the old path\'s result. The new path also runs and each pair of results is compared; mismatches raise an alarm.'
          : 'New jobs go back to the old path. Jobs already running finish where they started.',
    });
  };
  const saveRelease = () => {
    const err = validateDataplaneRelease(relDraft, build);
    setError(err);
    if (err || relDraft.trim() === release) return;
    writeRequest(releaseKey, `${build} data release`, release || '–', relDraft.trim(), onRequest, {
      confirmLabel: 'Save release',
      undo: {
        undoable: true,
        text: 'The previous release stays available: enter its id here again to switch back.',
      },
      note: 'Which data release the new path reads. Changing it only affects jobs submitted afterwards; the previous release stays available to switch back.',
    });
  };

  return (
    <div className="grid gap-3 border-t border-[hsl(var(--wb-line))] py-3 first:border-t-0 first:pt-0 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="pt-0.5">
        <div className="font-mono text-xs font-medium text-foreground">{build}</div>
        <StatusChip tone={backend === 'annovar' ? 'muted' : 'info'} className="mt-1">{backend}</StatusChip>
      </div>
      <div className="min-w-0">
        <Field label="Who serves new jobs">
          <span className="flex flex-wrap items-center gap-2">
            <select value={chosen} disabled={disabled} onChange={(e) => setPick(e.target.value)} className={cn(selectCls, 'max-md:h-10')}>
              {DATAPLANE_BACKENDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || chosen === backend}
              onClick={saveBackend}
              className={cn('max-md:h-10', chosen === 'v2' && DANGER_BTN)}
            >
              Apply…
            </Button>
          </span>
        </Field>
        <p className="mt-1 text-xs text-muted-foreground">{BACKEND_TEXT[backend] || backend}</p>
      </div>
      <div className="min-w-0">
        <Field label="Data release">
          <span className="flex flex-wrap items-center gap-2">
            <input
              value={relDraft}
              disabled={disabled}
              onChange={(e) => setRel(e.target.value)}
              placeholder="hg38-20261012-r1"
              aria-label={`${build} data release`}
              className={cn(inputCls, 'w-44 font-mono max-md:h-10')}
            />
            <Button variant="outline" size="sm" disabled={disabled || relDraft.trim() === release} onClick={saveRelease} className="max-md:h-10">Save…</Button>
          </span>
        </Field>
        {error && <p role="alert" className="mt-1 text-xs text-[var(--error)]">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Data plane (annotation v2): which path serves ANNOVAR jobs, per build, plus the new path's health. The old path is the
 * default and the answer to every error; the kill switch forces it everywhere within ~45 s.
 * `lastChange` (optional) is the newest matching audit row.
 */
export default function DataPlaneCard({ dataplane, errors, blockedReason, onRequest, lastChange }) {
  const panelErrors = Object.entries(errors || {}).filter(([k]) => k === 'dataplane' || k.startsWith('dataplane.'));
  const blocked = blockedReason || (errors?.dataplane ? errors.dataplane : null) || (dataplane ? null : 'no data plane data');
  const help = (
    <HelpPopover title="Data plane (annotation v2)" align="start">
      <HelpBody what={SECTION_HELP.dataplane.what} items={SECTION_HELP.dataplane.items} />
    </HelpPopover>
  );
  if (!dataplane) {
    return <Panel title="Data plane (annotation v2)" help={help}><Unavailable reason={blocked} /></Panel>;
  }
  const tables = dataplane.release_tables || [];
  const parity = dataplane.parity;
  const killOn = Boolean(cfg(dataplane, DATAPLANE_KEYS.kill, false));
  const dlqCount = dataplane.dlq ? (dataplane.dlq.visible || 0) + (dataplane.dlq.in_flight || 0) : 0;
  const b38 = cfg(dataplane, DATAPLANE_KEYS.backendHg38, 'annovar');
  const b19 = cfg(dataplane, DATAPLANE_KEYS.backendHg19, 'annovar');

  let chip;
  if (killOn) chip = { tone: 'warning', text: 'Kill switch on: old path everywhere' };
  else if (dlqCount > 0) chip = { tone: 'error', text: `${dlqCount} failed job${dlqCount === 1 ? '' : 's'}` };
  else if (b38 === 'annovar' && b19 === 'annovar') chip = { tone: 'success', text: 'Old path serving' };
  else chip = { tone: 'info', text: `hg38 ${b38} · hg19 ${b19}` };

  return (
    <Panel
      title="Data plane (annotation v2)"
      badge={<StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
      help={help}
      bodyClassName="flex flex-col gap-4"
    >
      {!dataplane.queue_configured && (
        <Banner tone="warning">
          The new path is not wired to this API (no queue configured), so every job uses the old path whatever is set below.
        </Banner>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        <Stat label="New-path queue" value={depth(dataplane.queue)} />
        <Stat
          label="Failed (dead-letter)"
          value={dataplane.dlq ? `${dlqCount}` : '–'}
          tone={dlqCount ? toneText('error') : undefined}
        />
        <Stat label="Lambda version (live)" value={dataplane.lambda?.version ?? '–'} />
        <Stat label="Last compare" value={parity?.last_at ? fmtRelative(parity.last_at) : '–'} />
      </div>
      {parity && (
        <p className="text-xs text-muted-foreground">
          Last {parity.shown} shadow comparisons: {parity.identical} identical, {parity.mismatch} different
          {parity.mismatch ? ' (do not switch to v2 until this is 0: see the alarm)' : ''}.
          {parity.last_at ? ` Latest ${fmtTime(parity.last_at)}.` : ''}
        </p>
      )}
      {tables.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Data releases:{' '}
          {tables.filter(Boolean).map((t) => `${t.release_id} (${(t.item_count ?? 0).toLocaleString()} variants, ${t.table_class === 'STANDARD_INFREQUENT_ACCESS' ? 'low-cost storage' : 'standard storage'}, ${String(t.status).toLowerCase()})`).join('; ')}
        </p>
      )}

      <ChangeLine by={lastChange?.actor} at={lastChange?.at} reason={lastChange?.reason} />

      <div>
        <h3 className="mb-2 text-[13px] font-medium text-foreground">Routing by build</h3>
        <BackendRow build="hg38" backendKey={DATAPLANE_KEYS.backendHg38} releaseKey={DATAPLANE_KEYS.releaseHg38}
          dataplane={dataplane} blocked={blocked} onRequest={onRequest} />
        <BackendRow build="hg19" backendKey={DATAPLANE_KEYS.backendHg19} releaseKey={DATAPLANE_KEYS.releaseHg19}
          dataplane={dataplane} blocked={blocked} onRequest={onRequest} />
      </div>

      <CanaryEditor
        users={cfg(dataplane, DATAPLANE_KEYS.canaryUsers, [])}
        backend={cfg(dataplane, DATAPLANE_KEYS.canaryBackend, 'shadow')}
        options={DATAPLANE_BACKENDS}
        blocked={blocked}
        dangerValue="v2"
        intro="These accounts get the path below regardless of the setting above. Use it to try the new path yourself before anyone else."
        onSaveUsers={(users, list) => writeRequest(DATAPLANE_KEYS.canaryUsers, 'Canary accounts', users, list, onRequest, { confirmLabel: 'Save accounts' })}
        onSavePath={(backend, chosen) => writeRequest(DATAPLANE_KEYS.canaryBackend, 'Canary path', backend, chosen, onRequest, { danger: chosen === 'v2', confirmLabel: `Serve canaries from ${chosen}` })}
      />

      <div className="border-t border-[hsl(var(--wb-line))] pt-1">
        <ToggleSet dataplane={dataplane} blocked={blocked} onRequest={onRequest} />
      </div>

      {panelErrors.length > 0 && (
        <Banner tone="warning">
          Some data plane readings are unavailable: {panelErrors.map(([k, v]) => `${k.replace('dataplane.', '')} (${v})`).join('; ')}.
        </Banner>
      )}
    </Panel>
  );
}

function ToggleSet({ dataplane, blocked, onRequest }) {
  const toggle = (label, configKey, { danger, onWhenText, offWhenText }) => {
    const on = Boolean(cfg(dataplane, configKey, false));
    writeRequest(configKey, label, on ? 'on' : 'off', on ? 'off' : 'on', onRequest, {
      value: !on,
      danger: danger && !on,
      confirmLabel: `Turn ${on ? 'off' : 'on'}`,
      note: on ? offWhenText : onWhenText,
    });
  };
  const row = (label, configKey, opts) => (
    <ToggleRow
      label={label}
      on={Boolean(cfg(dataplane, configKey, false))}
      blocked={blocked}
      danger={opts.danger}
      help={opts.help}
      onToggle={() => toggle(label, configKey, opts)}
    />
  );
  return (
    <>
      {row('Kill switch', DATAPLANE_KEYS.kill, {
        danger: true,
        help: 'Force every new job back to the old path, everywhere, within ~45 s. Jobs already running finish where they started.',
        onWhenText: 'All new annotation jobs use the old path, including canary accounts.',
        offWhenText: 'The paths set above apply again.',
      })}
      {row('Fall back to the old path on failure', DATAPLANE_KEYS.fallback, {
        help: 'If a job fails on the new path, run it once more on the old path instead of showing a failure. Keep this on while the old fleet exists.',
        onWhenText: 'A failed new-path job is re-run once on the old path.',
        offWhenText: 'A failed new-path job fails for the user.',
      })}
      {row('Compare shadow results', DATAPLANE_KEYS.shadowParity, {
        help: 'After a shadowed job, compare the old and new result files cell by cell and record the outcome.',
        onWhenText: 'Each shadowed job is compared; differences raise an alarm.',
        offWhenText: 'Shadow jobs still run but are not compared.',
      })}
    </>
  );
}
