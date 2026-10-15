import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HelpBody, HelpPopover, StatusChip, selectSmCls, tdCls, thCls } from './adminUi';

/** One key number, one line of context, one action. Paragraphs live in the "?" popover. */
function StatCard({ label, value, sub, help, action, children }) {
  return (
    <div className="flex min-h-[132px] flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
        {help}
      </div>
      <div className="mt-1 text-2xl font-semibold leading-8 tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
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
  const pct = typeof total === 'number' && total > 0 && typeof claimed === 'number'
    ? Math.min(100, Math.round((claimed / total) * 100))
    : 0;
  /* The counter and the real number of beta accounts are maintained separately, so a
   * mismatch means a seat was leaked or a plan was changed outside this tool. */
  const drift = seats && s && seats.betaUserCount !== claimed;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Beta seats left"
        value={remaining ?? '–'}
        sub={typeof total === 'number' ? `${claimed ?? '–'} of ${total} claimed` : 'Not loaded'}
        help={(
          <HelpPopover title="Beta seats">
            <HelpBody
              what={`The first ${total ?? 'N'} signups are provisioned straight into beta. After that, signups land on free and the landing page shows the waitlist form.`}
              items={[
                ['How seats are used', 'Signup always creates a free account. A seat is claimed only when you set someone to beta here, and released when you demote them.'],
                ['Changing the total', 'Seats left is the total minus the seats already claimed.'],
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
          aria-valuenow={claimed || 0}
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn('h-full rounded-full', remaining === 0 ? 'bg-[var(--warning)]' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      </StatCard>

      <StatCard
        label="Beta accounts"
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

export function WaitlistTable({ waitlist, busy, onReload, onStatus, onDelete }) {
  return (
    <section id="waitlist" aria-labelledby="waitlist-title" className="scroll-mt-4 rounded-lg border border-border bg-card">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 id="waitlist-title" className="text-sm font-semibold text-foreground">Waitlist</h2>
          {waitlist && <span className="text-xs tabular-nums text-muted-foreground">{waitlist.length}</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={onReload} disabled={busy}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Reload
        </Button>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th className={thCls}>Email</th>
              <th className={thCls}>Joined</th>
              <th className={thCls}>Source</th>
              <th className={thCls}>Status</th>
              <th className={cn(thCls, 'w-24')}><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {waitlist === null && (
              <tr><td colSpan={5} className="h-20 text-center text-xs text-muted-foreground">Loading waitlist…</td></tr>
            )}
            {waitlist !== null && waitlist.length === 0 && (
              <tr>
                <td colSpan={5} className="h-24 px-3 text-center text-xs text-muted-foreground">
                  Nobody is waiting. Applications from the landing page show up here once the seats are gone.
                </td>
              </tr>
            )}
            {(waitlist || []).map((entry) => (
              <tr key={entry.id} className="transition-colors hover:bg-muted/40">
                <td className={cn(tdCls, 'text-foreground')}>{entry.email}</td>
                <td className={cn(tdCls, 'whitespace-nowrap tabular-nums text-muted-foreground')}>
                  {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '–'}
                </td>
                <td className={cn(tdCls, 'text-muted-foreground')}>{entry.source || '–'}</td>
                <td className={tdCls}>
                  <select
                    value={entry.status || 'new'}
                    disabled={busy}
                    aria-label={`Status for ${entry.email}`}
                    onChange={(e) => onStatus(entry, e.target.value)}
                    className={selectSmCls}
                  >
                    {WAITLIST_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td className={cn(tdCls, 'text-right')}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(entry)}
                    className="border-[var(--error)] text-[var(--error)] hover:bg-[var(--error-soft)] hover:text-[var(--error)]"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
