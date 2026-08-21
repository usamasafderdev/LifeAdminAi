import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ReminderRow } from '../components/ItemRows';
import { Button, Field, Modal, PageHeader } from '../components/UI';

export default function Reminders() {
  const { reminders, setReminders, notify } = useApp();
  const [modal, setModal] = useState(false);
  const snooze = (id) => {
    setReminders((v) =>
      v.map((r) => (r.id === id ? { ...r, status: 'Snoozed', when: 'Tomorrow at 9:00 AM' } : r)),
    );
    notify('Reminder snoozed');
  };
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
      <div className="reminder-columns">
        {['Today', 'Upcoming', 'Snoozed', 'History'].map((status) => (
          <section className="panel reminder-group" key={status}>
            <div className="section-head">
              <div>
                <h2>{status === 'History' ? 'Sent / History' : status}</h2>
                <p>{reminders.filter((r) => r.status === status).length} reminders</p>
              </div>
            </div>
            {reminders
              .filter((r) => r.status === status)
              .map((r) => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  onSnooze={() => snooze(r.id)}
                  onDismiss={() => dismiss(r.id)}
                />
              ))}
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
                detail: 'Personal reminder',
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
            <textarea placeholder="Optional context" />
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
