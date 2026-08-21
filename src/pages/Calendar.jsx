import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Badge, Button, Drawer, PageHeader, PriorityBadge } from '../components/UI';

const days = Array.from({ length: 42 }, (_, i) => (i < 5 ? 27 + i : i - 4 > 31 ? i - 35 : i - 4));
const current = (i) => i >= 5 && i <= 35;
export default function Calendar() {
  const { tasks } = useApp();
  const [event, setEvent] = useState(null);
  const [month, setMonth] = useState(0);
  const months = ['August 2026', 'September 2026', 'October 2026'];
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Deadlines, appointments and reminders in one view."
        action={
          <div className="calendar-nav">
            <Button
              variant="secondary"
              disabled={month === 0}
              onClick={() => setMonth((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft />
            </Button>
            <strong key={months[month]} className="month-label">
              {months[month]}
            </strong>
            <Button
              variant="secondary"
              disabled={month === months.length - 1}
              onClick={() => setMonth((value) => Math.min(months.length - 1, value + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />
      <section className="calendar panel">
        <div className="weekday">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((d, i) => (
            <div
              className={`${current(i) ? '' : 'outside'} ${d === 21 && current(i) ? 'today' : ''}`}
              key={i}
            >
              <b>{d}</b>
              {month === 0 &&
                current(i) &&
                tasks
                  .filter((t) => Number(t.date.slice(8)) === d && t.date.startsWith('2026-08'))
                  .slice(0, 3)
                  .map((t) => (
                    <button
                      className={`cal-event ${t.priority.toLowerCase()}`}
                      key={t.id}
                      onClick={() => setEvent(t)}
                    >
                      <i />
                      {t.title}
                    </button>
                  ))}
            </div>
          ))}
        </div>
      </section>
      <Drawer open={!!event} onClose={() => setEvent(null)} title={event?.title}>
        <div className="event-detail">
          <div className="event-date-block">
            <span>AUG</span>
            <strong>{event?.date?.slice(8)}</strong>
            <small>2026</small>
          </div>
          <Badge tone="neutral">{event?.category}</Badge>
          <PriorityBadge priority={event?.priority} />
          <dl>
            <dt>Date</dt>
            <dd>{event?.date}</dd>
            <dt>Related item</dt>
            <dd>{event?.source ? 'Source document attached' : 'Manual task'}</dd>
          </dl>
          <Button onClick={() => setEvent(null)}>Close</Button>
        </div>
      </Drawer>
    </>
  );
}
