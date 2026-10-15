import { useMemo } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 aria-expanded:bg-accent';

/**
 * Notification bell with a recency-grouped popover.
 *
 * `side` / `align` place the popover, `tooltip` (optional) adds a hover/focus tooltip to the
 * trigger for icon-only rails, and `triggerClassName` restyles the button. All three are
 * additive; the original two props behave exactly as before.
 */
export default function NotificationBell({
  onNavigateToConversation,
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

  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  const trigger = (
    <DropdownMenuTrigger
      className={cn('relative', triggerClassName || DEFAULT_TRIGGER_CLASS)}
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount > 99 ? 'more than 99' : unreadCount} unread` : ''}`}
    >
      <Bell className="size-4" aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-[var(--bg-sidebar)]"
        >
          {badgeText}
        </span>
      )}
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side={side}>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg p-0"
      >
        <div className="flex min-h-11 items-center justify-between border-b border-border px-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">{badgeText} unread</span>
            )}
          </div>
          {/* Opening one notification only clears that conversation's, so reading everything
            * needed a way out that isn't "open every conversation". */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); markAllRead(); }}
            disabled={unreadCount === 0}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs max-md:h-11 max-md:px-3 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" aria-hidden="true" />
            Mark all read
          </button>
        </div>

        <ScrollArea className={notifications.length > 4 ? 'h-[min(24rem,60vh)]' : ''}>
          {loading && notifications.length === 0 ? (
            <div aria-busy="true" aria-live="polite" className="py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-3.5 py-3">
                  <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="mb-1.5 h-3.5 w-[70%] animate-pulse rounded bg-muted" />
                  <div className="h-3 w-[90%] animate-pulse rounded bg-muted" />
                </div>
              ))}
              <span className="sr-only">Loading notifications…</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto mb-2 size-5 text-[var(--text-disabled)]" aria-hidden="true" />
              <p className="text-[13px] font-medium text-foreground">You&rsquo;re all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                When an annotation, ACMG or raw-data run finishes, it shows up here.
              </p>
            </div>
          ) : (
            <div className="pb-1">
              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <p className="px-3.5 pb-1 pt-3 text-2xs font-medium tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((n) => {
                    const label = getJobLabel(n.job_type);
                    const unread = !n.read;
                    return (
                      <DropdownMenuItem
                        key={n.id}
                        onClick={() => onClickNotification(n)}
                        aria-label={`${label}: ${n.title}. ${unread ? 'Unread' : 'Read'}. ${timeAgo(n.created_at)}.`}
                        data-unread={unread || undefined}
                        className={cn(
                          'relative flex-col items-stretch gap-0.5 rounded-none py-2.5 pl-7 pr-3.5 focus:bg-accent',
                          unread && 'bg-primary/5'
                        )}
                      >
                        {unread && (
                          <span
                            aria-hidden="true"
                            className="absolute left-3 top-[1.05rem] size-1.5 rounded-full bg-primary"
                          />
                        )}
                        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                          <span className="font-medium">{label}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span className="tabular-nums">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className={cn('truncate text-[13px] leading-snug', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                            {n.message}
                          </p>
                        )}
                        {n.conversation_title && (
                          <p className="truncate text-2xs text-[var(--text-tertiary)]">
                            in {n.conversation_title}
                          </p>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
