import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion';
import { Bar, CopyIcon, HelpBody, HelpPopover, ScrollBox, StateBlock, StatusChip, tdCls, thCls, useRowNav } from './adminUi';
import AdminSelect from './AdminSelect';

/** One key number, one line of context, one action. Paragraphs live in the "?" popover. */
function StatCard({ label, value, sub, help, action, children, loading }) {
  return (
    <div className="wb-card wb-rise flex min-h-[148px] flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="wb-card-title">{label}</h2>
        {help}
      </div>
      <div className="mt-1.5 text-[28px] font-semibold leading-9 tabular-nums text-foreground">
        {loading ? <Bar className="mt-2 h-6 w-14" /> : typeof value === 'number' ? <CountUp value={value} startAt={0} /> : value}
      </div>
      <div className="mt-1 min-h-5 text-[13px] text-muted-foreground">{loading ? <Bar className="mt-1 w-32" /> : sub}</div>
      {children}
      {action && <div className="mt-auto pt-3">{action}</div>}
    </div>
  );
}

function jumpToWaitlist() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('waitlist')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function SeatCards({ seats, onEditTotal, onShowBeta, busy }) {
  const s = seats?.seats;
  const total = s?.total;
  const claimed = s?.claimed;
  const remaining = s?.remaining;
  const loading = !seats;
  const over = typeof total === 'number' && typeof claimed === 'number' && claimed > total;
  const pct = typeof total === 'number' && total > 0 && typeof claimed === 'number'
    ? Math.min(100, Math.round((claimed / total) * 100))
    : over ? 100 : 0;
  /* The counter and the real number of beta accounts are maintained separately, so a
   * mismatch means a seat was leaked or a plan was changed outside this tool. */
  const drift = seats && s && seats.betaUserCount !== claimed;
  const barColor = over || remaining === 0 ? 'var(--error)' : pct >= 85 ? 'var(--warning)' : undefined;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Beta seats left"
        loading={loading}
        value={remaining ?? '–'}
        sub={over ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{claimed} used, limit {total}</span>
            <StatusChip tone="error">Over limit</StatusChip>
          </span>
        ) : typeof total === 'number' ? `${claimed ?? '–'} of ${total} claimed` : 'Not loaded'}
        help={(
          <HelpPopover title="Beta seats">
            <HelpBody
              what={`The first ${total ?? 'N'} signups are provisioned straight into beta. After that, signups land on free and the landing page shows the waitlist form.`}
              items={[
                ['How seats are used', 'Signup always creates a free account. A seat is claimed only when you set someone to beta here, and released when you demote them.'],
                ['Changing the total', 'Seats left is the total minus the seats already claimed. If more seats are claimed than the total, seats left shows 0 and the card says it is over the limit.'],
              ]}
            />
          </HelpPopover>
        )}
        action={<Button variant="outline" size="sm" disabled={busy || !s} onClick={onEditTotal}>Change total</Button>}
      >
        <div
          role="meter"
          aria-label="Beta seats claimed"
          aria-valuemin={0}
          aria-valuemax={total || 0}
          aria-valuenow={Math.min(claimed || 0, total || 0)}
          aria-valuetext={over ? `${claimed} used, limit ${total}, over limit` : `${claimed ?? 0} of ${total ?? 0} claimed`}
          className="wb-track mt-2.5"
        >
          <div className="wb-fill" style={{ width: `${pct}%`, ...(barColor ? { backgroundColor: barColor } : null) }} />
        </div>
      </StatCard>

      <StatCard
        label="Beta accounts"
        loading={loading}
        value={seats?.betaUserCount ?? '–'}
        sub={(
          drift
            ? <StatusChip tone="warning">Counter says {claimed} claimed</StatusChip>
            : seats ? <StatusChip tone="success">Matches the seat counter</StatusChip> : 'Not loaded'
        )}
        help={(
          <HelpPopover title="Beta accounts">
            <HelpBody
              what="Accounts whose plan is beta, compared with the seats the counter says are claimed."
              items={[['If they differ', 'A seat was leaked or a plan was changed outside this tool. Raise or lower the seat total to bring them back in step if the beta should stay open for the difference.']]}
            />
          </HelpPopover>
        )}
        action={<Button variant="outline" size="sm" onClick={onShowBeta}>Show beta users</Button>}
      />

      <StatCard
        label="Waitlist"
        loading={loading}
        value={seats?.waitlistCount ?? '–'}
        sub="people applied from the landing page"
        help={(
          <HelpPopover title="Waitlist">
            <HelpBody what="People who applied once the seats were gone. Grant a seat by setting them to beta in the Users table, then mark the entry invited." />
          </HelpPopover>
        )}
        action={<Button variant="outline" size="sm" onClick={jumpToWaitlist}>Review waitlist</Button>}
      />
    </div>
  );
}

export const WAITLIST_STATUSES = ['new', 'contacted', 'invited', 'declined'];

export function WaitlistTable({ waitlist, busy, onReload, onStatus, onDelete, error }) {
  const nav = useRowNav((waitlist || []).map((e) => e.id), 'waitlist-row');
  return (
    <section id="waitlist" aria-labelledby="waitlist-title" className="wb-card scroll-mt-4 overflow-hidden">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[hsl(var(--wb-line))] px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 id="waitlist-title" className="text-[14px] font-semibold text-foreground">Waitlist</h2>
          {waitlist && !error && <span className="wb-chip tabular-nums">{waitlist.length}</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={onReload} disabled={busy}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Reload
        </Button>
      </div>
      <ScrollBox label="Waitlist table" className="max-h-[420px]">
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th scope="col" className={thCls}>Email</th>
              <th scope="col" className={thCls}>Joined</th>
              <th scope="col" className={thCls}>Source</th>
              <th scope="col" className={thCls}>Status</th>
              <th scope="col" className={cn(thCls, 'w-24')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody onKeyDown={nav.onKeyDown}>
            {waitlist === null && Array.from({ length: 3 }, (_, i) => (
              <tr key={i} aria-hidden="true">
                <td className={tdCls}><Bar className="w-48" /></td>
                <td className={tdCls}><Bar className="w-20" /></td>
                <td className={tdCls}><Bar className="w-16" /></td>
                <td className={tdCls}><Bar className="w-24" /></td>
                <td className={tdCls}><Bar className="ml-auto w-14" /></td>
              </tr>
            ))}
            {waitlist !== null && error && (
              <tr>
                <td colSpan={5}>
                  <StateBlock tone="error" title="Could not load the waitlist" action={<Button variant="outline" size="sm" onClick={onReload} disabled={busy}>Retry</Button>}>
                    {error}
                  </StateBlock>
                </td>
              </tr>
            )}
            {waitlist !== null && !error && waitlist.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <StateBlock title="Nobody is waiting">Applications from the landing page show up here once the seats are gone.</StateBlock>
                </td>
              </tr>
            )}
            {!error && (waitlist || []).map((entry) => (
              <tr key={entry.id} {...nav.rowProps(entry.id)}>
                <td className={cn(tdCls, 'text-foreground')}>
                  {nav.marker(entry.id)}
                  <span className="flex items-center gap-1">
                    <span className="truncate">{entry.email}</span>
                    <CopyIcon value={entry.email} label="email" />
                  </span>
                </td>
                <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-muted-foreground')}>
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '–'}
                </td>
                <td className={cn(tdCls, 'text-muted-foreground')}>{entry.source || '–'}</td>
                <td className={tdCls}>
                  <AdminSelect
                    value={entry.status || 'new'}
                    disabled={busy}
                    aria-label={`Status for ${entry.email}`}
                    onChange={(e) => onStatus(entry, e.target.value)}
                    size="sm"
                    className="min-w-[7rem]"
                  >
                    {WAITLIST_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </AdminSelect>
                </td>
                <td className={cn(tdCls, 'text-right')}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(entry)}
                    className="!border-[var(--error)] !text-[var(--error)] hover:!bg-[var(--error-soft)]"
                  >
                    Delete…
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </section>
  );
}
