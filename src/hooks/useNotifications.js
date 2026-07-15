import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { getApiOrigin } from '@/config/api';
import { getDeviceId } from '@/lib/deviceId';

const POLL_INTERVAL_MS = 30000;

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const intervalRef = useRef(null);
  const mountedRef = useRef(true);

  const getHeaders = useCallback(async () => {
    const auth = getAuth();
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    return {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId(),
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const base = getApiOrigin();
      const res = await fetch(`${base}/api/notifications/unread-count`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        setUnreadCount(data.unread_count ?? 0);
      }
    } catch (_) {
      // Silently ignore polling errors
    }
  }, [getHeaders]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const base = getApiOrigin();
      const res = await fetch(`${base}/api/notifications?limit=50`, { headers });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json();
      if (mountedRef.current) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count ?? 0);
      }
    } catch (_) {
      // Silently ignore
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [getHeaders]);

  const markRead = useCallback(async (conversationId) => {
    if (!conversationId) return;
    try {
      const headers = await getHeaders();
      const base = getApiOrigin();
      const res = await fetch(`${base}/api/conversations/${encodeURIComponent(conversationId)}/notifications/mark-read`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setUnreadCount(data.unread_count ?? 0);
          setNotifications((prev) =>
            prev.map((n) =>
              n.conversation_id === conversationId ? { ...n, read: true } : n
            )
          );
        }
      }
    } catch (_) {
      // Silently ignore
    }
  }, [getHeaders]);

  useEffect(() => {
    mountedRef.current = true;
    fetchUnreadCount();
    intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchUnreadCount]);

  const toggleDropdown = useCallback(() => {
    setDropdownOpen((prev) => {
      if (!prev) {
        fetchNotifications();
      }
      return !prev;
    });
  }, [fetchNotifications]);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
  }, []);

  const handleNotificationClick = useCallback(async (notification) => {
    if (!notification.read) {
      await markRead(notification.conversation_id);
    }
    closeDropdown();
    return notification.conversation_id;
  }, [markRead, closeDropdown]);

  return {
    unreadCount,
    notifications,
    loading,
    dropdownOpen,
    toggleDropdown,
    closeDropdown,
    markRead,
    handleNotificationClick,
  };
}
