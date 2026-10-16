import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bell, CheckCheck, RotateCw } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { StateButton } from '@/components/motion';

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
  'inline-flex size-8 items-center justify-center rounded-full border border-transparent [@media(pointer:coarse)]:size-11 text-[var(--text-secondary)] transition-colors duration-150 hover:border-[hsl(var(--wb-line))] hover:bg-[hsl(var(--brand-50))] hover:text-[hsl(var(--brand-700))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 aria-expanded:border-[hsl(var(--brand-300))] aria-expanded:bg-[hsl(var(--brand-50))]';

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
    // Optional: the hook does not expose these yet. When it does, the popover shows the error state.
    error,
    refetch,
  } = useNotifications();
  const reduce = useReducedMotion();
  const [markState, setMarkState] = useState('idle');
  const doneTimer = useRef(null);
  useEffect(() => () => clearTimeout(doneTimer.current), []);
  const latestUnread = useRef(unreadCount);
  latestUnread.current = unreadCount;
  const onMarkAll = async () => {
    if (unreadCount === 0) return;
    setMarkState('running');
    try { await markAllRead(); } catch (_) { /* the hook reports through the count */ }
    // Let the hook's state commit, then say what actually happened: the count is the truth.
    await new Promise((r) => setTimeout(r, 50));
    setMarkState(latestUnread.current === 0 ? 'done' : 'error');
    clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setMarkState('idle'), 1600);
  };

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
      {/* A dot, not a number: the count is in the accessible name, the tooltip and the popover header.
        * It stays mounted and fades, so reading the last unread notification does not make it blink out. */}
      <AnimatePresence initial={false}>
        {unreadCount > 0 && (
          <motion.span
            key="dot"
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[hsl(var(--brand-500))] ring-2 ring-[var(--bg-sidebar)]"
          />
        )}
      </AnimatePresence>
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
          className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-2xl p-0"
        >
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[hsl(var(--wb-line))] px-3.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <PopoverTitle className="text-[13px] font-medium text-foreground">Notifications</PopoverTitle>
              {unreadCount > 0 && (
                <span className="wb-chip wb-pop tabular-nums" data-tone="brand">{badgeText} unread</span>
              )}
            </div>
            {/* Opening one notification only clears that conversation's, so reading everything
              * needed a way out that isn't "open every conversation". */}
            <StateButton
              variant="outline"
              size="sm"
              state={markState}
              labels={{ idle: 'Mark all read', running: 'Marking…', done: 'All read', error: 'Try again' }}
              icon={CheckCheck}
              onClick={onMarkAll}
              disabled={unreadCount === 0 && markState === 'idle'}
              className="shrink-0 max-md:h-11"
            />
          </div>

          <ScrollArea className={notifications.length > 4 ? 'h-[min(24rem,60vh)]' : ''}>
            {error && notifications.length === 0 ? (
              <div role="alert" className="wb-fade px-6 py-9 text-center">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--error-soft)] text-[var(--error)]" aria-hidden="true">
                  <Bell className="size-5" strokeWidth={1.75} />
                </span>
                <p className="text-[13px] font-medium text-foreground">Could not load notifications</p>
                <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-muted-foreground">
                  Check your connection, then try again. Your unread count is unchanged.
                </p>
                {refetch && (
                  <Button variant="outline" size="sm" className="mt-3 max-md:h-11" onClick={refetch}>
                    <RotateCw aria-hidden="true" /> Retry
                  </Button>
                )}
              </div>
            ) : loading && notifications.length === 0 ? (
              <div aria-busy="true" className="space-y-1 p-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl px-2.5 py-2.5">
                    <div className="wb-shimmer mb-2 h-3 w-24 rounded-full" />
                    <div className="wb-shimmer mb-1.5 h-3.5 w-[70%] rounded-full" />
                    <div className="wb-shimmer h-3 w-[90%] rounded-full" />
                  </div>
                ))}
                <span role="status" className="sr-only">Loading notifications</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="wb-fade px-6 py-10 text-center">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full border border-[hsl(var(--brand-200))] bg-[hsl(var(--brand-100))] text-[hsl(var(--brand-500))]" aria-hidden="true">
                  <CheckCheck className="size-5" strokeWidth={1.75} />
                </span>
                <p className="text-[13px] font-medium text-foreground">You&rsquo;re all caught up</p>
                <p className="mx-auto mt-1 max-w-[16rem] text-[12px] text-muted-foreground">
                  Notifications appear here when an annotation, ACMG or raw-data run finishes.
                </p>
                {onOpenSettings && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 max-md:h-11"
                    onClick={() => { closeDropdown(); onOpenSettings(); }}
                  >
                    Notification settings
                  </Button>
                )}
              </div>
            ) : (
              <div className="p-1.5">
                {(() => {
                  let index = 0;
                  return groups.map((group) => (
                    <section key={group.label} aria-label={group.label}>
                      <h3 className="px-2.5 pb-1 pt-2.5 text-[12px] font-medium text-muted-foreground">
                        {group.label}
                      </h3>
                      <ul className="m-0 list-none space-y-0.5 p-0">
                        {group.items.map((n) => {
                          const label = getJobLabel(n.job_type);
                          const unread = !n.read;
                          const failed = /fail|error/i.test(n.title || '');
                          // Rows rise in with a 30ms stagger, capped so a long list does not take a second and a half.
                          const delay = Math.min(index++, 8) * 30;
                          return (
                            <li key={n.id} className="wb-rise" style={{ animationDelay: `${delay}ms` }}>
                              <button
                                type="button"
                                onClick={() => onClickNotification(n)}
                                data-unread={unread || undefined}
                                className="flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors duration-150 hover:border-[hsl(var(--brand-200))] hover:bg-[hsl(var(--brand-50))] focus-visible:border-[hsl(var(--brand-300))] focus-visible:bg-[hsl(var(--brand-50))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                              >
                                {/* Stays mounted: it fades out when the notification is read. */}
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'mt-[0.45rem] size-2 shrink-0 rounded-full bg-[hsl(var(--brand-500))] transition-opacity duration-200 motion-reduce:transition-none',
                                    unread ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                  <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                    <span
                                      className="wb-chip"
                                      style={failed ? { backgroundColor: 'var(--error-soft)', borderColor: 'transparent', color: 'var(--error)' } : undefined}
                                    >
                                      {label}
                                    </span>
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
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ));
                })()}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    </>
  );
}
