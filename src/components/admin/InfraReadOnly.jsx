import { Lock } from 'lucide-react';
import { INTAKE_KINDS } from '@/services/infraApi';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Banner, HelpBody, HelpPopover, Panel, StatusChip, tdCls, thCls } from './adminUi';
import { fmtRelative, fmtTime, fmtValue, isFutureIso } from './infraShared';
import { explainAlarm } from './infraAlarmHelp';
import { SECTION_HELP } from './infraHelp';

/* Read-only parts of the Infra page: the health overview, alarms, ECS services, PGx, DLQs and the
 * audit log. Nothing here has a control. The read-only panels share one look (dashed border,
 * muted fill, lock badge) so they are never mistaken for a lever. */

const KIND_LABELS = { annovar: 'ANNOVAR', exomiser: 'Exomiser', module1: 'Module-1', pgx: 'PGx' };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function ReadOnlyBadge() {
  return (
    <Badge variant="muted" className="h-5 gap-1 rounded-full px-2 text-2xs">
      <Lock className="size-3" aria-hidden="true" />
      Read-only
    </Badge>
  );
}

function helpFor(key, title) {
  const h = SECTION_HELP[key];
  if (!h) return null;
  return (
    <HelpPopover title={title} align="start">
      <HelpBody what={h.what} items={h.items} />
    </HelpPopover>
  );
}

/* ---- health overview ---------------------------------------------------------------- */

const TONE_RANK = { error: 3, warning: 2, info: 1, success: 0, muted: 0 };

function buildChips(status, fetchError) {
  const chips = [];
  const add = (key, tone, text, title) => chips.push({ key, tone, text, title });

  if (fetchError) add('fetch', 'error', 'Status refresh failed', 'Showing the last good snapshot; controls are disabled until a refresh succeeds.');

  const alarms = status.alarms;
  if (!Array.isArray(alarms)) add('alarms', 'warning', 'Alarms unavailable');
  else if (alarms.length) add('alarms', 'error', `${alarms.length} alarm${alarms.length === 1 ? '' : 's'} firing`);
  else add('alarms', 'success', 'No alarms');

  const m1 = status.module1;
  if (!m1) add('module1', 'warning', 'Module-1 unavailable');
  else if (!m1.head_in_service) add('module1', 'error', 'Module-1 head box down', 'No Module-1 job starts while the head box is down.');
  else if (m1.gpu_capacity_unavailable) add('module1', 'warning', 'Module-1 GPU capacity unavailable', 'Jobs fall back to the slower CPU lane.');
  else add('module1', 'success', `Module-1 ok · ${num(m1.queued_gpu) + num(m1.queued_cpu)} queued`);

  for (const kind of ['annovar', 'exomiser']) {
    const w = status.workers?.[kind];
    const label = KIND_LABELS[kind];
    if (!w) { add(kind, 'warning', `${label} unavailable`); continue; }
    const running = num(w.asg?.in_service);
    const waiting = num(w.queue?.visible);
    if (waiting > 0 && running === 0) add(kind, 'warning', `${label} queue waiting, no workers`, 'Workers start within ~1-2 min if the warm pool is ready.');
    else add(kind, 'success', `${label} ok · ${running} running · ${waiting} queued`);
  }

  if (!status.intake) add('intake', 'warning', 'Intake unavailable');
  else {
    const paused = INTAKE_KINDS.filter((k) => status.intake[k] && isFutureIso(status.intake[k].paused_until));
    if (paused.length) add('intake', 'warning', `Intake paused: ${paused.map((k) => KIND_LABELS[k]).join(', ')}`, 'New submissions get a maintenance message; running jobs are untouched.');
    else add('intake', 'success', 'Intake open');
  }

  const dp = status.dataplane;
  if (!dp) add('dataplane', 'warning', 'Data plane unavailable');
  else {
    const dlq = dp.dlq ? num(dp.dlq.visible) + num(dp.dlq.in_flight) : 0;
    const killOn = Boolean(dp.config?.['dataplane.annotation.kill_switch']);
    if (dlq > 0) add('dataplane', 'error', `Data plane: ${dlq} failed job${dlq === 1 ? '' : 's'}`);
    else if (killOn) add('dataplane', 'warning', 'Data plane kill switch on', 'Every new job uses the old path.');
    else if (num(dp.parity?.mismatch) > 0) add('dataplane', 'warning', `Data plane: ${dp.parity.mismatch} result differences`, 'Do not switch to v2 until this is 0.');
    else add('dataplane', 'success', 'Data plane ok');
  }

  const ex = status.exomiser_fast;
  if (!ex) add('exomiser_fast', 'warning', 'Exomiser fast path unavailable');
  else {
    const dlq = ex.shadow_dlq ? num(ex.shadow_dlq.visible) + num(ex.shadow_dlq.in_flight) : 0;
    const killOn = Boolean(ex.config?.['dataplane.exomiser.kill_switch']);
    if (dlq > 0) add('exomiser_fast', 'error', `Exomiser fast path: ${dlq} failed shadow job${dlq === 1 ? '' : 's'}`);
    else if (killOn) add('exomiser_fast', 'warning', 'Exomiser kill switch on', 'Every new Exomiser job uses the normal path.');
    else if (num(ex.parity?.mismatch) > 0) add('exomiser_fast', 'warning', `Exomiser fast path: ${ex.parity.mismatch} result differences`, 'Do not serve from the fast engine until this is 0.');
    else add('exomiser_fast', 'success', 'Exomiser fast path ok');
  }

  if (!Array.isArray(status.ecs)) add('ecs', 'warning', 'ECS unavailable');
  else {
    const below = status.ecs.filter((s) => num(s.running) < num(s.desired));
    if (below.length) add('ecs', 'warning', `${below.length} ECS service${below.length === 1 ? '' : 's'} below desired`, below.map((s) => s.service).join(', '));
    else add('ecs', 'success', 'ECS services at desired');
  }

  if (!Array.isArray(status.dlqs)) add('dlqs', 'warning', 'Failed-job queues unavailable');
  else {
    const parked = status.dlqs.reduce((sum, d) => sum + num(d.visible) + num(d.in_flight), 0);
    if (parked > 0) add('dlqs', 'error', `${parked} failed job${parked === 1 ? '' : 's'} parked`);
    else add('dlqs', 'success', 'No failed jobs parked');
  }

  return chips;
}

/**
 * Top-of-page overview: one headline word, then a chip per subsystem (dot + text, never colour
 * alone), then the alarms that are firing. Derived entirely from the status snapshot.
 */
export function HealthOverview({ status, fetchError }) {
  if (!status) {
    return (
      <Panel title="System health" badge={<StatusChip tone={fetchError ? 'error' : 'muted'}>{fetchError ? 'Status unavailable' : 'Loading status…'}</StatusChip>}>
        <p className="text-xs text-muted-foreground">
          {fetchError ? `Could not load status: ${fetchError}` : 'Reading the latest snapshot.'}
        </p>
      </Panel>
    );
  }
  const chips = buildChips(status, fetchError);
  const worst = chips.reduce((w, c) => Math.max(w, TONE_RANK[c.tone] || 0), 0);
  const overall = worst >= 3
    ? { tone: 'error', text: 'Needs attention' }
    : worst >= 2
      ? { tone: 'warning', text: 'Worth a look' }
      : { tone: 'success', text: 'All systems normal' };
  const alarms = Array.isArray(status.alarms) ? status.alarms : [];

  return (
    <Panel
      title="System health"
      badge={<StatusChip tone={overall.tone} className="h-6 px-2.5 text-xs">{overall.text}</StatusChip>}
      help={helpFor('alarms', 'Alarms')}
      bodyClassName="flex flex-col gap-3"
    >
      <ul className="flex flex-wrap gap-1.5" aria-label="Subsystem status">
        {chips.map((c) => (
          <li key={c.key}>
            <StatusChip tone={c.tone} title={c.title} className="h-6 px-2.5 text-xs">{c.text}</StatusChip>
          </li>
        ))}
      </ul>

      {alarms.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-[var(--error)]">
          {alarms.map((a) => {
            const help = explainAlarm(a.name, a.description);
            return (
              <li key={a.name} className="px-3 py-2 text-xs">
                <div className="font-medium text-foreground">{help.text || a.name}</div>
                <div className="mt-0.5 text-2xs text-muted-foreground">
                  {help.look && <span>Look at: <span className="text-foreground">{help.look}</span> · </span>}
                  since {fmtTime(a.since)} ({fmtRelative(a.since)}) · <code className="font-mono">{a.name}</code>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---- tables ------------------------------------------------------------------------- */

function Th({ children, className }) {
  return <th className={cn(thCls, className)}>{children}</th>;
}

function Td({ children, strong, mono, className }) {
  return (
    <td className={cn(tdCls, mono && 'break-all font-mono text-2xs', strong ? 'text-foreground' : 'text-muted-foreground', className)}>
      {children}
    </td>
  );
}

function Empty({ colSpan, text }) {
  return <tr><td colSpan={colSpan} className="h-16 px-3 text-center text-xs text-muted-foreground">{text}</td></tr>;
}

function Scroll({ children, minWidth, maxHeight = 360 }) {
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-left" style={{ minWidth }}>{children}</table>
    </div>
  );
}

export function EcsTable({ ecs, error }) {
  return (
    <Panel title="ECS services" badge={<ReadOnlyBadge />} help={helpFor('ecs', 'ECS services')} muted bodyClassName="p-0">
      {error || !Array.isArray(ecs) ? (
        <div className="p-4"><Banner tone="warning">Status unavailable: {error || 'ECS not loaded'}.</Banner></div>
      ) : (
        <Scroll minWidth={560}>
          <thead>
            <tr><Th>Service</Th><Th>Running / desired</Th><Th>Pending</Th><Th>Rollout</Th><Th>Min / max</Th></tr>
          </thead>
          <tbody>
            {ecs.length === 0 && <Empty colSpan={5} text="No services reported." />}
            {ecs.map((s) => {
              const below = num(s.running) < num(s.desired);
              const rolling = s.rollout && s.rollout !== 'COMPLETED';
              return (
                <tr key={s.service}>
                  <Td strong mono>{s.service}</Td>
                  <Td className="tabular-nums">
                    <span className={below ? 'text-[var(--warning)]' : undefined}>{s.running} / {s.desired}</span>
                    {below && <span className="ml-1.5 text-2xs text-[var(--warning)]">below desired</span>}
                  </Td>
                  <Td className="tabular-nums">{s.pending ?? '–'}</Td>
                  <Td><span className={rolling ? 'text-[var(--warning)]' : undefined}>{s.rollout || '–'}</span></Td>
                  <Td className="tabular-nums">{s.min ?? '–'} / {s.max ?? '–'}</Td>
                </tr>
              );
            })}
          </tbody>
        </Scroll>
      )}
    </Panel>
  );
}

/**
 * PGx has no worker fleet or levers on this page: it is an always-on ECS service. This card
 * shows the matching service row(s) and the pgx intake state so it has a place beside the
 * other pipelines. Intake is paused from the Pause intake cards.
 */
export function PgxCard({ ecs, intake, error }) {
  const rows = Array.isArray(ecs) ? ecs.filter((s) => /pgx/i.test(String(s.service))) : [];
  const entry = intake?.pgx;
  const paused = Boolean(entry && isFutureIso(entry.paused_until));
  return (
    <Panel
      title="PGx"
      badge={<ReadOnlyBadge />}
      muted
      bodyClassName="flex flex-col gap-3"
    >
      {error || !Array.isArray(ecs) ? (
        <Banner tone="warning">Status unavailable: {error || 'ECS not loaded'}.</Banner>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No PGx service reported.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const below = num(s.running) < num(s.desired);
            return (
              <li key={s.service} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <code className="font-mono text-2xs text-foreground">{s.service}</code>
                <span className="flex items-center gap-2 tabular-nums">
                  <StatusChip tone={below ? 'warning' : 'success'}>
                    {s.running} / {s.desired} running
                  </StatusChip>
                  <span className="text-muted-foreground">scales {s.min ?? '–'} to {s.max ?? '–'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Intake
        {intake ? (
          <StatusChip tone={paused ? 'warning' : 'success'}>
            {paused ? `Paused until ${fmtTime(entry.paused_until)}` : 'Open'}
          </StatusChip>
        ) : <span>unavailable</span>}
      </div>
      <p className="text-2xs text-muted-foreground">
        PGx runs as an ECS service that autoscales on its own, so there are no worker levers here. Pause its intake from the intake cards above.
      </p>
    </Panel>
  );
}

export function DlqSection({ dlqs, deadLetters, dlqError, deadLettersError }) {
  return (
    <Panel title="Dead-letter queues (failed jobs)" badge={<ReadOnlyBadge />} help={helpFor('dlqs', 'Dead-letter queues')} muted bodyClassName="flex flex-col gap-4 p-4">
      {dlqError || !Array.isArray(dlqs) ? (
        <Banner tone="warning">Status unavailable: {dlqError || 'DLQs not loaded'}.</Banner>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dlqs.length === 0 && <p className="text-xs text-muted-foreground">No DLQs reported.</p>}
          {dlqs.map((d) => {
            const depth = num(d.visible) + num(d.in_flight);
            return (
              <div key={d.name} className={cn('rounded-md border bg-card px-3 py-2 tabular-nums', depth ? 'border-[var(--error)]' : 'border-border')}>
                <div className="font-mono text-2xs text-muted-foreground">{d.name}</div>
                <div className={cn('text-sm font-semibold', depth ? 'text-[var(--error)]' : 'text-foreground')}>
                  {d.visible} <span className="text-2xs font-normal text-muted-foreground">visible · {d.in_flight} in flight</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deadLettersError || !Array.isArray(deadLetters) ? (
        <Banner tone="warning">Status unavailable: {deadLettersError || 'dead letters not loaded'}.</Banner>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <Scroll minWidth={640} maxHeight={280}>
            <thead>
              <tr><Th>At</Th><Th>Kind</Th><Th>Conversation</Th><Th>Outcome</Th><Th>Reason</Th></tr>
            </thead>
            <tbody>
              {deadLetters.length === 0 && <Empty colSpan={5} text="No recent dead letters." />}
              {deadLetters.map((d, i) => (
                <tr key={`${d.at}-${d.conversation_id}-${i}`}>
                  <Td className="whitespace-nowrap tabular-nums">{fmtTime(d.at)}</Td>
                  <Td>{d.kind}</Td>
                  <Td mono>{d.conversation_id || '–'}</Td>
                  <Td>{d.outcome || '–'}</Td>
                  <Td>{d.reason || '–'}</Td>
                </tr>
              ))}
            </tbody>
          </Scroll>
        </div>
      )}
    </Panel>
  );
}

export function AuditTable({ audit, error, limit, onReload }) {
  return (
    <Panel
      title={`Audit (last ${limit})`}
      badge={<ReadOnlyBadge />}
      help={helpFor('audit', 'Audit')}
      muted
      bodyClassName="p-0"
      actions={onReload ? (
        <button
          type="button"
          onClick={onReload}
          className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-10"
        >
          Reload
        </button>
      ) : null}
    >
      {error ? (
        <div className="p-4"><Banner tone="warning">Status unavailable: {error}.</Banner></div>
      ) : (
        <Scroll minWidth={820} maxHeight={420}>
          <thead>
            <tr>
              <Th>At</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Before → after</Th><Th>Reason</Th><Th>Expires</Th>
            </tr>
          </thead>
          <tbody>
            {audit === null && <Empty colSpan={7} text="Loading…" />}
            {audit !== null && audit.length === 0 && <Empty colSpan={7} text="No admin actions recorded." />}
            {(audit || []).map((a, i) => (
              <tr key={`${a.at}-${a.action}-${i}`}>
                <Td className="whitespace-nowrap tabular-nums">{fmtTime(a.at)}</Td>
                <Td>{a.actor || '–'}</Td>
                <Td strong>{a.action}</Td>
                <Td mono>{fmtValue(a.target)}</Td>
                <Td mono>{fmtValue(a.before)} → {fmtValue(a.after)}</Td>
                <Td>{a.reason || '–'}</Td>
                <Td className="whitespace-nowrap tabular-nums">{a.expires_at ? fmtTime(a.expires_at) : '–'}</Td>
              </tr>
            ))}
          </tbody>
        </Scroll>
      )}
    </Panel>
  );
}
