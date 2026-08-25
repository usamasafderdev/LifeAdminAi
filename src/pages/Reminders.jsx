import { BellRing, CalendarClock, CheckCircle2, Clock3, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ReminderRow } from '../components/ItemRows';
import { Button, Field, Modal, PageHeader } from '../components/UI';

export default function Reminders() {
  const { reminders, setReminders, notify } = useApp();
  const [modal, setModal] = useState(false);
  const snooze = (id) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setReminders((v) =>
      v.map((r) => (r.id === id ? { ...r, status: 'Snoozed', when: toLocalDateTime(tomorrow) } : r)),
    );
    notify('Reminder snoozed');
  };
  const groups = useMemo(() => ['Today', 'Upcoming', 'Snoozed', 'History'].map((status) => ({ status, reminders: reminders.filter((reminder) => reminder.status === status).sort((a, b) => (parseReminderDate(a.when)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (parseReminderDate(b.when)?.getTime() ?? Number.MAX_SAFE_INTEGER)) })), [reminders]);
  const activeCount = reminders.filter((reminder) => reminder.status !== 'History').length;
  const dismiss = (id) => {
    setReminders((v) => v.filter((r) => r.id !== id));
    notify('Reminder dismissed');
  };
  return (
    <>
      <PageHeader
        title="Reminders"
        description="Stay ahead without keeping everything in your head."
        action={
          <Button onClick={() => setModal(true)}>
            <Plus size={16} />
            Create Reminder
          </Button>
        }
      />
      <section className="reminder-overview" aria-label="Reminder overview">
        <div><span className="reminder-overview-icon primary"><BellRing /></span><p><strong>{activeCount}</strong><small>Active reminders</small></p></div>
        <div><span className="reminder-overview-icon blue"><CalendarClock /></span><p><strong>{reminders.filter((reminder) => reminder.status === 'Upcoming').length}</strong><small>Coming up</small></p></div>
        <div><span className="reminder-overview-icon amber"><Clock3 /></span><p><strong>{reminders.filter((reminder) => reminder.status === 'Snoozed').length}</strong><small>Snoozed</small></p></div>
        <div><span className="reminder-overview-icon green"><CheckCircle2 /></span><p><strong>{reminders.filter((reminder) => reminder.status === 'History').length}</strong><small>Sent reminders</small></p></div>
      </section>
      <div className="reminder-columns">
        {groups.map(({ status, reminders: groupReminders }) => (
          <section className={`panel reminder-group reminder-group-${status.toLowerCase()}`} key={status}>
            <div className="section-head">
              <div>
                <h2>{status === 'History' ? 'Sent / History' : status}</h2>
                <p>{groupReminders.length} reminder{groupReminders.length === 1 ? '' : 's'}</p>
              </div>
              <span className="reminder-group-count">{groupReminders.length}</span>
            </div>
            <div className="reminder-group-list">{groupReminders.length ? groupReminders.map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={{ ...r, displayDate: formatReminderDate(r.when) }}
                  onSnooze={() => snooze(r.id)}
                  onDismiss={() => dismiss(r.id)}
                />
              )) : <div className="reminder-empty"><Clock3 /><span>No reminders in this section</span></div>}</div>
          </section>
        ))}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Create reminder">
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setReminders((v) => [
              {
                id: crypto.randomUUID(),
                title: fd.get('title'),
                when: fd.get('date'),
                detail: fd.get('notes')?.trim() || 'Personal reminder',
                status: 'Upcoming',
              },
              ...v,
            ]);
            setModal(false);
            notify('Reminder created');
          }}
        >
          <Field label="Reminder title">
            <input name="title" required placeholder="What should we remind you about?" />
          </Field>
          <Field label="Date and time">
            <input name="date" type="datetime-local" required />
          </Field>
          <Field label="Notes">
            <textarea name="notes" placeholder="Optional context" />
          </Field>
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button>Create reminder</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function parseReminderDate(value) {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const now = new Date();
  const relative = String(value).match(/^(Today|Tomorrow) at (.+)$/i);
  if (relative) {
    const date = new Date(now);
    if (relative[1].toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1);
    const time = new Date(`${date.toDateString()} ${relative[2]}`);
    return Number.isNaN(time.getTime()) ? date : time;
  }
  const dated = new Date(`${String(value).replace(/ at /i, ' ')} ${now.getFullYear()}`);
  return Number.isNaN(dated.getTime()) ? null : dated;
}

function formatReminderDate(value) {
  const date = parseReminderDate(value);
  if (!date) return { date: String(value || 'Date not set'), time: '' };
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', ''),
    time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

function toLocalDateTime(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}
