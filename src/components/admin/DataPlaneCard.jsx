import { useState } from 'react';
import {
  adminSetConfig,
  DATAPLANE_BACKENDS,
  DATAPLANE_KEYS,
  parseCanaryUsers,
  validateDataplaneRelease,
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
  annovar: 'Old path (EC2 workers)',
  shadow: 'Old path serves; new path runs silently and is compared',
  v2: 'New path serves (Lambda + table)',
};

function cfg(dataplane, key, fallback) {
  const v = dataplane?.config?.[key];
  return v === undefined || v === null ? fallback : v;
}

/** `after` is what the confirm dialog shows; `value` (default: `after`) is what is written. */
function writeRequest(key, label, before, after, onRequest, { danger = false, note, value = after } = {}) {
  onRequest({
    title: `Data plane: ${label}`,
    danger,
    rows: [{ label, before: Array.isArray(before) ? before.join(', ') || '—' : before, after: Array.isArray(after) ? after.join(', ') || '—' : after }],
    note,
    run: () => adminSetConfig(key, value),
    merge: (response) => ({ kind: 'dataplaneConfig', configKey: key, response, fallbackValue: value }),
    successText: `${label} updated.`,
  });
}

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
    writeRequest(releaseKey, `${build} data release`, release || '—', relDraft.trim(), onRequest, {
      note: 'Which data release the new path reads. Changing it only affects jobs submitted afterwards; the previous release stays available to switch back.',
    });
  };

  return (
    <tr className="text-xs align-middle">
      <td className="px-3 py-2 border-b font-medium" style={{ ...cellStyle, color: 'var(--text-primary)' }}>{build}</td>
      <td className="px-3 py-2 border-b" style={cellStyle}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={chosen} disabled={disabled} onChange={(e) => setPick(e.target.value)}
            className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50" style={inputStyle}>
            {DATAPLANE_BACKENDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="button" disabled={disabled || chosen === backend} onClick={saveBackend}
            className={secondaryButtonClass} style={chosen === 'v2' ? dangerButtonStyle : secondaryButtonStyle}>
            Apply
          </button>
        </div>
        <div className="text-2xs mt-1" style={mutedText}>{BACKEND_TEXT[backend] || backend}</div>
      </td>
      <td className="px-3 py-2 border-b" style={cellStyle}>
        <div className="flex flex-wrap items-center gap-2">
          <input value={relDraft} disabled={disabled} onChange={(e) => setRel(e.target.value)} placeholder="hg38-20261012-r1"
            className="px-2 py-1 text-2xs rounded-md border w-44 disabled:opacity-50" style={inputStyle} />
          <button type="button" disabled={disabled || relDraft.trim() === release} onClick={saveRelease}
            className={secondaryButtonClass} style={secondaryButtonStyle}>Save</button>
        </div>
        {error && <p className="text-2xs mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
      </td>
    </tr>
  );
}

function ToggleRow({ label, help, configKey, dataplane, blocked, onRequest, danger, onWhenText, offWhenText }) {
  const on = Boolean(cfg(dataplane, configKey, false));
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

function CanaryEditor({ dataplane, blocked, onRequest }) {
  const users = cfg(dataplane, DATAPLANE_KEYS.canaryUsers, []);
  const backend = cfg(dataplane, DATAPLANE_KEYS.canaryBackend, 'shadow');
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
        These accounts (email or user id, one per line) get the path below regardless of the setting above. Use it to try the new path yourself before anyone else.
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <textarea value={draft} rows={3} disabled={disabled} onChange={(e) => setText(e.target.value)}
          className="px-2 py-1 text-2xs rounded-md border min-w-[240px] disabled:opacity-50" style={inputStyle} />
        <select value={chosen} disabled={disabled} onChange={(e) => setPick(e.target.value)}
          className="px-2 py-1 text-2xs rounded-md border disabled:opacity-50" style={inputStyle}>
          {DATAPLANE_BACKENDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex flex-col gap-1">
          <button type="button" disabled={disabled || same} className={secondaryButtonClass} style={secondaryButtonStyle}
            onClick={() => writeRequest(DATAPLANE_KEYS.canaryUsers, 'Canary accounts', users, list, onRequest)}>Save accounts</button>
          <button type="button" disabled={disabled || chosen === backend} className={secondaryButtonClass}
            style={chosen === 'v2' ? dangerButtonStyle : secondaryButtonStyle}
            onClick={() => writeRequest(DATAPLANE_KEYS.canaryBackend, 'Canary path', backend, chosen, onRequest, { danger: chosen === 'v2' })}>
            Save path
          </button>
        </div>
      </div>
    </div>
  );
}

function depth(q) {
  if (!q) return '—';
  return `${q.visible ?? 0} waiting / ${q.in_flight ?? 0} running`;
}

/**
 * Data plane (annotation v2): which path serves ANNOVAR jobs, per build, plus the new path's health. The old path is the
 * default and the answer to every error; the kill switch forces it everywhere within ~45 s.
 */
export default function DataPlaneCard({ dataplane, errors, blockedReason, onRequest }) {
  const panelErrors = Object.entries(errors || {}).filter(([k]) => k === 'dataplane' || k.startsWith('dataplane.'));
  const blocked = blockedReason || (errors?.dataplane ? errors.dataplane : null) || (dataplane ? null : 'no data plane data');
  if (!dataplane) return <Unavailable reason={blocked} />;
  const tables = dataplane.release_tables || [];
  const parity = dataplane.parity;
  return (
    <div className="rounded-xl border p-4 space-y-4" style={cardStyle}>
      {!dataplane.queue_configured && (
        <p className="text-2xs" style={{ color: 'var(--warning)' }}>
          The new path is not wired to this API (no queue configured), so every job uses the old path whatever is set below.
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="New-path queue" value={depth(dataplane.queue)} />
        <Stat label="Failed (dead-letter)" value={dataplane.dlq ? `${(dataplane.dlq.visible || 0) + (dataplane.dlq.in_flight || 0)}` : '—'}
          tone={dataplane.dlq && (dataplane.dlq.visible || dataplane.dlq.in_flight) ? 'var(--error)' : undefined} />
        <Stat label="Lambda version (live)" value={dataplane.lambda?.version ?? '—'} />
        <Stat label="Last compare" value={parity?.last_at ? fmtRelative(parity.last_at) : '—'} />
      </div>
      {parity && (
        <p className="text-2xs" style={mutedText}>
          Last {parity.shown} shadow comparisons: {parity.identical} identical, {parity.mismatch} different
          {parity.mismatch ? ' (do not switch to v2 until this is 0: see the alarm)' : ''}.
          {parity.last_at ? ` Latest ${fmtTime(parity.last_at)}.` : ''}
        </p>
      )}
      {tables.length > 0 && (
        <div className="text-2xs" style={mutedText}>
          Data releases: {tables.filter(Boolean).map((t) => `${t.release_id} (${(t.item_count ?? 0).toLocaleString()} variants, ${t.table_class === 'STANDARD_INFREQUENT_ACCESS' ? 'low-cost storage' : 'standard storage'}, ${String(t.status).toLowerCase()})`).join('; ')}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: '560px' }}>
          <thead>
            <tr className="text-2xs" style={mutedText}>
              <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Build</th>
              <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Who serves new jobs</th>
              <th className="px-3 py-2 font-medium border-b" style={cellStyle}>Data release</th>
            </tr>
          </thead>
          <tbody>
            <BackendRow build="hg38" backendKey={DATAPLANE_KEYS.backendHg38} releaseKey={DATAPLANE_KEYS.releaseHg38}
              dataplane={dataplane} blocked={blocked} onRequest={onRequest} />
            <BackendRow build="hg19" backendKey={DATAPLANE_KEYS.backendHg19} releaseKey={DATAPLANE_KEYS.releaseHg19}
              dataplane={dataplane} blocked={blocked} onRequest={onRequest} />
          </tbody>
        </table>
      </div>

      <CanaryEditor dataplane={dataplane} blocked={blocked} onRequest={onRequest} />

      <div>
        <ToggleRow label="Kill switch" configKey={DATAPLANE_KEYS.kill} dataplane={dataplane} blocked={blocked} onRequest={onRequest} danger
          help="Force every new job back to the old path, everywhere, within ~45 s. Jobs already running finish where they started."
          onWhenText="All new annotation jobs use the old path, including canary accounts."
          offWhenText="The paths set above apply again." />
        <ToggleRow label="Fall back to the old path on failure" configKey={DATAPLANE_KEYS.fallback} dataplane={dataplane} blocked={blocked} onRequest={onRequest}
          help="If a job fails on the new path, run it once more on the old path instead of showing a failure. Keep this on while the old fleet exists."
          onWhenText="A failed new-path job is re-run once on the old path." offWhenText="A failed new-path job fails for the user." />
        <ToggleRow label="Compare shadow results" configKey={DATAPLANE_KEYS.shadowParity} dataplane={dataplane} blocked={blocked} onRequest={onRequest}
          help="After a shadowed job, compare the old and new result files cell by cell and record the outcome."
          onWhenText="Each shadowed job is compared; differences raise an alarm." offWhenText="Shadow jobs still run but are not compared." />
      </div>
      {panelErrors.length > 0 && (
        <p className="text-2xs" style={{ color: 'var(--warning)' }}>
          Some data plane readings are unavailable: {panelErrors.map(([k, v]) => `${k.replace('dataplane.', '')} (${v})`).join('; ')}.
        </p>
      )}
    </div>
  );
}
