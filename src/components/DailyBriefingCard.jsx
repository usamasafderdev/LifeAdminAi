import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from './UI';
import { briefingService } from '../services/briefingService';
import { getErrorMessage } from '../services/api';

const eventPath = (item) =>
  item.type === 'task'
    ? `/app/tasks?task=${item.sourceId}`
    : `/app/reminders?reminder=${item.sourceId}`;
const eventDate = (item) =>
  item.type === 'task'
    ? item.date
    : new Date(item.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export default function DailyBriefingCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const alive = useRef(true);
  const retries = useRef(0);
  const inFlight = useRef(false);
  const load = async (refresh = false, passive = false) => {
    if (passive && inFlight.current) return;
    inFlight.current = true;
    const id = ++requestId.current;
    setBusy(true);
    setError('');
    try {
      const result = await (refresh ? briefingService.refresh() : briefingService.get());
      if (alive.current && id === requestId.current) setData(result);
    } catch (requestError) {
      if (alive.current && id === requestId.current)
        setError(getErrorMessage(requestError, 'Unable to load your daily briefing.'));
    } finally {
      if (alive.current && id === requestId.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    alive.current = true;
    load();
    const changed = () => {
      retries.current = 0;
      load();
    };
    const focus = () => {
      retries.current = 0;
      load(false, true);
    };
    window.addEventListener('lifeadmin-briefing-changed', changed);
    window.addEventListener('lifeadmin-memory-changed', changed);
    window.addEventListener('focus', focus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(false, true);
    }, 60000);
    return () => {
      alive.current = false;
      requestId.current++;
      window.clearInterval(timer);
      window.removeEventListener('lifeadmin-briefing-changed', changed);
      window.removeEventListener('lifeadmin-memory-changed', changed);
      window.removeEventListener('focus', focus);
    };
  }, []);
  useEffect(() => {
    if (!data?.generating || busy || retries.current >= 6) return;
    const timer = window.setTimeout(() => {
      retries.current++;
      load();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [data, busy]);
  const update = async (settings) => {
    setBusy(true);
    setError('');
    try {
      await briefingService.update(settings);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to change briefing settings.'));
      setBusy(false);
    }
  };
  if (data?.enabled === false) return null;
  if (data?.hidden)
    return (
      <div className="briefing-hidden">
        <Button variant="secondary" disabled={busy} onClick={() => update({ hidden: false })}>
          Show daily briefing
        </Button>
        {error && <span role="alert">{error}</span>}
      </div>
    );

  const briefing = data?.briefing;
  return (
    <section className="panel daily-briefing" aria-label="AI Daily Briefing">
      <header className="briefing-header">
        <div className="briefing-title-wrap">
          <div className="briefing-kicker">
            <Sparkles size={16} />
            <span>LifeAdmin Daily Briefing</span>
          </div>
          <h2 className="briefing-title">Your Day with LifeAdmin</h2>
          <p className="briefing-subtitle">
            Here is your personalized daily productivity overview.
          </p>
          <div className="briefing-date-row">
            <span className="briefing-date">{briefing?.date || 'Daily briefing'}</span>
            {data?.generatedAt && (
              <span className="briefing-updated">
                {' '}
                · Last updated{' '}
                {new Date(data.generatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>

        <div className="briefing-controls">
          <Button
            variant="primary"
            className="briefing-refresh-button"
            disabled={busy || data?.generating}
            onClick={() => {
              retries.current = 0;
              load(true);
            }}
          >
            <RefreshCw size={14} />
            {briefing ? 'Refresh' : 'Generate'}
          </Button>

          <details className="briefing-menu">
            <summary className="briefing-menu-trigger">
              <MoreHorizontal size={14} />
              <span>Options</span>
              <ChevronDown size={14} />
            </summary>
            <div className="briefing-menu-panel">
              <button
                className="briefing-menu-option"
                disabled={busy}
                onClick={() => update({ hidden: true })}
              >
                Hide briefing
              </button>
              <button
                className="briefing-menu-option"
                disabled={busy}
                onClick={() => update({ enabled: false })}
              >
                Disable daily briefing
              </button>
            </div>
          </details>
        </div>
      </header>

      {error && (
        <div className="briefing-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}

      {(busy || data?.generating) && (
        <div className="briefing-loading" role="status">
          <Sparkles size={14} />
          <span>
            {data?.generating ? 'Your briefing is being prepared.' : 'Loading your briefing…'}
          </span>
        </div>
      )}

      {briefing && (
        <div className="briefing-content">
          <section className="briefing-summary-card">
            <div className="briefing-summary-card-head">
              <Sparkles size={16} />
              <span>AI Recommendations</span>
            </div>
            <p className="briefing-summary">{briefing.summary}</p>
            {data.mode === 'fallback' && (
              <small className="briefing-fallback">
                Based on your current records. AI recommendations are temporarily unavailable.
              </small>
            )}
          </section>

          <div className="briefing-grid">
            <section className="briefing-card briefing-card-focus">
              <div className="briefing-card-head">
                <span className="briefing-card-icon">
                  <Target size={16} />
                </span>
                <span className="briefing-card-title">Today's Focus</span>
              </div>
              {briefing.focusTasks.length ? (
                <div className="briefing-task-list">
                  {briefing.focusTasks.map((task) => (
                    <article className="briefing-task-card" key={task.taskId}>
                      <div className="briefing-task-card-top">
                        <Link className="briefing-task-title" to={`/app/tasks?task=${task.taskId}`}>
                          {task.title}
                        </Link>
                        <span className={`briefing-priority priority-${task.priority}`}>
                          {task.priority}
                        </span>
                      </div>
                      <div className="briefing-task-meta">
                        <span className="briefing-date-chip">
                          <CalendarDays size={13} />
                          {task.dueDate ? `Due ${task.dueDate}` : 'No date'}
                        </span>
                      </div>
                      <p
                        className={
                          task.attention === 'high'
                            ? 'briefing-task-reason high'
                            : 'briefing-task-reason'
                        }
                      >
                        {task.reason}
                      </p>
                      <div className="briefing-task-card-action">
                        <Link className="briefing-view-link" to={`/app/tasks?task=${task.taskId}`}>
                          View Task
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="briefing-empty-card">
                  <Sparkles size={16} />
                  <span>No urgent tasks. Enjoy your day.</span>
                </div>
              )}
            </section>

            <section className="briefing-card">
              <div className="briefing-card-head">
                <span className="briefing-card-icon">
                  <CalendarDays size={16} />
                </span>
                <span className="briefing-card-title">Today's Schedule</span>
              </div>
              {briefing.scheduledBlocks?.length ? (
                <ul className="briefing-list">
                  {briefing.scheduledBlocks.map((block) => (
                    <li key={block._id} className="briefing-list-item">
                      <Link className="briefing-list-title" to="/app/calendar">
                        {block.title}
                      </Link>
                      <span className="briefing-list-meta">
                        {new Date(block.startTime).toLocaleTimeString([], {
                          timeZone: data.timeZone,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        to{' '}
                        {new Date(block.endTime).toLocaleTimeString([], {
                          timeZone: data.timeZone,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="briefing-empty-card">
                  <CalendarDays size={16} />
                  <span>No events scheduled today.</span>
                </div>
              )}
              {briefing.todayReminders.length > 0 && (
                <div className="briefing-sublist-wrap">
                  <div className="briefing-mini-head">
                    <Bell size={14} />
                    <span>Today's reminders</span>
                  </div>
                  <ul className="briefing-list">
                    {briefing.todayReminders.map((item) => (
                      <li className="briefing-list-item" key={item.sourceId}>
                        <Link className="briefing-list-title" to={eventPath(item)}>
                          {item.title}
                        </Link>
                        <span className="briefing-list-meta">{eventDate(item)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="briefing-card">
              <div className="briefing-card-head">
                <span className="briefing-card-icon">
                  <Clock3 size={16} />
                </span>
                <span className="briefing-card-title">Upcoming</span>
              </div>
              {briefing.upcomingEvents.length ? (
                <ul className="briefing-list">
                  {briefing.upcomingEvents.map((item) => (
                    <li className="briefing-list-item" key={`${item.type}-${item.sourceId}`}>
                      <Link className="briefing-list-title" to={eventPath(item)}>
                        {item.title}
                      </Link>
                      <span className="briefing-list-meta">{eventDate(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="briefing-empty-card">
                  <Clock3 size={16} />
                  <span>No upcoming events scheduled.</span>
                </div>
              )}
            </section>

            <section className="briefing-card briefing-card-recommendations">
              <div className="briefing-card-head">
                <span className="briefing-card-icon">
                  <Sparkles size={16} />
                </span>
                <span className="briefing-card-title">AI Recommendations</span>
              </div>
              {briefing.recommendations.length ? (
                <ul className="briefing-recommendation-list">
                  {briefing.recommendations.map((text) => (
                    <li key={text}>
                      <Sparkles size={13} />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="briefing-empty-card">
                  <Sparkles size={16} />
                  <span>No extra actions recommended.</span>
                </div>
              )}
            </section>

            <section className="briefing-card">
              <div className="briefing-card-head">
                <span className="briefing-card-icon">
                  <FileText size={16} />
                </span>
                <span className="briefing-card-title">Recent Documents</span>
              </div>
              {briefing.recentDocuments.length ? (
                <ul className="briefing-list">
                  {briefing.recentDocuments.map((item) => (
                    <li className="briefing-list-item" key={item.documentId}>
                      <Link
                        className="briefing-list-title"
                        to={`/app/documents/${item.documentId}`}
                      >
                        {item.title}
                      </Link>
                      <span className="briefing-list-meta">Document</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="briefing-empty-card">
                  <FileText size={16} />
                  <span>No documents yet.</span>
                </div>
              )}

              {briefing.importantDocuments.length > 0 && (
                <div className="briefing-sublist-wrap">
                  <div className="briefing-mini-head">
                    <Sparkles size={14} />
                    <span>Documents needing review</span>
                  </div>
                  <ul className="briefing-list">
                    {briefing.importantDocuments.map((item) => (
                      <li className="briefing-list-item" key={item.documentId}>
                        <Link
                          className="briefing-list-title"
                          to={`/app/documents/${item.documentId}`}
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <small className="briefing-footnote">
            This daily snapshot is reused. Refresh briefing after changing tasks, reminders, or
            documents.
          </small>
        </div>
      )}
    </section>
  );
}

export function DailyBriefingSettings() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    briefingService
      .settings()
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, 'Unable to load briefing settings.'));
      });
    return () => {
      active = false;
    };
  }, []);
  const change = async (enabled) => {
    setBusy(true);
    setError('');
    try {
      setSettings(await briefingService.update({ enabled, hidden: false }));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save settings.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="settings-head">
        <h2>Daily briefing</h2>
        <p>
          Show a daily overview of your tasks, reminders, and recent documents on the dashboard.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {settings ? (
        <label className="toggle-row">
          <span>Enable daily briefing</span>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={busy}
            onChange={(event) => change(event.target.checked)}
          />
        </label>
      ) : (
        <p>Loading settings…</p>
      )}
      <p>
        Briefings are generated when you open the dashboard and reused for the rest of your local
        day. They do not send notifications or change your tasks.
      </p>
    </>
  );
}
