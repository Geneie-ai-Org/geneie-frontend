import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';

const DROPDOWN_WIDTH = 320;
const DROPDOWN_MAX_HEIGHT = '70vh';

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

function useDropdownPosition(triggerRef, open) {
  const [style, setStyle] = useState({});

  const recalc = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    const dropdownH = Math.min(420, vh * 0.7);
    const spaceRight = vw - rect.right;
    const spaceLeft = rect.left;
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;

    const style = {
      position: 'fixed',
      width: DROPDOWN_WIDTH,
      maxHeight: DROPDOWN_MAX_HEIGHT,
    };

    // Horizontal: prefer opening to the right of the trigger (sidebar case),
    // fall back to left, then clamp within viewport.
    if (spaceRight >= DROPDOWN_WIDTH + margin) {
      style.left = rect.right + 6;
    } else if (spaceLeft >= DROPDOWN_WIDTH + margin) {
      style.right = vw - rect.left + 6;
    } else {
      // Align to trigger's right edge but clamp so the dropdown stays on-screen.
      const desiredRight = vw - rect.right;
      const maxRight = vw - DROPDOWN_WIDTH - margin;
      style.right = Math.max(margin, Math.min(desiredRight, maxRight));
    }

    // Vertical: align bottom with trigger bottom if there's room upward,
    // otherwise anchor to the top of the trigger.
    if (spaceAbove >= dropdownH || spaceAbove >= spaceBelow) {
      style.bottom = Math.max(margin, vh - rect.bottom);
    } else {
      style.top = Math.min(rect.top, vh - dropdownH - margin);
    }

    setStyle(style);
  }, [triggerRef]);

  useEffect(() => {
    if (!open) return;
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [open, recalc]);

  return style;
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

  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const dropdownStyle = useDropdownPosition(triggerRef, dropdownOpen);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onClickOutside = (e) => {
      const inTrigger = triggerRef.current && triggerRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inTrigger && !inDropdown) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dropdownOpen, closeDropdown]);

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

  const dropdown = dropdownOpen && createPortal(
    <div
      ref={dropdownRef}
      className="rounded-xl shadow-xl border z-50 overflow-hidden flex flex-col"
      style={{
        ...dropdownStyle,
        backgroundColor: 'var(--bg-surface-raised)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Notifications
        </span>
        {unreadCount > 0 && (
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ backgroundColor: 'var(--accent-teal-soft)', color: 'var(--accent-teal)' }}
          >
            {unreadCount} new
          </span>
        )}
      </div>

      <div
        className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
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
      </div>
    </div>,
    document.body
  );

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleDropdown}
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
      </button>
      {dropdown}
    </div>
  );
}
