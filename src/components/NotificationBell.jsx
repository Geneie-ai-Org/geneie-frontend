import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

const JOB_TYPE_CONFIG = {
  annovar: { label: 'ANNOVAR', color: 'var(--accent-teal)' },
  acmg: { label: 'ACMG', color: 'var(--accent-purple, #7c3aed)' },
  exomiser: { label: 'Exomiser', color: 'var(--warning)' },
};

function getJobColor(jobType) {
  return (JOB_TYPE_CONFIG[jobType] || {}).color || 'var(--text-tertiary)';
}
function getJobLabel(jobType) {
  return (JOB_TYPE_CONFIG[jobType] || {}).label || jobType;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
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

const DEFAULT_TRIGGER_CLASS =
  'relative p-1.5 rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)] focus-visible:ring-offset-0';

export default function NotificationBell({ onNavigateToConversation, triggerClassName }) {
  const {
    unreadCount,
    notifications,
    loading,
    dropdownOpen,
    toggleDropdown,
    closeDropdown,
    handleNotificationClick,
  } = useNotifications();

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

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        className={triggerClassName || DEFAULT_TRIGGER_CLASS}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <span className="relative inline-flex">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full inline-flex items-center justify-center text-[10px] font-semibold leading-none px-1 tabular-nums bg-[var(--accent-teal)] text-[var(--bg-app)]"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={6}
        className="w-[336px] p-0 rounded-xl overflow-hidden shadow-2xl bg-[var(--bg-surface-raised)] border border-[var(--border-default)]"
      >
        <div className="px-3.5 h-10 flex items-center justify-between border-b border-[var(--border-subtle)]">
          <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              className="text-[10px] px-1.5 h-[18px] inline-flex items-center rounded-full font-semibold tabular-nums bg-[var(--accent-teal-soft)] text-[var(--accent-teal)]"
            >
              {unreadCount} new
            </span>
          )}
        </div>

        <ScrollArea className={notifications.length > 4 ? 'h-[360px]' : ''}>
          {loading && notifications.length === 0 ? (
            <div aria-busy="true" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="px-3.5 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-3 w-14 rounded bg-[var(--bg-surface-hover)] animate-pulse" />
                    <div className="h-3 w-8 rounded bg-[var(--bg-surface-hover)] animate-pulse" />
                  </div>
                  <div className="h-3.5 w-[70%] rounded bg-[var(--bg-surface-hover)] animate-pulse mb-1.5" />
                  <div className="h-3 w-[90%] rounded bg-[var(--bg-surface-hover)] animate-pulse" />
                </div>
              ))}
              <span className="sr-only">Loading notifications…</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-10 px-6 text-center">
              <p className="text-[13px] text-[var(--text-secondary)]">
                You're all caught up.
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                We'll ping you here when a pipeline finishes.
              </p>
            </div>
          ) : (
            <div>
              {notifications.map((n) => {
                const color = getJobColor(n.job_type);
                const label = getJobLabel(n.job_type);
                return (
                  <DropdownMenuItem
                    key={n.id}
                    onSelect={() => onClickNotification(n)}
                    aria-label={`${label} — ${n.title}. ${n.read ? 'Read' : 'Unread'}. ${timeAgo(n.created_at)}.`}
                    data-unread={!n.read || undefined}
                    className="group relative flex flex-col items-stretch gap-1 px-3.5 py-2.5 rounded-none cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0 data-[highlighted]:bg-[var(--bg-surface-hover)] focus:bg-[var(--bg-surface-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-semibold uppercase shrink-0"
                        style={{ color, letterSpacing: '0.08em' }}
                      >
                        {label}
                      </span>
                      <span
                        className="w-0.5 h-0.5 rounded-full shrink-0 bg-[var(--text-tertiary)]"
                        aria-hidden
                      />
                      <span className="text-[10px] shrink-0 tabular-nums text-[var(--text-tertiary)]">
                        {timeAgo(n.created_at)}
                      </span>
                      {!n.read && (
                        <span
                          className="ml-auto w-[7px] h-[7px] rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-label="unread"
                        />
                      )}
                    </div>
                    <p className="text-[13px] font-medium leading-snug truncate text-[var(--text-primary)]">
                      {n.title}
                    </p>
                    <p className="text-[12px] leading-snug truncate text-[var(--text-secondary)]">
                      {n.message}
                    </p>
                    {n.conversation_title && (
                      <p className="text-[11px] truncate text-[var(--text-tertiary)]">
                        in {n.conversation_title}
                      </p>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
