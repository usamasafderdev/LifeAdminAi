import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, IconButton } from './UI';
import { notificationService } from '../services/notificationService';
import { getErrorMessage } from '../services/api';

export function NotificationItem({ notification, onNavigate }) {
  const app = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const action = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`notification-card ${notification.read ? '' : 'unread'}`}>
      <button
        className="notification-open"
        disabled={busy}
        onClick={() =>
          action(async () => {
            const path = await notificationService.resource(notification._id);
            await app.markNotificationRead(notification._id);
            onNavigate?.();
            nav(path);
          })
        }
      >
        <div className="notification-heading">
          <strong>{notification.title}</strong>
          <span className={`notification-priority ${notification.priority}`}>
            {notification.priority}
          </span>
        </div>
        <p>{notification.message}</p>
        {notification.metadata?.advice && (
          <p className="notification-advice">{notification.metadata.advice}</p>
        )}
        <time dateTime={notification.createdAt}>
          {new Date(notification.createdAt).toLocaleString()}
        </time>
      </button>
      <div className="notification-controls">
        {!notification.read && (
          <button
            disabled={busy}
            onClick={() => action(() => app.markNotificationRead(notification._id))}
          >
            Mark read
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => action(() => app.deleteNotification(notification._id))}
        >
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </article>
  );
}
export default function NotificationCenter() {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const container = useRef(null);
  const sorted = useMemo(() => {
    return [...(app.notifications || [])]
      .sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .slice(0, 6);
  }, [app.notifications]);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.type === 'pointerdown' && !container.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);
  return (
    <div className="popover-wrap notification-portal" ref={container}>
      <IconButton
        label={`Notifications, ${app.unreadCount} unread`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) app.reloadNotifications();
        }}
      >
        <Bell size={18} />
        {app.unreadCount > 0 && (
          <b className="notif-count">{app.unreadCount > 99 ? '99+' : app.unreadCount}</b>
        )}
      </IconButton>
      {open && (
        <section
          className="popover notification-pop notification-center"
          aria-label="Notifications"
        >
          <div className="pop-head">
            <div>
              <strong>Notifications</strong>
              <small>{app.unreadCount} unread</small>
            </div>
            <IconButton label="Close notifications" onClick={() => setOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>
          {(app.notificationsError || error) && (
            <p role="alert" className="notification-alert">
              {app.notificationsError || error}{' '}
              <button onClick={app.reloadNotifications}>Retry</button>
            </p>
          )}
          <div className="notification-toolbar">
            <button
              className="notification-read-all"
              disabled={!app.unreadCount || app.notificationsLoading || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await app.markAllNotificationsRead();
                  setError('');
                } catch (e) {
                  setError(getErrorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Updating…' : 'Mark all read'}
            </button>
          </div>
          <div className="notification-scroll">
            {app.notificationsLoading && !app.notifications.length && (
              <p className="empty-state">Loading notifications…</p>
            )}
            {!app.notificationsLoading && !sorted.length && (
              <p className="empty-state">No new notifications</p>
            )}
            {sorted.map((n) => (
              <NotificationItem key={n._id} notification={n} onNavigate={() => setOpen(false)} />
            ))}
          </div>
          <Link
            className="notification-view-all"
            to="/app/notifications"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </section>
      )}
    </div>
  );
}
export function ImportantAlerts() {
  const { importantCount, importantNotifications } = useApp();
  if (!importantCount) return null;
  return (
    <section className="panel important-alerts" aria-label="Important alerts">
      <header>
        <h2>
          {importantCount} {importantCount === 1 ? 'thing needs' : 'things need'} your attention
        </h2>
        <Link to="/app/notifications">View notifications</Link>
      </header>
      {importantNotifications.map((n) => (
        <NotificationItem key={n._id} notification={n} />
      ))}
    </section>
  );
}
export function NotificationSettings() {
  const [settings, setSettings] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    notificationService
      .settings()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const change = async (values) => {
    setBusy(true);
    setError('');
    try {
      setSettings(await notificationService.updateSettings(values));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <h2>Notifications</h2>
      <p>
        Choose the alerts you receive. Changes save immediately. Existing alerts remain until you
        delete them.
      </p>
      {error && <p role="alert">{error}</p>}
      {settings ? (
        <>
          {Object.entries({
            enabled: 'Enable notifications',
            tasks: 'Task deadlines and overdue work',
            reminders: 'Reminders',
            schedule: 'Scheduling conflicts',
            documents: 'Confirmed document actions',
            goals: 'Goal progress (not available yet)',
            aiSuggestions: 'Optional AI planning suggestions',
          }).map(([key, label]) => (
            <label className="toggle-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings[key]}
                disabled={busy || (key === 'goals' && !settings.goalsAvailable)}
                onChange={(e) => change({ [key]: e.target.checked })}
              />
            </label>
          ))}
          <form
            className="notification-timezone"
            onSubmit={(e) => {
              e.preventDefault();
              change({ timezone: new FormData(e.currentTarget).get('timezone') });
            }}
          >
            <label>
              Timezone when no Calendar availability is saved
              <input
                name="timezone"
                defaultValue={settings.timezone}
                placeholder="Asia/Karachi"
                required
              />
            </label>
            <Button disabled={busy}>Save timezone</Button>
          </form>
          <p>
            Calendar’s saved timezone takes precedence. AI selects helpful advice only; backend
            rules decide urgency. Notifications do not change tasks or accept schedules.
          </p>
        </>
      ) : (
        <p>Loading preferences…</p>
      )}
    </div>
  );
}
