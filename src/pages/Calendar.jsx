import { BellRing, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Drawer, EmptyState, PageHeader, PriorityBadge, Skeleton } from '../components/UI';
import { getErrorMessage } from '../services/api';
import { integrationService } from '../services/integrationService';
import SchedulePanel from '../components/SchedulePanel';

const dateKey = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export default function Calendar() {
  const nav = useNavigate(); const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [events, setEvents] = useState([]); const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const first = new Date(cursor.year, cursor.month, 1); const start = new Date(cursor.year, cursor.month, 1); const end = new Date(cursor.year, cursor.month + 1, 1);
  const load = async () => { setLoading(true); setError(''); try { setEvents(await integrationService.calendar(start.toISOString(), end.toISOString())); } catch (e) { setError(getErrorMessage(e, 'Unable to load your calendar.')); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [cursor.year, cursor.month]);
  const move = (delta) => setCursor((value) => { const date = new Date(value.year, value.month + delta, 1); return { year: date.getFullYear(), month: date.getMonth() }; });
  const cells = useMemo(() => { const offset = (first.getDay() + 6) % 7; return Array.from({ length: 42 }, (_, index) => { const date = new Date(cursor.year, cursor.month, index - offset + 1); return { date, key: dateKey(date), outside: date.getMonth() !== cursor.month }; }); }, [cursor.year, cursor.month]);
  return <>
    <PageHeader title="Calendar" description="Plan your time, review scheduled work, and track deadlines." action={<div className="calendar-nav"><Button variant="secondary" onClick={() => move(-1)}><ChevronLeft /></Button><strong className="month-label">{first.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</strong><Button variant="secondary" onClick={() => move(1)}><ChevronRight /></Button></div>} />
    <SchedulePanel />
    <h2>Task deadlines and reminders</h2>
    {loading ? <section className="panel"><Skeleton lines={9} /></section> : error ? <EmptyState title="Calendar could not be loaded" text={error} action={<Button onClick={load}>Try again</Button>} /> : <>
      <section className="calendar-legend"><span><i className="task" />Task due date</span><span><i className="reminder" />Reminder</span></section>
      <section className="calendar panel"><div className="weekday">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((cell) => <div className={`${cell.outside ? 'outside' : ''} ${cell.key === dateKey(now) ? 'today' : ''}`} key={cell.key}><b>{cell.date.getDate()}</b>{events.filter((event) => dateKey(event.date) === cell.key).slice(0, 4).map((event) => <button className={`cal-event calendar-${event.type} ${(event.priority || 'medium').toLowerCase()}`} key={`${event.type}-${event.id}`} onClick={() => setSelected(event)}><i />{event.type === 'reminder' && <BellRing size={10} />}{event.title}</button>)}</div>)}</div></section>
      {!events.length && <div className="calendar-empty"><CalendarDays /><span>No task deadlines or active reminders this month.</span></div>}
      <section className="calendar-mobile-list">{events.map((event) => <button key={`${event.type}-${event.id}`} onClick={() => setSelected(event)}><time>{new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span><strong>{event.title}</strong><small>{event.type === 'task' ? 'Task due date' : `Reminder · ${new Date(event.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}</small></span></button>)}</section>
    </>}
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title}><div className="event-detail"><Badge tone={selected?.type === 'reminder' ? 'warning' : 'neutral'}>{selected?.type === 'task' ? 'Task due date' : 'Reminder'}</Badge>{selected?.priority && <PriorityBadge priority={selected.priority} />}<dl><dt>Date</dt><dd>{selected?.date && new Date(selected.date).toLocaleString()}</dd><dt>Status</dt><dd>{selected?.status}</dd><dt>Details</dt><dd>{selected?.description || 'No additional details.'}</dd></dl><Button onClick={() => nav(selected?.type === 'task' ? '/app/tasks' : '/app/reminders')}>Open {selected?.type}</Button></div></Drawer>
  </>;
}
