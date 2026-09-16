import { BellRing, CalendarClock, CheckCircle2, Clock3, Search, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button, EmptyState, Field, Modal, PageHeader, Skeleton } from '../components/UI';
import { getErrorMessage } from '../services/api';

const reminderSections = [
  { icon: CalendarClock, tone: 'blue', subtitle: 'Reminders scheduled for today', empty: 'No reminders for today', hint: 'You?re all caught up for today.' },
  { icon: CalendarClock, tone: 'purple', subtitle: 'Your next scheduled reminders', empty: 'No upcoming reminders', hint: 'Plan ahead with a reminder for later.' },
  { icon: Clock3, tone: 'red', subtitle: 'Past-due reminders that need attention', empty: 'Nothing past due', hint: 'Your active reminders are on track.' },
  { icon: CheckCircle2, tone: 'green', subtitle: 'Completed or dismissed reminders', empty: 'No completed reminders', hint: 'Completed and dismissed reminders will appear here.' },
];

const localParts = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (number) => String(number).padStart(2, '0');
  return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
};

export default function Reminders() {
  const { reminders, remindersLoading, remindersError, reloadReminders, tasks, createReminder, updateReminder, deleteReminder, notify } = useApp();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const visible = useMemo(() => reminders.filter(item =>
    (status === 'all' || item.status === status) &&
    (type === 'all' || (type === 'task' ? Boolean(item.taskId) : !item.taskId)) &&
    [item.title, item.description, item.linkedTask?.title, item.linkedDocument?.title].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => sort === 'date' ? new Date(a.remindAt) - new Date(b.remindAt) : new Date(b.createdAt) - new Date(a.createdAt)), [reminders, search, status, type, sort]);
  const today = new Date().toDateString();
  const groups = useMemo(() => {
    const result = { Today: [], Upcoming: [], 'Past / Missed': [], 'Completed / Dismissed': [] };
    visible.forEach((reminder) => {
      if (reminder.status !== 'active') result['Completed / Dismissed'].push(reminder);
      else if (reminder.derivedState === 'due') result['Past / Missed'].push(reminder);
      else if (new Date(reminder.remindAt).toDateString() === today) result.Today.push(reminder);
      else result.Upcoming.push(reminder);
    });
    return Object.entries(result);
  }, [visible, today]);
  const activeCount = reminders.filter((item) => item.status === 'active').length;
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    const fields = new FormData(event.currentTarget);
    const remindAt = new Date(`${fields.get('date')}T${fields.get('time')}`);
    if (!Number.isFinite(remindAt.getTime())) { setSaving(false); return setError('Choose a valid reminder date and time.'); }
    try {
      const values = { title: fields.get('title'), description: fields.get('description'), remindAt: remindAt.toISOString(), taskId: fields.get('taskId') || null };
      if (editing?.id) await updateReminder(editing.id, values); else await createReminder(values);
      notify(editing?.id ? 'Reminder updated' : 'Reminder created'); setEditing(null);
    } catch (requestError) { setError(getErrorMessage(requestError, 'Unable to save reminder.')); }
    finally { setSaving(false); }
  };
  return <div className="reminders-workspace">
    <PageHeader title="Reminders" description="Never miss what matters. Keep track of important tasks, deadlines, and events." action={<Button onClick={() => { setError(''); setEditing({}); }}><Plus size={16} />New Reminder</Button>} />
    <section className="reminder-overview" aria-label="Reminder overview">
      <div><span className="reminder-overview-icon primary"><BellRing /></span><p><strong>{activeCount}</strong><small>Active reminders</small><span>Reminders you?re tracking</span></p></div>
      <div><span className="reminder-overview-icon blue"><CalendarClock /></span><p><strong>{reminders.filter((item) => item.derivedState === 'upcoming').length}</strong><small>Coming up</small><span>Scheduled reminders</span></p></div>
      <div><span className="reminder-overview-icon amber"><Clock3 /></span><p><strong>{reminders.filter((item) => item.derivedState === 'due').length}</strong><small>Past due</small><span>Needs your attention</span></p></div>
      <div><span className="reminder-overview-icon green"><CheckCircle2 /></span><p><strong>{reminders.filter((item) => item.status === 'completed').length}</strong><small>Completed</small><span>Finished reminders</span></p></div>
    </section>
    <div className="reminders-toolbar">
      <label className="reminders-search"><Search size={18} /><input aria-label="Search reminders" placeholder="Search reminders..." value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select aria-label="Reminder status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="completed">Completed</option><option value="dismissed">Dismissed</option></select>
      <select aria-label="Reminder type" value={type} onChange={e => setType(e.target.value)}><option value="all">All types</option><option value="task">Linked task</option><option value="manual">Standalone</option></select>
      <select aria-label="Sort reminders" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="date">Reminder date</option></select>
    </div>
    {remindersLoading ? <section className="panel"><Skeleton lines={6} /></section> : remindersError ? <EmptyState title="Reminders could not be loaded" text={remindersError} action={<Button onClick={reloadReminders}>Try again</Button>} /> : <>
      {(search || status !== 'all' || type !== 'all') && <p className="reminders-results" role="status">{visible.length} matching reminder{visible.length === 1 ? '' : 's'} <button onClick={() => { setSearch(''); setStatus('all'); setType('all'); }}>Clear filters</button></p>}
      <div className="reminder-columns">
      {groups.map(([name, items], index) => {
        const section = reminderSections[index];
        const Icon = section.icon;
        return <section className={`panel reminder-group tone-${section.tone}`} key={name} aria-label={name}>
          <div className="section-head"><span className="reminder-section-icon"><Icon size={20} /></span><div><h2>{name}</h2><p>{section.subtitle}</p></div><span className="reminder-group-count">{items.length}</span></div>
          <div className="reminder-group-list">{items.length ? items.map(reminder => <ReminderCard reminder={reminder} key={reminder.id} onEdit={() => { setError(''); setEditing(reminder); }} onDismiss={() => updateReminder(reminder.id, { status: 'dismissed' }).then(() => notify('Reminder dismissed')).catch(e => notify(getErrorMessage(e)))} onComplete={() => updateReminder(reminder.id, { status: 'completed' }).then(() => notify('Reminder completed')).catch(e => notify(getErrorMessage(e)))} onDelete={() => setDeleting(reminder)} />) : <div className="reminder-empty"><Icon /><strong>{section.empty}</strong><span>{section.hint}</span>{index < 2 && <Button variant="secondary" onClick={() => { setError(''); setEditing({}); }}><Plus size={15} />New Reminder</Button>}</div>}</div>
        </section>;
      })}
      </div>
    </>}
    <ReminderModal reminder={editing} tasks={tasks} saving={saving} error={error} onClose={() => setEditing(null)} onSave={save} />
    <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete reminder"><div className="modal-form"><p>Delete “{deleting?.title}” permanently?</p><div className="modal-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button onClick={() => deleteReminder(deleting.id).then(() => { setDeleting(null); notify('Reminder deleted'); }).catch((e) => notify(getErrorMessage(e)))}><Trash2 size={14} />Delete</Button></div></div></Modal>
  </div>;
}

function ReminderCard({ reminder, onEdit, onDismiss, onComplete, onDelete }) {
  const date = new Date(reminder.remindAt);
  return <article className={`reminder-row real-reminder-row reminder-${reminder.derivedState}`}><div className="reminder-time">{reminder.status === 'completed' ? <CheckCircle2 /> : <Clock3 />}</div><div className="row-main"><strong>{reminder.title}</strong>{reminder.description && <span className="reminder-detail">{reminder.description}</span>}<div className="reminder-datetime"><strong>{date.toLocaleDateString(undefined, { dateStyle: 'medium' })}</strong><i /><strong>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</strong></div>{reminder.linkedTask && <small>Task: {reminder.linkedTask.title}</small>}{reminder.linkedDocument && <small>Source: {reminder.linkedDocument.title}</small>}<span className={`reminder-state state-${reminder.derivedState}`}>{reminder.derivedState === 'due' ? 'Overdue' : reminder.derivedState}</span></div><div className="inline-actions"><button onClick={onEdit}><Pencil />Edit</button>{reminder.status === 'active' && <button className="reminder-complete" onClick={onComplete}><CheckCircle2 />Complete</button>}{reminder.status === 'active' && <button className="snooze" onClick={onDismiss}>Dismiss</button>}<button className="dismiss" onClick={onDelete}><Trash2 />Delete</button></div></article>;
}

function ReminderModal({ reminder, tasks, saving, error, onClose, onSave }) {
  const parts = localParts(reminder?.remindAt);
  return <Modal open={reminder !== null} onClose={onClose} title={reminder?.id ? 'Edit reminder' : 'Create reminder'}><form className="modal-form" onSubmit={onSave}>{error && <p className="form-error">{error}</p>}<Field label="Reminder title"><input name="title" defaultValue={reminder?.title || ''} maxLength="200" required /></Field><Field label="Description"><textarea name="description" defaultValue={reminder?.description || ''} maxLength="2000" /></Field><div className="form-grid"><Field label="Date"><input name="date" type="date" defaultValue={parts.date} required /></Field><Field label="Time"><input name="time" type="time" defaultValue={parts.time} required /></Field></div><Field label="Linked task" hint="Optional"><select name="taskId" defaultValue={reminder?.taskId || ''}><option value="">Standalone reminder</option>{tasks.filter((task) => task.status !== 'Completed').map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field><div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button disabled={saving}>{saving ? 'Saving…' : 'Save reminder'}</Button></div></form></Modal>;
}
