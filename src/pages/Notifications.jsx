import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  Sparkles,
  MoreHorizontal,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Button, PageHeader } from '../components/UI';
import { notificationService } from '../services/notificationService';
import { getErrorMessage } from '../services/api';

const FILTERS = ['all', 'unread', 'document', 'task', 'reminder', 'system'];

const toUpperPriority = (priority) => String(priority || 'medium').toUpperCase();

const getNotificationTypeMeta = (notification) => {
  const type = String(notification?.type || '');
  if (type.includes('document')) {
    return { label: 'Document', icon: FileText, tone: 'document' };
  }
  if (type.includes('reminder') || type === 'reminder_due') {
    return { label: 'Reminder', icon: BellRing, tone: 'reminder' };
  }
  if (type.includes('task') || type.includes('deadline') || type.includes('overdue')) {
    return { label: 'Task', icon: Clock3, tone: 'task' };
  }
  if (type.includes('schedule') || type.includes('ai') || type.includes('goal')) {
    return { label: 'System', icon: Sparkles, tone: 'system' };
  }
  return { label: 'Update', icon: Bell, tone: 'system' };
};

const getFilterMatch = (notification, filter) => {
  if (filter === 'all') return true;
  if (filter === 'unread') return !notification.read;
  const type = notification?.type || '';
  const category =
    {
      document: ['document_action'],
      task: ['overdue_task', 'deadline_approaching', 'deadline_today', 'deadline_tomorrow'],
      reminder: ['reminder_due'],
      system: ['schedule_conflict', 'ai_suggestion', 'goal_progress_warning'],
    }[filter] || [];
  return category.includes(type);
};

export default function Notifications() {
  const app = useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [older, setOlder] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [busyId, setBusyId] = useState(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
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

  const rows = useMemo(
    () => [...new Map([...app.notifications, ...older].map((n) => [n._id, n])).values()],
    [app.notifications, older],
  );

  const filteredRows = useMemo(() => {
    return [...rows]
      .filter((notification) => getFilterMatch(notification, filter))
      .sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return sort === 'oldest' ? left - right : right - left;
      });
  }, [rows, filter, sort]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'unread',
        label: 'Unread',
        value: app.unreadCount,
        tone: 'blue',
        icon: Bell,
      },
      {
        key: 'document',
        label: 'Document alerts',
        value: rows.filter((item) => item.type === 'document_action').length,
        tone: 'purple',
        icon: FileText,
      },
      {
        key: 'task',
        label: 'Task reminders',
        value: rows.filter((item) =>
          [
            'overdue_task',
            'deadline_approaching',
            'deadline_today',
            'deadline_tomorrow',
            'reminder_due',
          ].includes(item.type),
        ).length,
        tone: 'amber',
        icon: Clock3,
      },
      {
        key: 'system',
        label: 'System updates',
        value: rows.filter((item) =>
          ['schedule_conflict', 'ai_suggestion', 'goal_progress_warning'].includes(item.type),
        ).length,
        tone: 'green',
        icon: Sparkles,
      },
    ],
    [app.unreadCount, rows],
  );

  const handleOpen = async (notification) => {
    if (busyId) return;
    setBusyId(notification._id);
    setError('');
    try {
      const path = await notificationService.resource(notification._id);
      await app.markNotificationRead(notification._id);
      navigate(path);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkRead = async (notification) => {
    if (busyId || notification.read) return;
    setBusyId(notification._id);
    setError('');
    try {
      await app.markNotificationRead(notification._id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (notification) => {
    if (busyId) return;
    setBusyId(notification._id);
    setError('');
    try {
      await app.deleteNotification(notification._id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Stay updated with important alerts, task reminders, and document insights."
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
            className="notifications-mark-read"
          >
            <Check size={16} />
            Mark all read
          </Button>
        }
      />

      {(error || app.notificationsError) && (
        <p className="notification-inline-alert" role="alert">
          {error || app.notificationsError}{' '}
          <button type="button" onClick={app.reloadNotifications}>
            Retry
          </button>
        </p>
      )}

      <section className="notifications-dashboard">
        <div className="notification-summary-grid">
          {summaryCards.map(({ key, label, value, tone, icon: Icon }) => (
            <article key={key} className={`notification-summary-card tone-${tone}`}>
              <div className="notification-summary-icon">
                <Icon size={22} />
              </div>
              <div className="notification-summary-meta">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="notifications-toolbar">
          <div
            className="notifications-filter-row"
            role="tablist"
            aria-label="Notification filters"
          >
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                className={filter === option ? 'is-active' : ''}
                onClick={() => setFilter(option)}
              >
                {option === 'all' && 'All'}
                {option === 'unread' && 'Unread'}
                {option === 'document' && 'Document'}
                {option === 'task' && 'Task'}
                {option === 'reminder' && 'Reminder'}
                {option === 'system' && 'System'}
              </button>
            ))}
          </div>

          <div className="notifications-sort-wrap">
            <label htmlFor="notification-sort">Sort</label>
            <div className="notifications-sort-select">
              <select id="notification-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        {!app.notificationsLoading && !filteredRows.length ? (
          <div className="notifications-empty-state">
            <div className="notifications-empty-icon">
              <Inbox size={24} />
            </div>
            <h3>No notifications</h3>
            <p>
              {filter === 'all'
                ? 'You are all caught up. New alerts will appear here automatically.'
                : 'No items match this filter right now. Try another view or check back later.'}
            </p>
          </div>
        ) : null}

        {app.notificationsLoading && !rows.length ? (
          <div className="notifications-empty-state is-loading">
            <div className="notifications-empty-icon">
              <Bell size={24} />
            </div>
            <h3>Loading notifications</h3>
            <p>Gathering your latest alerts and reminders.</p>
          </div>
        ) : null}

        {filteredRows.length > 0 && (
          <div className="notifications-list">
            {filteredRows.map((notification) => {
              const typeMeta = getNotificationTypeMeta(notification);
              const Icon = typeMeta.icon;
              const isUnread = !notification.read;
              const isBusy = busyId === notification._id;

              return (
                <article
                  key={notification._id}
                  className={`notification-list-item ${isUnread ? 'is-unread' : 'is-read'}`}
                >
                  <div className={`notification-entry-icon tone-${typeMeta.tone}`}>
                    <Icon size={18} />
                  </div>

                  <div className="notification-entry-body">
                    <div className="notification-entry-heading">
                      <div>
                        <span className="notification-entry-label">{typeMeta.label}</span>
                        <h3>{notification.title}</h3>
                      </div>
                      <span
                        className={`notification-priority priority-${notification.priority || 'medium'}`}
                      >
                        {toUpperPriority(notification.priority)}
                      </span>
                    </div>

                    <p className="notification-entry-message">{notification.message}</p>

                    {notification.metadata?.advice && (
                      <p className="notification-entry-advice">{notification.metadata.advice}</p>
                    )}

                    <div className="notification-entry-footer">
                      <time dateTime={notification.createdAt}>
                        {new Date(notification.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>

                      <span className={`notification-state-pill ${isUnread ? 'unread' : 'read'}`}>
                        {isUnread ? 'Unread' : 'Read'}
                      </span>
                    </div>
                  </div>

                  <div className="notification-entry-actions">
                    <button
                      type="button"
                      className="notification-open-btn"
                      onClick={() => handleOpen(notification)}
                      disabled={isBusy}
                    >
                      {isBusy ? 'Opening…' : 'View'}
                    </button>

                    {!notification.read && (
                      <button
                        type="button"
                        className="notification-secondary-btn"
                        onClick={() => handleMarkRead(notification)}
                        disabled={isBusy}
                      >
                        Mark read
                      </button>
                    )}

                    <button
                      type="button"
                      className="notification-menu-btn"
                      aria-label="More notification actions"
                      onClick={() => handleDelete(notification)}
                      disabled={isBusy}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {cursor && !app.notificationsLoading && filteredRows.length > 0 && (
          <div className="notifications-load-row">
            <Button variant="secondary" disabled={busy} onClick={loadMore}>
              {busy ? 'Loading…' : 'Load older notifications'}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
