import { useApp } from '../context/AppContext';
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  PageHeader,
  PriorityBadge,
  Skeleton,
} from '../components/UI';
import { getErrorMessage } from '../services/api';
import { integrationService } from '../services/integrationService';
import SchedulePanel from '../components/SchedulePanel';

const dateKey = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function Calendar() {
  const { tasks, reminders } = useApp();
  const requestVersion = useRef(0);
  const nav = useNavigate();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(cursor.year, cursor.month, 1);
  const end = new Date(cursor.year, cursor.month + 1, 1);
  const load = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const rows = await integrationService.calendar(start.toISOString(), end.toISOString());
      if (version !== requestVersion.current) return;
      setEvents(rows);
      setSelected((current) =>
        current
          ? rows.find((row) => row.id === current.id && row.type === current.type) || null
          : null,
      );
    } catch (e) {
      setError(getErrorMessage(e, 'Unable to load your calendar.'));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [cursor.year, cursor.month, tasks, reminders]);
  const move = (delta) =>
    setCursor((value) => {
      const date = new Date(value.year, value.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  const cells = useMemo(() => {
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(cursor.year, cursor.month, index - offset + 1);
      return { date, key: dateKey(date), outside: date.getMonth() !== cursor.month };
    });
  }, [cursor.year, cursor.month]);
  const monthSummary = useMemo(() => {
    const taskCount = tasks.filter((task) => {
      if (!task.due) return false;
      const dueDate = new Date(task.due);
      return (
        !Number.isNaN(dueDate.getTime()) &&
        dueDate.getFullYear() === cursor.year &&
        dueDate.getMonth() === cursor.month
      );
    }).length;
    const reminderCount = reminders.filter((reminder) => {
      if (!reminder.date) return false;
      const reminderDate = new Date(reminder.date);
      return (
        !Number.isNaN(reminderDate.getTime()) &&
        reminderDate.getFullYear() === cursor.year &&
        reminderDate.getMonth() === cursor.month
      );
    }).length;
    return {
      taskCount,
      reminderCount,
      eventCount: events.length,
    };
  }, [tasks, reminders, cursor.year, cursor.month, events]);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Plan your time, review scheduled work, and track deadlines."
      />
      <div className="calendar-shell">
        <SchedulePanel />
        <section className="calendar-overview panel">
          <header className="calendar-overview-header">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2>Task deadlines and reminders</h2>
            </div>
          </header>

          <div className="calendar-summary-row">
            <div className="calendar-summary-card calendar-summary-task">
              <span className="calendar-summary-icon"><CalendarDays size={16} /></span>
              <div>
                <strong>{monthSummary.taskCount}</strong>
                <b>Task deadlines</b>
                <small>Due this month</small>
              </div>
            </div>
            <div className="calendar-summary-card calendar-summary-reminder">
              <span className="calendar-summary-icon"><BellRing size={16} /></span>
              <div>
                <strong>{monthSummary.reminderCount}</strong>
                <b>Reminders</b>
                <small>This month</small>
              </div>
            </div>
            <div className="calendar-summary-card calendar-summary-scheduled">
              <span className="calendar-summary-icon"><CheckCircle2 size={16} /></span>
              <div>
                <strong>{monthSummary.eventCount}</strong>
                <b>Scheduled items</b>
                <small>Across your calendar</small>
              </div>
            </div>
          </div>

          <div className="calendar-toolbar">
            <div className="calendar-month-toolbar">
              <Button variant="secondary" onClick={() => move(-1)} aria-label="Previous month">
                <ChevronLeft size={15} />
                <span>Previous</span>
              </Button>
              <strong>{first.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong>
              <Button variant="secondary" onClick={() => move(1)} aria-label="Next month">
                <span>Next</span>
                <ChevronRight size={15} />
              </Button>
            </div>
            <div className="calendar-view-switcher" aria-label="Calendar view">
              <button className="active" type="button" aria-current="page">Month</button>
              <button type="button" disabled title="Week view is available in Smart Scheduling">Week</button>
              <button type="button" disabled title="Day view is available in Smart Scheduling">Day</button>
            </div>
          </div>

          {loading ? (
            <section className="panel calendar-skeleton">
              <Skeleton lines={9} />
            </section>
          ) : error ? (
            <EmptyState
              title="Calendar could not be loaded"
              text={error}
              action={<Button onClick={load}>Try again</Button>}
            />
          ) : (
            <>
              <section className="calendar calendar-surface">
                <div className="weekday">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {cells.map((cell) => (
                    <div
                      className={`${cell.outside ? 'outside' : ''} ${cell.key === dateKey(now) ? 'today' : ''}`}
                      key={cell.key}
                    >
                      <b>{cell.date.getDate()}</b>
                      {events
                        .filter((event) => dateKey(event.date) === cell.key)
                        .slice(0, 4)
                        .map((event) => (
                          <button
                            className={`cal-event calendar-${event.type} ${(event.priority || 'medium').toLowerCase()} ${event.status === 'completed' ? 'completed' : ''}`}
                            key={`${event.type}-${event.id}`}
                            onClick={() => setSelected(event)}
                          >
                            <i />
                            {event.type === 'reminder' && <BellRing size={10} />}
                            <span className="cal-event-title">{event.title}</span>
                            <small>
                              {event.type === 'task' ? 'Task' : 'Reminder'}
                              {event.priority ? ` · ${event.priority}` : ''}
                              {event.type === 'reminder' && event.date ? ` · ${new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
                            </small>
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              </section>
              {!events.length && (
                <div className="calendar-empty">
                  <CalendarDays />
                  <span>No task deadlines or active reminders this month.</span>
                </div>
              )}
              <div className="calendar-legend">
                <span><i className="task" />Task due date</span>
                <span><i className="reminder" />Reminder</span>
                <span><i className="completed" />Completed</span>
                <span><i className="today" />Today</span>
              </div>
              <section className="calendar-mobile-list">
                {events.map((event) => (
                  <button key={`${event.type}-${event.id}`} onClick={() => setSelected(event)}>
                    <time>
                      {new Date(event.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {event.type === 'task'
                          ? 'Task due date'
                          : `Reminder · ${new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                      </small>
                    </span>
                  </button>
                ))}
              </section>
            </>
          )}
        </section>
      </div>
      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title}>
        <div className="event-detail">
          <Badge tone={selected?.type === 'reminder' ? 'warning' : 'neutral'}>
            {selected?.type === 'task' ? 'Task due date' : 'Reminder'}
          </Badge>
          {selected?.priority && <PriorityBadge priority={selected.priority} />}
          <dl>
            <dt>Date</dt>
            <dd>{selected?.date && new Date(selected.date).toLocaleString()}</dd>
            <dt>Status</dt>
            <dd>{selected?.status}</dd>
            <dt>Details</dt>
            <dd>{selected?.description || 'No additional details.'}</dd>
          </dl>
          <Button onClick={() => nav(selected?.type === 'task' ? '/app/tasks' : '/app/reminders')}>
            Open {selected?.type}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
