import { Ellipsis, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CopyId, tdCls, thCls } from './adminUi';

/** Plan tabs, in the order an admin scans them. `guest` only appears when someone has it. */
export const PLAN_TABS = ['free', 'beta', 'pro', 'super_pro', 'admin'];

/* Plans are labels, not statuses, so they stay off the status colours: beta carries the one
 * accent, admin is inverted, the rest are neutral. */
const PLAN_CLASS = {
  free: 'bg-muted text-muted-foreground',
  beta: 'bg-[var(--accent-teal-soft)] text-primary',
  pro: 'border-border text-foreground',
  super_pro: 'border-border text-foreground',
  admin: 'bg-foreground text-background',
  guest: 'bg-muted text-muted-foreground',
};

export function PlanChip({ plan }) {
  return (
    <Badge variant="outline" className={cn('h-5 rounded-full px-2 text-2xs font-medium', PLAN_CLASS[plan] || 'bg-muted text-muted-foreground')}>
      {plan}
    </Badge>
  );
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

/** Chat is the only counter with a ceiling, so it is the only one that gets a bar. */
function ChatCell({ used, limit }) {
  const hasLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 && limit !== null;
  const hasUsed = used !== null && used !== undefined && used !== '';
  if (!hasUsed && !hasLimit) return <span className="text-muted-foreground">–</span>;
  const pct = hasLimit ? Math.min(100, Math.round((Number(used || 0) / Number(limit)) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-[var(--error)]' : pct >= 80 ? 'bg-[var(--warning)]' : 'bg-primary';
  return (
    <div className="flex items-center gap-2 tabular-nums">
      <span className="whitespace-nowrap">
        {hasUsed ? Number(used).toLocaleString() : '–'}
        {hasLimit && <span className="text-muted-foreground"> / {Number(limit).toLocaleString()}</span>}
      </span>
      {hasLimit && (
        <span
          role="meter"
          aria-label="Chat used"
          aria-valuemin={0}
          aria-valuemax={Number(limit)}
          aria-valuenow={Number(used || 0)}
          className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-muted"
        >
          <span className={cn('block h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
        </span>
      )}
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
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-50 data-[popup-open]:bg-muted max-md:size-10"
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 text-xs">
        <DropdownMenuItem className="text-xs" onClick={() => onAction('quotas', user)}>View quotas</DropdownMenuItem>
        <DropdownMenuItem className="text-xs" onClick={() => onAction('plan', user)}>Change plan…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" variant="destructive" onClick={() => onAction('devices', user)}>
          Reset devices…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
}) {
  const loaded = (users || []).length;
  const tabs = ['all', ...PLAN_TABS, ...(counts.guest ? ['guest'] : [])];
  const unknownPlans = Object.keys(counts).filter((p) => !PLAN_TABS.includes(p) && p !== 'guest');
  for (const p of unknownPlans) tabs.push(p);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="Search email, uid or cohort"
            aria-label="Search users by email, uid or cohort"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-[var(--border-strong)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {filter && (
            <button
              type="button"
              onClick={() => onFilter('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Filter by plan" className="flex flex-wrap items-center gap-1">
          {tabs.map((p) => {
            const active = planFilter === p;
            const n = p === 'all' ? loaded : counts[p] || 0;
            return (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onPlanFilter(p)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9',
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {p === 'all' ? 'All' : p}
                <span className={cn('tabular-nums', active ? 'text-foreground' : 'text-muted-foreground')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {truncated && (
        <p className="border-b border-border bg-[var(--warning-soft)] px-3 py-1.5 text-xs text-foreground">
          Showing the first {loaded} of {total} users. Tab counts cover these {loaded} only; search to narrow.
        </p>
      )}

      <div className="max-h-[min(70vh,720px)] overflow-auto">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={thCls}>User</th>
              <th className={thCls}>Plan</th>
              <th className={cn(thCls, 'text-right')}>M1 left</th>
              <th className={cn(thCls, 'text-right')}>M2 left</th>
              <th className={thCls}>Chat used</th>
              <th className={cn(thCls, 'text-right')}>Filters left</th>
              <th className={thCls}>Devices</th>
              <th className={cn(thCls, 'w-12')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr><td colSpan={8} className="h-24 px-3 text-center text-xs text-muted-foreground">Loading users…</td></tr>
            )}
            {users !== null && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="h-24 px-3 text-center text-xs text-muted-foreground">
                  {loaded === 0 ? 'No users yet.' : 'No users match this search and plan.'}
                  {loaded > 0 && (filter || planFilter !== 'all') && (
                    <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-xs" onClick={() => { onFilter(''); onPlanFilter('all'); }}>
                      Clear filters
                    </Button>
                  )}
                </td>
              </tr>
            )}
            {visible.map((u) => {
              const plan = u.planStatus || 'free';
              const devices = deviceInfo(u);
              return (
                <tr key={u.uid} className="group transition-colors hover:bg-muted/40">
                  <td className={cn(tdCls, 'max-w-[340px]')}>
                    <div className="flex min-w-0 flex-col justify-center leading-[16px]">
                      <span className={cn('truncate text-foreground', !u.email && 'text-muted-foreground')}>{u.email || '(no email)'}</span>
                      <CopyId value={u.uid} label="uid" />
                    </div>
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2">
                      <PlanChip plan={plan} />
                      {u.betaCohort && <span className="text-2xs text-muted-foreground">{u.betaCohort}</span>}
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
      </div>
    </div>
  );
}
