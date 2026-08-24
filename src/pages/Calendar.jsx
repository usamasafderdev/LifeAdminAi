import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Badge, Button, Drawer, PageHeader, PriorityBadge } from '../components/UI';
import { DEMO_TODAY, formatDate, toDateKey } from '../utils/dates';

export default function Calendar() {
  const { tasks, documents, reminders } = useApp();
  const nav = useNavigate();
  const base = new Date(`${DEMO_TODAY}T12:00:00`);
  const [cursor, setCursor] = useState({ year: base.getFullYear(), month: base.getMonth() });
  const [event, setEvent] = useState(null);
  const events = useMemo(() => [
    ...tasks.filter(t => t.date).map(t => ({ ...t, eventType: 'Task', eventDate: t.date })),
    ...documents.map(d => ({ ...d, eventType: d.category === 'Appointment' ? 'Appointment' : 'Document', eventDate: d.deadlineDate || toDateKey(d.deadline) })).filter(e => e.eventDate),
    ...reminders.map(r => ({ ...r, eventType: 'Reminder', eventDate: r.date || toDateKey(r.when) })).filter(e => e.eventDate),
  ], [tasks, documents, reminders]);
  const first = new Date(cursor.year, cursor.month, 1);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(cursor.year, cursor.month, i - offset + 1); return { date: d, key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`, outside: d.getMonth() !== cursor.month }; });
  const move = (delta) => setCursor(v => { const d = new Date(v.year, v.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  return <>
    <PageHeader title="Calendar" description="Deadlines, appointments and reminders in one view." action={<div className="calendar-nav"><Button variant="secondary" onClick={() => move(-1)}><ChevronLeft /></Button><strong className="month-label">{first.toLocaleString('en-US',{month:'long',year:'numeric'})}</strong><Button variant="secondary" onClick={() => move(1)}><ChevronRight /></Button></div>} />
    <section className="calendar panel"><div className="weekday">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x => <span key={x}>{x}</span>)}</div><div className="calendar-grid">{cells.map(cell => <div className={`${cell.outside ? 'outside' : ''} ${cell.key === DEMO_TODAY ? 'today' : ''}`} key={cell.key}><b>{cell.date.getDate()}</b>{events.filter(e => toDateKey(e.eventDate) === cell.key).slice(0,3).map(e => <button className={`cal-event ${(e.priority || 'medium').toLowerCase()}`} key={`${e.eventType}-${e.id}`} onClick={() => setEvent(e)}><i />{e.title}</button>)}</div>)}</div></section>
    <Drawer open={!!event} onClose={() => setEvent(null)} title={event?.title}><div className="event-detail"><div className="event-date-block"><span>{event?.eventDate && new Date(`${toDateKey(event.eventDate)}T12:00:00`).toLocaleString('en-US',{month:'short'}).toUpperCase()}</span><strong>{toDateKey(event?.eventDate).slice(8)}</strong><small>{toDateKey(event?.eventDate).slice(0,4)}</small></div><Badge tone="neutral">{event?.eventType}</Badge>{event?.priority && <PriorityBadge priority={event.priority} />}<dl><dt>Date</dt><dd>{formatDate(event?.eventDate)}</dd><dt>Details</dt><dd>{event?.summary || event?.detail || event?.description || event?.category}</dd></dl><Button onClick={() => { if (event?.eventType === 'Document') nav(`/app/documents/${event.id}`); else if (event?.source) nav(`/app/documents/${event.source}`); else nav(event?.eventType === 'Reminder' ? '/app/reminders' : '/app/tasks'); }}>Open {event?.eventType}</Button></div></Drawer>
  </>;
}
