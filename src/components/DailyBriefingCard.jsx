import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
      <header className="section-head">
        <div>
          <h2>Your day with LifeAdmin</h2>
          <p>
            {briefing?.date || 'Daily briefing'}
            {data?.generatedAt
              ? ` · Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </p>
        </div>
        <div className="briefing-controls">
          <Button
            variant="secondary"
            disabled={busy || data?.generating}
            onClick={() => {
              retries.current = 0;
              load(true);
            }}
          >
            {briefing ? 'Refresh briefing' : 'Generate new briefing'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => update({ hidden: true })}>
            Hide
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => update({ enabled: false })}>
            Disable daily briefing
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert">
          {error}{' '}
          <button type="button" onClick={() => load()}>
            Try again
          </button>
        </p>
      )}
      {(busy || data?.generating) && (
        <p role="status">
          {data?.generating ? 'Your briefing is being prepared.' : 'Loading your briefing…'}
        </p>
      )}
      {briefing && (
        <>
          <p className="briefing-summary">{briefing.summary}</p>
          {data.mode === 'fallback' && (
            <small>
              Based on your current records. AI recommendations are temporarily unavailable.
            </small>
          )}
          <div className="briefing-grid">
            <section>
              <h3>Today's schedule</h3>
              {briefing.scheduledBlocks?.length ? <ul>{briefing.scheduledBlocks.map(block => <li key={block._id}><Link to="/app/calendar">{block.title}</Link><span>{new Date(block.startTime).toLocaleTimeString([], { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' })} to {new Date(block.endTime).toLocaleTimeString([], { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul> : <p>No scheduled blocks today.</p>}
              <h3>Focus Today</h3>
              {briefing.focusTasks.length ? (
                <ol>
                  {briefing.focusTasks.map((task) => (
                    <li key={task.taskId}>
                      <Link to={`/app/tasks?task=${task.taskId}`}>{task.title}</Link>
                      <span>
                        {task.priority} priority{task.dueDate ? ` · Due ${task.dueDate}` : ''}
                      </span>
                      <p className={task.attention === 'high' ? 'briefing-high-attention' : ''}>
                        {task.reason}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No open tasks need attention.</p>
              )}
              {briefing.todayReminders.length > 0 && (
                <>
                  <h4>Today's reminders</h4>
                  <ul>
                    {briefing.todayReminders.map((item) => (
                      <li key={item.sourceId}>
                        <Link to={eventPath(item)}>{item.title}</Link>
                        <span>{eventDate(item)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section>
              <h3>Upcoming</h3>
              {briefing.upcomingEvents.length ? (
                <ul>
                  {briefing.upcomingEvents.map((item) => (
                    <li key={`${item.type}-${item.sourceId}`}>
                      <Link to={eventPath(item)}>{item.title}</Link>
                      <span>{eventDate(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No upcoming items in the next 14 days.</p>
              )}
            </section>
            <section>
              <h3>Recommendations</h3>
              {briefing.recommendations.length ? (
                <ul>
                  {briefing.recommendations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              ) : (
                <p>No extra actions recommended.</p>
              )}
              <h4>Recent documents</h4>
              {briefing.recentDocuments.length ? (
                <ul>
                  {briefing.recentDocuments.map((item) => (
                    <li key={item.documentId}>
                      <Link to={`/app/documents/${item.documentId}`}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No documents yet.</p>
              )}
              {briefing.importantDocuments.length > 0 && (
                <>
                  <h4>Documents needing review</h4>
                  <ul>
                    {briefing.importantDocuments.map((item) => (
                      <li key={item.documentId}>
                        <Link to={`/app/documents/${item.documentId}`}>{item.title}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
          <small>
            This daily snapshot is reused. Refresh briefing after changing tasks, reminders, or
            documents.
          </small>
        </>
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
