import { Ellipsis, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bar, CopyIcon, FOCUS, ScrollBox, Segmented, StateBlock, StatusChip, tdCls, thCls, useRowNav } from './adminUi';

/** Plan tabs, in the order an admin scans them. `guest` only appears when someone has it. */
export const PLAN_TABS = ['free', 'beta', 'pro', 'super_pro', 'admin'];

/* Plans are labels, not statuses, so they stay off the status colours: beta carries the one
 * accent, admin is inverted, the rest are neutral. */
export function PlanChip({ plan }) {
  if (plan === 'admin') {
    return <span className="wb-chip border-transparent bg-foreground text-background">{plan}</span>;
  }
  return <span className="wb-chip" data-tone={plan === 'beta' ? 'brand' : undefined}>{plan}</span>;
}

/* Device arrays live under a per-plan prefix; pro and super_pro share one. The caps are
 * runtime config, not part of the user view, so only the counts are shown. */
const DEVICE_PREFIX = { free: 'free', beta: 'beta', pro: 'pro', super_pro: 'pro' };

export function deviceInfo(user) {
  const plan = user.planStatus || 'free';
  const prefixes = DEVICE_PREFIX[plan] ? [DEVICE_PREFIX[plan]] : ['free', 'beta', 'pro'];
  let active = 0;
  let registered = 0;
  let seen = false;
  for (const p of prefixes) {
    const a = user[`${p}ActiveDeviceIds`];
    const r = user[`${p}RegisteredDeviceIds`];
    if (Array.isArray(a)) { active += a.length; seen = true; }
    if (Array.isArray(r)) { registered += r.length; seen = true; }
  }
  return seen ? { active, registered } : null;
}

function Num({ value }) {
  const missing = value === null || value === undefined || value === '';
  return (
    <span className={cn('tabular-nums', missing && 'text-muted-foreground')}>
      {missing ? '–' : Number(value).toLocaleString()}
    </span>
  );
}

/**
 * Chat is the only counter with a ceiling, so it is the only one that gets a bar. When the
 * counter has passed its limit the cell says so in words ("49 used, limit 10") with an error pill,
 * instead of a "49 / 10" that reads like a typo.
 */
function ChatCell({ used, limit }) {
  const hasLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 && limit !== null;
  const hasUsed = used !== null && used !== undefined && used !== '';
  if (!hasUsed && !hasLimit) return <span className="text-muted-foreground">–</span>;
  const u = Number(used || 0);
  const over = hasLimit && u > Number(limit);
  const full = hasLimit && u === Number(limit);
  const pct = hasLimit ? Math.min(100, Math.round((u / Number(limit)) * 100)) : 0;
  const color = over ? 'var(--error)' : pct >= 80 ? 'var(--warning)' : undefined;
  if (over) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap tabular-nums" title={`${u} used, limit ${Number(limit)}, over limit`}>
        <span className="text-foreground">{u.toLocaleString()} used<span className="text-muted-foreground">, limit {Number(limit).toLocaleString()}</span></span>
        <StatusChip tone="error">Over limit</StatusChip>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 tabular-nums">
      <span className="whitespace-nowrap">
        {hasUsed ? u.toLocaleString() : '–'}
        {hasLimit && <span className="text-muted-foreground"> / {Number(limit).toLocaleString()}</span>}
      </span>
      {hasLimit && (
        <span
          role="meter"
          aria-label="Chat used"
          aria-valuemin={0}
          aria-valuemax={Number(limit)}
          aria-valuenow={u}
          aria-valuetext={`${u} used, limit ${Number(limit)}${full ? ', at the limit' : ''}`}
          className="wb-track w-12 shrink-0"
        >
          <span className="wb-fill block" style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : null) }} />
        </span>
      )}
      {full && <StatusChip tone="warning">At limit</StatusChip>}
    </div>
  );
}

function RowMenu({ user, disabled, onAction }) {
  const label = user.email || user.uid;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Actions for ${label}`}
        className={cn('inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--brand-100))] hover:text-[hsl(var(--brand-700))] disabled:opacity-50 data-[popup-open]:bg-[hsl(var(--brand-100))] data-[popup-open]:text-[hsl(var(--brand-700))]', FOCUS)}
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 text-[13px]">
        <DropdownMenuItem className="text-[13px]" onClick={() => onAction('quotas', user)}>View quotas</DropdownMenuItem>
        <DropdownMenuItem className="text-[13px]" onClick={() => onAction('plan', user)}>Change plan…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[13px]" variant="destructive" onClick={() => onAction('devices', user)}>
          Reset devices…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const HEADS = [
  ['User', ''],
  ['Plan', ''],
  ['M1 left', 'text-right'],
  ['M2 left', 'text-right'],
  ['Chat used', ''],
  ['Filters left', 'text-right'],
  ['Devices', ''],
];

function SkeletonRows({ n = 8 }) {
  return Array.from({ length: n }, (_, i) => (
    <tr key={i} aria-hidden="true">
      <td className={tdCls}><Bar className="w-56" /></td>
      <td className={tdCls}><Bar className="w-14" /></td>
      <td className={tdCls}><Bar className="ml-auto w-6" /></td>
      <td className={tdCls}><Bar className="ml-auto w-6" /></td>
      <td className={tdCls}><Bar className="w-24" /></td>
      <td className={tdCls}><Bar className="ml-auto w-6" /></td>
      <td className={tdCls}><Bar className="w-24" /></td>
      <td className={tdCls}><Bar className="ml-auto size-5" /></td>
    </tr>
  ));
}

/**
 * Toolbar (search + plan tabs with counts) and the table itself. Presentation only: every
 * action is reported to the page through `onAction(type, user)`, and the page decides what
 * confirmation to show before anything is written.
 */
export default function UsersTable({
  users,
  visible,
  counts,
  total,
  truncated,
  filter,
  onFilter,
  planFilter,
  onPlanFilter,
  busy,
  onAction,
  error,
  onRetry,
}) {
  const loaded = (users || []).length;
  const planKeys = ['all', ...PLAN_TABS, ...(counts.guest ? ['guest'] : [])];
  for (const p of Object.keys(counts).filter((x) => !PLAN_TABS.includes(x) && x !== 'guest')) planKeys.push(p);
  const items = planKeys.map((p) => ({ key: p, label: p === 'all' ? 'All' : p, count: users === null ? undefined : p === 'all' ? loaded : counts[p] || 0 }));
  const nav = useRowNav(visible.map((u) => u.uid), 'users-row');
  const filtered = filter || planFilter !== 'all';

  return (
    <div className="wb-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[hsl(var(--wb-line))] px-3 py-2.5">
        <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="Search email, uid or cohort"
            aria-label="Search users by email, uid or cohort"
            className="h-8 w-full rounded-full border border-[hsl(var(--wb-line-strong))] bg-[hsl(var(--wb-card))] pl-8 pr-8 text-[13px] text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground hover:border-[hsl(var(--brand-300))] focus-visible:border-[hsl(var(--ring))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)] [&::-webkit-search-cancel-button]:hidden"
          />
          {filter && (
            <button
              type="button"
              onClick={() => onFilter('')}
              aria-label="Clear search"
              className={cn('absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-[hsl(var(--wb-pill))] hover:text-foreground', FOCUS)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Segmented items={items} value={planFilter} onChange={onPlanFilter} label="Filter by plan" group="users-plan" />
        {users !== null && !error && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {filtered ? `${visible.length} of ${loaded} shown` : `${loaded} shown`}
          </span>
        )}
      </div>

      {truncated && (
        <p className="border-b border-[hsl(var(--wb-line))] bg-[var(--warning-soft)] px-4 py-2 text-[13px] text-foreground">
          Showing the first {loaded} of {total} users. Tab counts cover these {loaded} only; search to narrow.
        </p>
      )}

      <ScrollBox label="Users table" className="max-h-[min(70vh,720px)]">
        <table className="w-full min-w-[1020px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              {HEADS.map(([h, cls]) => <th key={h} scope="col" className={cn(thCls, cls)}>{h}</th>)}
              <th scope="col" className={cn(thCls, 'w-12')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody onKeyDown={nav.onKeyDown}>
            {users === null && <SkeletonRows />}
            {users !== null && error && (
              <tr>
                <td colSpan={8}>
                  <StateBlock
                    tone="error"
                    title="Could not load users"
                    action={onRetry ? <Button variant="outline" size="sm" onClick={onRetry} disabled={busy}>Retry</Button> : null}
                  >
                    {error}
                  </StateBlock>
                </td>
              </tr>
            )}
            {users !== null && !error && visible.length === 0 && (
              <tr>
                <td colSpan={8}>
                  {loaded === 0 ? (
                    <StateBlock title="No users yet">Accounts appear here as people sign up. New signups start on the free plan.</StateBlock>
                  ) : (
                    <StateBlock
                      title="No users match"
                      action={filtered ? <Button variant="outline" size="sm" onClick={() => { onFilter(''); onPlanFilter('all'); }}>Clear filters</Button> : null}
                    >
                      Nothing in these {loaded} users matches this search and plan.
                    </StateBlock>
                  )}
                </td>
              </tr>
            )}
            {!error && visible.map((u) => {
              const plan = u.planStatus || 'free';
              const devices = deviceInfo(u);
              const rp = nav.rowProps(u.uid);
              return (
                <tr key={u.uid} {...rp}>
                  <td className={cn(tdCls, 'w-full')}>
                    {nav.marker(u.uid)}
                    <div className="flex min-w-0 items-center gap-1">
                      <span className={cn('min-w-0 max-w-[300px] truncate text-foreground', !u.email && 'text-muted-foreground')} title={u.email || undefined}>{u.email || '(no email)'}</span>
                      {u.email && <CopyIcon value={u.email} label="email" />}
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
                        <code className="font-mono text-xs text-muted-foreground" title={u.uid}>{u.uid.length > 12 ? `${u.uid.slice(0, 11)}…` : u.uid}</code>
                        <CopyIcon value={u.uid} label="uid" />
                      </span>
                    </div>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <PlanChip plan={plan} />
                      {u.betaCohort && <span className="whitespace-nowrap text-xs text-muted-foreground">{u.betaCohort}</span>}
                    </div>
                  </td>
                  <td className={cn(tdCls, 'text-right')}><Num value={u.module1RunsRemaining} /></td>
                  <td className={cn(tdCls, 'text-right')}><Num value={u.module2RunsRemaining} /></td>
                  <td className={tdCls}><ChatCell used={u.chatExchangesUsed} limit={u.chatExchangesLimit} /></td>
                  <td className={cn(tdCls, 'text-right')}><Num value={u.filterAppliesRemaining ?? u.acmgExomiserAppliesRemaining} /></td>
                  <td className={cn(tdCls, 'whitespace-nowrap tabular-nums')}>
                    {devices ? (
                      <span title={`${devices.registered} registered`}>
                        {devices.active} active
                        <span className="text-muted-foreground"> · {devices.registered} reg.</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className={cn(tdCls, 'text-right')}>
                    <RowMenu user={u} disabled={busy} onAction={onAction} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollBox>
    </div>
  );
}
