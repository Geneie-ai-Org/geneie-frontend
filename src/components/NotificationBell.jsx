import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';

import { PHENOTYPE_FILTER_DISPLAY_NAME } from '@/lib/filterDisplayNames';

const JOB_TYPE_LABELS = {
  annovar: 'Annotation',
  acmg: 'ACMG',
  exomiser: PHENOTYPE_FILTER_DISPLAY_NAME,
  module1: 'Raw data',
};

function getJobLabel(jobType) {
  return JOB_TYPE_LABELS[jobType] || jobType;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/** Today / This week / Earlier, newest first inside each group (the API already returns newest first). */
function groupByRecency(items) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = startOfToday.getTime() - 6 * 86400000;
  const groups = { today: [], week: [], older: [] };
  items.forEach((n) => {
    const t = new Date(n.created_at).getTime();
    if (Number.isNaN(t)) groups.older.push(n);
    else if (t >= startOfToday.getTime()) groups.today.push(n);
    else if (t >= weekAgo) groups.week.push(n);
    else groups.older.push(n);
  });
  return [
    { label: 'Today', items: groups.today },
    { label: 'This week', items: groups.week },
    { label: 'Earlier', items: groups.older },
  ].filter((g) => g.items.length > 0);
}

const DEFAULT_TRIGGER_CLASS =
  'inline-flex size-8 items-center justify-center rounded-[var(--row-radius)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 aria-expanded:bg-sidebar-accent';

/**
 * Notification bell with a recency-grouped popover.
 *
 * `side` / `align` place the popover, `tooltip` (optional) adds a hover/focus tooltip to the
 * trigger for icon-only rails, and `triggerClassName` restyles the button. `onOpenSettings`
 * (optional) gives the empty state its one action. All are additive; the original two props
 * behave exactly as before.
 */
export default function NotificationBell({
  onNavigateToConversation,
  onOpenSettings,
  triggerClassName,
  side = 'right',
  align = 'end',
  tooltip,
}) {
  const {
    unreadCount,
    notifications,
    loading,
    dropdownOpen,
    toggleDropdown,
    closeDropdown,
    markAllRead,
    handleNotificationClick,
  } = useNotifications();

  const groups = useMemo(() => groupByRecency(notifications), [notifications]);

  const handleOpenChange = (open) => {
    if (open) {
      toggleDropdown();
    } else {
      closeDropdown();
    }
  };

  const onClickNotification = async (notification) => {
    const conversationId = await handleNotificationClick(notification);
    if (conversationId && onNavigateToConversation) {
      onNavigateToConversation(conversationId);
    }
  };

  /* One polite status region: announce only when the unread count goes up. The first few seconds
   * after mount are skipped so the initial fetch (and a remount when the rail collapses) stay silent. */
  const [announcement, setAnnouncement] = useState('');
  const previousCount = useRef(unreadCount);
  const ready = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { ready.current = true; }, 4000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (ready.current && unreadCount > previousCount.current) {
      setAnnouncement(`${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`);
    }
    previousCount.current = unreadCount;
  }, [unreadCount]);

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  const trigger = (
    <PopoverTrigger
      className={cn('relative', triggerClassName || DEFAULT_TRIGGER_CLASS)}
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount > 99 ? 'more than 99' : unreadCount} unread` : ''}`}
    >
      <Bell className="size-4" strokeWidth={1.75} aria-hidden="true" />
      {/* A dot, not a number: the count is in the accessible name, the tooltip and the popover header. */}
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-[var(--bg-sidebar)]"
        />
      )}
    </PopoverTrigger>
  );

  return (
    <>
      <Popover open={dropdownOpen} onOpenChange={handleOpenChange}>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger render={trigger} />
            <TooltipContent side={side}>{unreadCount > 0 ? `${tooltip}, ${badgeText} unread` : tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}

        <PopoverContent
          side={side}
          align={align}
          sideOffset={8}
          className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-lg p-0"
        >
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <PopoverTitle className="text-[13px] font-medium text-foreground">Notifications</PopoverTitle>
              {unreadCount > 0 && (
                <span className="text-[12px] tabular-nums text-muted-foreground">{badgeText} unread</span>
              )}
            </div>
            {/* Opening one notification only clears that conversation's, so reading everything
              * needed a way out that isn't "open every conversation". */}
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] max-md:h-11 max-md:px-3 font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50"
            >
              <CheckCheck className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Mark all read
            </button>
          </div>

          <ScrollArea className={notifications.length > 4 ? 'h-[min(24rem,60vh)]' : ''}>
            {loading && notifications.length === 0 ? (
              <div aria-busy="true" className="py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="px-3.5 py-3">
                    <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
                    <div className="mb-1.5 h-3.5 w-[70%] animate-pulse rounded bg-muted" />
                    <div className="h-3 w-[90%] animate-pulse rounded bg-muted" />
                  </div>
                ))}
                <span role="status" className="sr-only">Loading notifications</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="mx-auto mb-2 size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-[13px] font-medium text-foreground">You&rsquo;re all caught up</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Notifications appear here when an annotation, ACMG or raw-data run finishes.
                </p>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => { closeDropdown(); onOpenSettings(); }}
                    className="mt-3 rounded text-[13px] font-medium text-[hsl(var(--signal))] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                  >
                    Notification settings
                  </button>
                )}
              </div>
            ) : (
              <div className="pb-1">
                {groups.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <h3 className="px-3.5 pb-1 pt-3 text-[12px] font-normal text-muted-foreground">
                      {group.label}
                    </h3>
                    <ul className="m-0 list-none p-0">
                      {group.items.map((n) => {
                        const label = getJobLabel(n.job_type);
                        const unread = !n.read;
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => onClickNotification(n)}
                              data-unread={unread || undefined}
                              className={cn(
                                'relative flex w-full flex-col items-stretch gap-0.5 py-2.5 pl-7 pr-3.5 text-left transition-colors duration-150 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70',
                                unread && 'bg-primary/5'
                              )}
                            >
                              {unread && (
                                <span
                                  aria-hidden="true"
                                  className="absolute left-3 top-[1.05rem] size-1.5 rounded-full bg-primary"
                                />
                              )}
                              <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                <span className="font-medium">{label}</span>
                                <span aria-hidden="true">&middot;</span>
                                <span className="tabular-nums">{timeAgo(n.created_at)}</span>
                                <span className="sr-only">{unread ? ', unread' : ', read'}</span>
                              </span>
                              <span className={cn('text-[13px] leading-snug [overflow-wrap:anywhere]', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                                {n.title}
                              </span>
                              {/* Never clamped: a failure message is what the user needs to act on. */}
                              {n.message && (
                                <span className="text-[12px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                                  {n.message}
                                </span>
                              )}
                              {n.conversation_title && (
                                <span className="truncate text-[12px] text-muted-foreground">
                                  in {n.conversation_title}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
