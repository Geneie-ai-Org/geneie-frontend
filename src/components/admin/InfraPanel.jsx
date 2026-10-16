import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  adminGetConfig,
  adminGetInfraStatus,
  adminListAudit,
  MODULE1_KEYS,
  WORKER_KINDS,
} from '@/services/infraApi';
import { Dismissible } from '@/components/motion';
import { AdminHeader, Banner, Bar, HelpBody, HelpPopover, Panel, StateBlock } from './adminUi';
import {
  ConfirmModal,
  describeApiError,
  findPanelError,
  fmtRelative,
  fmtTime,
  latestAudit,
  targetText,
} from './infraShared';
import WorkerCard from './WorkerCard';
import Module1Card from './Module1Card';
import IntakePanel from './IntakePanel';
import DataPlaneCard from './DataPlaneCard';
import ExomiserFastCard from './ExomiserFastCard';
import { AuditTable, DlqSection, EcsTable, HealthOverview, PgxCard, ReadOnlyBadge } from './InfraReadOnly';
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
  if (m.kind === 'dataplaneConfig') {
    if (!prev.dataplane) return prev;
    const value = r && typeof r === 'object' && 'value' in r ? r.value : m.fallbackValue;
    return { ...prev, dataplane: { ...prev.dataplane, config: { ...(prev.dataplane.config || {}), [m.configKey]: value } } };
  }
  if (m.kind === 'exomiserConfig') {
    if (!prev.exomiser_fast) return prev;
    const value = r && typeof r === 'object' && 'value' in r ? r.value : m.fallbackValue;
    return { ...prev, exomiser_fast: { ...prev.exomiser_fast, config: { ...(prev.exomiser_fast.config || {}), [m.configKey]: value } } };
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

/** A titled group of cards. The heading is a landmark so the page is navigable by section. */
function Group({ title, help, badge, children }) {
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-2.5 flex items-center gap-1.5 px-1">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {badge}
        {help && (
          <HelpPopover title={title} align="start">
            <HelpBody what={help.what} items={help.items} />
          </HelpPopover>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const isWorkerAction = (row) => /worker|floor|raise|scale/i.test(String(row.action || ''));

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

  const lastFetchError = useRef(''); // keeps the banner text while it collapses out
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
    toast.success(request.successText || 'Saved.', {
      description: 'Takes effect within ~1-2 min. Recorded in the audit log.',
    });
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

  /* "Last changed by / at" for each card, from the audit rows already loaded. Deliberately
   * narrow matches: the audit list is only the last N and its target shape is loose, so a card
   * shows the line only when a row clearly belongs to it. */
  const lastChange = useMemo(() => ({
    annovar: latestAudit(audit, (r) => isWorkerAction(r) && targetText(r).includes('annovar')),
    exomiser: latestAudit(audit, (r) => isWorkerAction(r) && targetText(r).includes('exomiser') && !targetText(r).includes('dataplane')),
    module1: latestAudit(audit, (r) => targetText(r).includes('module1')),
    dataplane: latestAudit(audit, (r) => targetText(r).includes('dataplane.annotation')),
    exomiserFast: latestAudit(audit, (r) => targetText(r).includes('dataplane.exomiser')),
  }), [audit]);

  if (fetchError) lastFetchError.current = fetchError;
  const asOf = status?.as_of ? `As of ${fmtTime(status.as_of)} (${fmtRelative(status.as_of)})` : 'Not loaded yet';

  return (
    <div>
      <AdminHeader
        current="infra"
        title="Infra"
        subtitle={`${asOf} · refreshes every 30 s`}
        help={(
          <HelpPopover title="How this page works" align="start">
            <HelpBody
              what={INTRO[0]}
              items={[
                ['What the levers do', INTRO[1]],
                ['When changes land', INTRO[2]],
                ['Refreshing', `Auto-refreshes every 30 s while this browser tab is visible (the server caches ~15 s).${fetchedAt ? ` Last fetched ${fmtTime(fetchedAt)}.` : ''}`],
              ]}
            />
          </HelpPopover>
        )}
        actions={(
          <Button variant="outline" size="sm" onClick={() => { load(); loadAudit(); }} disabled={loading}>
            <RefreshCw className={loading ? 'size-3.5 animate-spin motion-reduce:animate-none' : 'size-3.5'} aria-hidden="true" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        )}
      />

      <Dismissible show={Boolean(fetchError && status)}>
        <div className="mb-4">
          <Banner
            tone="error"
            action={<Button variant="ghost" size="xs" onClick={load} disabled={loading}>Retry</Button>}
          >
            Could not refresh status: {fetchError || lastFetchError.current}. Showing the last good snapshot; controls are disabled until a refresh succeeds.
          </Banner>
        </div>
      </Dismissible>

      <HealthOverview status={status} fetchError={fetchError} onRetry={load} retrying={loading} />

      {!status && (
        <div className="mt-8" aria-hidden={!fetchError}>
          {fetchError ? (
            <Panel>
              <StateBlock tone="error" title="Controls are hidden">
                Workers, Module-1, routing and intake controls stay hidden until a status snapshot loads, so nothing can be written blind. Use Retry above.
              </StateBlock>
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="wb-card space-y-3 p-4">
                  <Bar className="h-4 w-40" />
                  <div className="grid grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((j) => <div key={j} className="space-y-1.5"><Bar className="w-20" /><Bar className="h-4 w-12" /></div>)}</div>
                  <Bar className="h-24 w-full rounded-2xl" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {status && (<>
      <Group title="Workers">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {WORKER_KINDS.map((kind) => (
            <WorkerCard
              key={kind}
              kind={kind}
              worker={status?.workers?.[kind] || null}
              bounds={bounds}
              blockedReason={globalBlock || findPanelError(errors, ['workers', `workers.${kind}`, kind])}
              onRequest={setConfirm}
              lastChange={lastChange[kind]}
            />
          ))}
        </div>
        <PgxCard ecs={status?.ecs} intake={status?.intake} error={findPanelError(errors, ['ecs'])} />
      </Group>

      <Group title="Module-1">
        <Module1Card
          module1={status?.module1 || null}
          bounds={bounds}
          defaults={capDefaults}
          blockedReason={globalBlock || findPanelError(errors, ['module1'])}
          onRequest={setConfirm}
          lastChange={lastChange.module1}
        />
      </Group>

      <Group title="Annotation routing">
        <DataPlaneCard
          dataplane={status?.dataplane || null}
          errors={errors}
          blockedReason={globalBlock}
          onRequest={setConfirm}
          lastChange={lastChange.dataplane}
        />
        <ExomiserFastCard
          exomiser={status?.exomiser_fast || null}
          errors={errors}
          blockedReason={globalBlock}
          onRequest={setConfirm}
          lastChange={lastChange.exomiserFast}
        />
      </Group>

      <Group title="Pause intake" help={SECTION_HELP.intake}>
        <IntakePanel
          intake={status?.intake || null}
          errors={errors}
          bounds={bounds}
          blockedReason={globalBlock}
          onRequest={setConfirm}
        />
      </Group>

      </>)}

      <Group title="Read-only status" badge={<ReadOnlyBadge />}>
        {status && (
          <>
            <EcsTable ecs={status.ecs} error={findPanelError(errors, ['ecs'])} />
            <DlqSection
              dlqs={status.dlqs}
              deadLetters={status.dead_letters}
              dlqError={findPanelError(errors, ['dlqs'])}
              deadLettersError={findPanelError(errors, ['dead_letters'])}
            />
          </>
        )}
        <AuditTable audit={audit} error={auditError} limit={AUDIT_LIMIT} onReload={loadAudit} />
      </Group>

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
