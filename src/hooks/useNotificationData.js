import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { getErrorMessage } from '../services/api';

const empty = {
  notifications: [],
  unreadCount: 0,
  importantCount: 0,
  importantNotifications: [],
  nextCursor: null,
};
export function useNotificationData(userId) {
  const [state, setState] = useState({ owner: null, ...empty });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const current = useRef(userId);
  current.current = userId;
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!userId) return;
    const version = ++generation.current;
    setLoading(true);
    try {
      const data = await notificationService.list();
      if (current.current === userId && generation.current === version) {
        setState({ owner: userId, ...data });
        setError('');
      }
    } catch (e) {
      if (current.current === userId && generation.current === version)
        setError(getErrorMessage(e, 'Unable to load notifications.'));
    } finally {
      if (current.current === userId && generation.current === version) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    setState({ owner: userId, ...empty });
    setError('');
    setLoading(false);
    localStorage.removeItem('la_notifications');
    if (!userId) return;
    reload();
    const refresh = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('lifeadmin-notifications-changed', refresh);
    return () => {
      generation.current++;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('lifeadmin-notifications-changed', refresh);
    };
  }, [userId, reload]);
  const withImmediateReadUpdate = (id) => {
    setState((previous) => {
      if (!previous.owner || previous.notifications.length === 0) return previous;
      const target = previous.notifications.find((item) => String(item._id) === String(id));
      if (!target || target.read) return previous;
      const nextNotifications = previous.notifications.map((item) =>
        String(item._id) === String(id) ? { ...item, read: true } : item,
      );
      return {
        ...previous,
        notifications: nextNotifications,
        unreadCount: Math.max(previous.unreadCount - 1, 0),
      };
    });
  };
  const withImmediateAllReadUpdate = () => {
    setState((previous) => ({
      ...previous,
      notifications: previous.notifications.map((item) => ({ ...item, read: true })),
      unreadCount: 0,
      importantCount: 0,
      importantNotifications: [],
    }));
  };
  const withImmediateDeleteUpdate = (id) => {
    setState((previous) => {
      const nextNotifications = previous.notifications.filter(
        (item) => String(item._id) !== String(id),
      );
      const removed = previous.notifications.find((item) => String(item._id) === String(id));
      const unreadAfterDelete =
        removed && !removed.read ? Math.max(previous.unreadCount - 1, 0) : previous.unreadCount;
      const importantAfterDelete =
        removed && removed.priority === 'high' && !removed.read
          ? Math.max(previous.importantCount - 1, 0)
          : previous.importantCount;
      return {
        ...previous,
        notifications: nextNotifications,
        unreadCount: unreadAfterDelete,
        importantCount: importantAfterDelete,
        importantNotifications: previous.importantNotifications.filter(
          (item) => String(item._id) !== String(id),
        ),
      };
    });
  };
  const mutate = async (operation, optimistic) => {
    optimistic?.();
    try {
      await operation();
      if (current.current === userId) await reload();
    } catch (error) {
      setError(getErrorMessage(error, 'Unable to update notifications.'));
      await reload();
    }
  };
  const data = state.owner === userId ? state : empty;
  return {
    ...data,
    notificationsError: error,
    notificationsLoading: loading,
    reloadNotifications: reload,
    markNotificationRead: (id) =>
      mutate(
        () => notificationService.read(id),
        () => withImmediateReadUpdate(id),
      ),
    markAllNotificationsRead: () =>
      mutate(() => notificationService.readAll(), withImmediateAllReadUpdate),
    deleteNotification: (id) =>
      mutate(
        () => notificationService.remove(id),
        () => withImmediateDeleteUpdate(id),
      ),
  };
}
