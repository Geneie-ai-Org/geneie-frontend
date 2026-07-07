import { Bell, Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

const JOB_TYPE_CONFIG = {
  annovar: { label: 'ANNOVAR', color: 'var(--accent-teal)' },
  acmg: { label: 'ACMG', color: 'var(--accent-purple, #7c3aed)' },
  exomiser: { label: 'Exomiser', color: 'var(--warning)' },
};

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

export default function NotificationBell({ onNavigateToConversation }) {
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

  const getJobTypeLabel = (jobType) => {
    const config = JOB_TYPE_CONFIG[jobType] || { label: jobType, color: 'var(--text-secondary)' };
    return (
      <span
        className="text-[11px] px-1.5 py-0.5 rounded font-semibold shrink-0"
        style={{ backgroundColor: `${config.color}20`, color: config.color }}
      >
        {config.label}
      </span>
    );
  };

  return (
    <Popover open={dropdownOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className="relative p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
        style={{ color: 'var(--text-secondary)' }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-[10px] font-bold leading-none px-1"
            style={{ backgroundColor: 'var(--error)', color: '#fff' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        className="w-80 p-0 gap-0 rounded-xl shadow-xl ring-0 overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface-raised)',
          border: '1px solid var(--border-default)',
        }}
      >
        <ScrollArea className={notifications.length > 3 ? 'h-[312px]' : ''}>
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                No notifications yet.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onClickNotification(n)}
                  className="w-full text-left px-3 py-2.5 transition-colors hover:bg-[var(--bg-surface-hover)]"
                  style={{
                    backgroundColor: !n.read ? 'var(--accent-teal-soft)' : 'transparent',
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.read && (
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: 'var(--accent-teal)' }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="text-xs font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {n.title}
                        </span>
                        {getJobTypeLabel(n.job_type)}
                      </div>
                      <p
                        className="text-xs leading-snug line-clamp-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {n.conversation_title || 'Unknown conversation'}
                        </span>
                        <span className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
