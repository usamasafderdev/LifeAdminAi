import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Button, PageHeader } from '../components/UI';
import { NotificationItem } from '../components/NotificationCenter';
import { notificationService } from '../services/notificationService';
import { getErrorMessage } from '../services/api';

export default function Notifications() {
  const app = useApp();
  const { user } = useAuth();
  const [older, setOlder] = useState([]),
    [cursor, setCursor] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setOlder([]);
    setCursor(app.nextCursor);
  }, [app.notifications, app.nextCursor, user?._id]);
  const loadMore = async () => {
    const version = generation.current;
    setBusy(true);
    try {
      const data = await notificationService.list({ before: cursor });
      if (generation.current === version) {
        setOlder((rows) => [...rows, ...data.notifications]);
        setCursor(data.nextCursor);
        setError('');
      }
    } catch (e) {
      if (generation.current === version) setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const rows = [...new Map([...app.notifications, ...older].map((n) => [n._id, n])).values()];
  return (
    <>
      <PageHeader
        title="Notifications"
        description={`${app.unreadCount} unread updates. Alerts are checked in the background.`}
        action={
          <Button
            disabled={!app.unreadCount || busy}
            onClick={async () => {
              try {
                await app.markAllNotificationsRead();
              } catch (e) {
                setError(getErrorMessage(e));
              }
            }}
          >
            Mark all read
          </Button>
        }
      />
      {(error || app.notificationsError) && (
        <p role="alert">
          {error || app.notificationsError} <button onClick={app.reloadNotifications}>Retry</button>
        </p>
      )}
      <section className="panel notifications-page">
        {rows.map((n) => (
          <NotificationItem key={n._id} notification={n} />
        ))}
        {!rows.length && (
          <p>
            {app.notificationsLoading
              ? 'Loading notifications…'
              : 'No notifications yet. New alerts appear here automatically.'}
          </p>
        )}
        {cursor && (
          <Button variant="secondary" disabled={busy} onClick={loadMore}>
            {busy ? 'Loading…' : 'Load older notifications'}
          </Button>
        )}
      </section>
    </>
  );
}
