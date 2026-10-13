import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminGetConfig,
  adminGetInfraStatus,
  adminListAudit,
  MODULE1_KEYS,
  WORKER_KINDS,
} from '@/services/infraApi';
import {
  ConfirmModal,
  describeApiError,
  findPanelError,
  fmtRelative,
  fmtTime,
  mutedText,
  Section,
} from './infraShared';
import WorkerCard from './WorkerCard';
import Module1Card from './Module1Card';
import IntakePanel from './IntakePanel';
import { AlarmStrip, AuditTable, DlqSection, EcsTable } from './InfraReadOnly';
import { INTRO, SECTION_HELP } from './infraHelp';

const POLL_MS = 30_000;

/** The status endpoint is cached ~15 s server-side; re-read just after that once a write lands. */
const POST_WRITE_REFETCH_MS = 16_000;

const AUDIT_LIMIT = 50;

function looksLikeWorkerPanel(obj) {
  return Boolean(obj && typeof obj === 'object'
    && ('asg' in obj || 'queue' in obj || 'floor' in obj || 'max_raise' in obj || 'warm_pool' in obj));
}

/**
 * Patch a write's response into the last snapshot so the page reflects it before the cached
 * status endpoint catches up. Anything not recognisably shaped is left for the next poll.
 */
function applyMerge(prev, m) {
  if (!prev || !m) return prev;
  const r = m.response;
  if (m.kind === 'worker') {
    const panel = looksLikeWorkerPanel(r) ? r
      : looksLikeWorkerPanel(r?.worker) ? r.worker
        : looksLikeWorkerPanel(r?.workers?.[m.workerKind]) ? r.workers[m.workerKind]
          : null;
    if (!panel) return prev;
    return { ...prev, workers: { ...(prev.workers || {}), [m.workerKind]: { ...(prev.workers?.[m.workerKind] || {}), ...panel } } };
  }
  if (m.kind === 'intake') {
    let entry;
    if (!m.paused) entry = null;
    else if (r?.intake && m.intakeKind in r.intake) entry = r.intake[m.intakeKind];
    else if (r?.paused_until) entry = r;
    else if (r?.until) entry = { paused_until: r.until, by: r.by, reason: r.reason };
    else if (r?.value?.until) entry = { paused_until: r.value.until, by: r.value.by, reason: r.value.reason };
    else return prev;
    return { ...prev, intake: { ...(prev.intake || {}), [m.intakeKind]: entry } };
  }
  if (m.kind === 'config' || m.kind === 'module1Cap') {
    if (!prev.module1) return prev;
    let value;
    if (r && typeof r === 'object' && 'value' in r && (!r.key || r.key === m.configKey)) value = r.value;
    else if (m.kind === 'module1Cap') value = m.cap;
    else if (m.fallbackValue !== undefined) value = m.fallbackValue;
    else return prev;
    const next = { ...prev.module1, config: { ...(prev.module1.config || {}), [m.configKey]: value } };
    if (m.kind === 'module1Cap' && m.lane) {
      // Keep the live lane in step so the stepper and next "before" show the new cap.
      next[m.lane] = {
        ...(prev.module1[m.lane] || {}),
        cap: m.cap,
        cap_until: m.hours === null || m.hours === undefined
          ? null
          : new Date(Date.now() + m.hours * 3600 * 1000).toISOString(),
      };
    }
    return { ...prev, module1: next };
  }
  return prev;
}

/**
 * Body of the admin infra page (/admin-haha/infra): one aggregated status read, polled every 30 s while the browser
 * tab is visible, plus the levers the contract allows. Every write goes through ConfirmModal.
 *
 * "Never write blind": a panel's levers are disabled when its key is in `errors`, when its data
 * is missing, when the bounds it needs are missing, or when the latest refresh failed.
 */
export default function InfraPanel() {
  const [status, setStatus] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditError, setAuditError] = useState(null);
  const [capDefaults, setCapDefaults] = useState({ gpu: null, cpu: null });
  const [confirm, setConfirm] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }

  const inFlight = useRef(false);
  const refetchTimer = useRef(null);
  const mounted = useRef(true);
  // After a write the server cache can still hold the pre-write snapshot; background polls
  // wait this out so they do not briefly undo the merged response.
  const quietUntil = useRef(0);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await adminGetInfraStatus();
      if (!mounted.current) return;
      setStatus(data);
      setFetchError(null);
      setFetchedAt(new Date().toISOString());
    } catch (error) {
      if (mounted.current) setFetchError(describeApiError(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const rows = await adminListAudit({ limit: AUDIT_LIMIT });
      if (!mounted.current) return;
      setAudit(rows);
      setAuditError(null);
    } catch (error) {
      if (mounted.current) setAuditError(describeApiError(error));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    loadAudit();
    // Recorded defaults decide whether a cap change is a "raise" (suggest a 4 h expiry).
    Promise.allSettled([adminGetConfig(MODULE1_KEYS.gpuCap), adminGetConfig(MODULE1_KEYS.cpuCap)]).then(([g, c]) => {
      if (!mounted.current) return;
      setCapDefaults({
        gpu: g.status === 'fulfilled' ? g.value?.default ?? null : null,
        cpu: c.status === 'fulfilled' ? c.value?.default ?? null : null,
      });
    });

    // Poll only while the browser tab is visible; catch up immediately when it comes back.
    const id = setInterval(() => {
      if (!document.hidden && Date.now() >= quietUntil.current) load();
    }, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden && Date.now() >= quietUntil.current) load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [load, loadAudit]);

  const onWriteDone = useCallback((request, response) => {
    if (request.merge) {
      const m = request.merge(response);
      setStatus((prev) => applyMerge(prev, m));
    }
    request.onSuccess?.();
    setConfirm(null);
    setMessage({ type: 'ok', text: `${request.successText || 'Saved.'} Takes effect within ~1-2 min.` });
    loadAudit();
    quietUntil.current = Date.now() + POST_WRITE_REFETCH_MS;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(load, POST_WRITE_REFETCH_MS);
  }, [load, loadAudit]);

  const errors = status?.errors || {};
  const bounds = status?.bounds || null;
  const globalBlock = !status
    ? 'status not loaded'
    : fetchError
      ? 'the last refresh failed'
      : findPanelError(errors, ['bounds']) || (bounds ? null : 'bounds missing');

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-1">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Infra</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin-haha" className="text-xs underline" style={{ color: 'var(--text-secondary)' }}>
            &larr; Users &amp; tiers
          </Link>
          <span className="text-2xs" style={mutedText}>
            {status?.as_of ? `As of ${fmtTime(status.as_of)} (${fmtRelative(status.as_of)})` : 'Not loaded yet'}
          </span>
          <button
            type="button"
            onClick={() => { load(); loadAudit(); }}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-50"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      <div
        className="rounded-xl border p-4 mt-3 mb-4 text-xs space-y-1"
        style={{ backgroundColor: 'var(--bg-surface-raised)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
      >
        {INTRO.map((line) => <p key={line}>{line}</p>)}
      </div>
      <p className="text-2xs mb-4" style={mutedText}>
        Auto-refreshes every 30 s while this browser tab is visible (the server caches ~15 s).
        {fetchedAt ? ` Last fetched ${fmtTime(fetchedAt)}.` : ''}
      </p>

      {fetchError && (
        <p className="text-xs mb-3" style={{ color: 'var(--error)' }}>
          Could not refresh status: {fetchError}
          {status ? ' Showing the last good snapshot; levers are disabled until a refresh succeeds.' : ''}
        </p>
      )}
      {message && (
        <p className="text-xs mb-3" style={{ color: message.type === 'error' ? 'var(--error)' : 'var(--text-tertiary)' }}>
          {message.text}
        </p>
      )}

      <Section title="Alarms" help={SECTION_HELP.alarms}>
        <AlarmStrip alarms={status?.alarms} error={findPanelError(errors, ['alarms']) || (status ? null : fetchError)} />
      </Section>

      <Section title="Workers" help={SECTION_HELP.workers}>
        <div className="grid gap-4 md:grid-cols-2">
          {WORKER_KINDS.map((kind) => (
            <WorkerCard
              key={kind}
              kind={kind}
              worker={status?.workers?.[kind] || null}
              bounds={bounds}
              blockedReason={globalBlock || findPanelError(errors, ['workers', `workers.${kind}`, kind])}
              onRequest={setConfirm}
            />
          ))}
        </div>
      </Section>

      <Section title="Module-1" help={SECTION_HELP.module1}>
        <Module1Card
          module1={status?.module1 || null}
          bounds={bounds}
          defaults={capDefaults}
          blockedReason={globalBlock || findPanelError(errors, ['module1'])}
          onRequest={setConfirm}
        />
      </Section>

      <Section title="Pause intake" help={SECTION_HELP.intake}>
        <IntakePanel
          intake={status?.intake || null}
          errors={errors}
          bounds={bounds}
          blockedReason={globalBlock}
          onRequest={setConfirm}
        />
      </Section>

      <Section title="ECS services" help={SECTION_HELP.ecs}>
        <EcsTable ecs={status?.ecs} error={findPanelError(errors, ['ecs'])} />
      </Section>

      <Section title="Dead-letter queues (failed jobs)" help={SECTION_HELP.dlqs}>
        <DlqSection
          dlqs={status?.dlqs}
          deadLetters={status?.dead_letters}
          dlqError={findPanelError(errors, ['dlqs'])}
          deadLettersError={findPanelError(errors, ['dead_letters'])}
        />
      </Section>

      <Section
        title={`Audit (last ${AUDIT_LIMIT})`}
        help={SECTION_HELP.audit}
        right={(
          <button
            type="button"
            onClick={loadAudit}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            Reload
          </button>
        )}
      >
        <AuditTable audit={audit} error={auditError} />
      </Section>

      {confirm && (
        <ConfirmModal
          key={confirm.title}
          request={confirm}
          onClose={() => setConfirm(null)}
          onDone={onWriteDone}
        />
      )}
    </div>
  );
}
