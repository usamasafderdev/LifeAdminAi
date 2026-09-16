import { AlertTriangle, CheckCircle2, Clock3, FileText, Hourglass, MoreHorizontal, Sun, BellRing, CalendarDays, Check, ChevronDown, CircleDot, Folder, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, PageHeader, PriorityBadge, SearchBox, Skeleton } from '../components/UI';
import { useApp } from '../context/AppContext';
import { TODAY, isOverdue } from '../utils/dates';
import { getErrorMessage } from '../services/api';

export default function Tasks() {
  const { tasks, documents, tasksLoading, tasksError, reloadTasks, createTask, updateTask, deleteTask, completeTask, createReminder, notify } = useApp();
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('All');
  const [source, setSource] = useState('All');
  const [sort, setSort] = useState('Newest');
  const [edit, setEdit] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [reminderTask, setReminderTask] = useState(null);

  const filtered = useMemo(() => tasks.filter((task) =>
    (tab === 'All' || task.status === tab) &&
    (priority === 'All' || task.priority === priority) &&
    (source === 'All' || task.category === source) &&
    (task.title.toLowerCase().includes(query.trim().toLowerCase()) || documents.find((document) => String(document.id) === String(task.documentId))?.title?.toLowerCase().includes(query.trim().toLowerCase())),
  ).sort((a, b) => {
    if (sort === 'Due date') return (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31');
    if (sort === 'Priority') {
      const priorityDifference = ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority] ?? 3);
      if (priorityDifference) return priorityDifference;
      const dueDifference = (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31');
      return dueDifference || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  }), [tasks, documents, tab, query, priority, source, sort]);

  const boardItems = useMemo(() => {
    const documentInfo = new Map(documents.map((document) => [String(document.id), document]));
    const grouped = new Map();
    const items = [];
    filtered.forEach((task) => {
      if (!task.documentId) return items.push({ kind: 'task', id: task.id, task, status: task.status, date: task.date });
      const key = String(task.documentId);
      const document = documentInfo.get(key);
      if (!grouped.has(key)) grouped.set(key, { kind: 'group', id: `document-${key}`, documentId: key, title: document?.title || 'Document assignment', category: document?.category || 'AI Confirmed', tasks: [] });
      grouped.get(key).tasks.push(task);
    });
    grouped.forEach((group) => {
      const active = group.tasks.filter((task) => task.status !== 'Completed');
      group.status = active.length === 0 ? 'Completed' : active.some((task) => task.status === 'In Progress') ? 'In Progress' : 'Pending';
      group.date = active.find((task) => task.date === TODAY)?.date || active.map((task) => task.date).filter(Boolean).sort()[0] || '';
      items.push(group);
    });
    return items;
  }, [filtered, documents]);

  const lanes = useMemo(() => [
    { key: 'backlog', title: 'Backlog & Upcoming', tone: 'rose', description: 'Assignments and upcoming actions', items: boardItems.filter((item) => !['Completed', 'In Progress'].includes(item.status) && item.date !== TODAY) },
    { key: 'focus', title: "Today's Focus", tone: 'blue', description: 'Work that needs attention today', items: boardItems.filter((item) => !['Completed', 'In Progress'].includes(item.status) && item.date === TODAY) },
    { key: 'progress', title: 'In Progress', tone: 'amber', description: 'Work currently underway', items: boardItems.filter((item) => item.status === 'In Progress') },
    { key: 'completed', title: 'Completed', tone: 'green', description: 'Finished work', items: boardItems.filter((item) => item.status === 'Completed') },
  ], [boardItems]);

  const counts = [
    ['Today', tasks.filter((task) => task.date === TODAY && task.status !== 'Completed').length],
    ['Upcoming', tasks.filter((task) => task.date > TODAY && task.status !== 'Completed').length],
    ['Overdue', tasks.filter((task) => isOverdue(task.date) && task.status !== 'Completed').length],
    ['Completed', tasks.filter((task) => task.status === 'Completed').length],
  ];

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const fields = new FormData(event.currentTarget);
    const values = {
      title: fields.get('title'),
      description: fields.get('description'),
      priorityOverride: fields.get('priorityOverride'),
      status: fields.get('status'),
      dueDate: fields.get('date') || null,
      estimatedDuration: fields.get('estimatedDuration') ? Number(fields.get('estimatedDuration')) : null,
    };
    try {
      if (edit.id === 'new') await createTask(values);
      else await updateTask(edit.id, values);
      notify(edit.id === 'new' ? 'Task created' : 'Task changes saved');
      setEdit(null);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const task = deleting;
    setDeleting(null);
    try {
      await deleteTask(task.id);
      notify('Task deleted');
    } catch (error) {
      notify(getErrorMessage(error));
    }
  };

  return <div className="tasks-workspace">
    <PageHeader title="Tasks" description="Stay organized, one clear next step at a time." action={<Button onClick={() => { setFormError(''); setEdit({ id: 'new', title: '', priorityOverride: '', status: 'Pending' }); }}><Plus size={16} />New Task</Button>} />
    <section className="count-strip task-metrics" aria-label="Task summary">{counts.map(([label, count]) => { const Icon = { Today: CalendarDays, Upcoming: Clock3, Overdue: AlertTriangle, Completed: CheckCircle2 }[label]; return <div className={`task-metric metric-${label.toLowerCase()}`} key={label}><span className="task-metric-icon"><Icon aria-hidden="true" /></span><div><span>{label}</span><strong>{count}</strong><small>{{ Today: 'tasks due today', Upcoming: 'tasks in the future', Overdue: 'tasks past due', Completed: 'tasks finished' }[label]}</small></div></div>; })}</section>
    <div className="toolbar task-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search tasks…" /><div className="tool-filters"><select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="All">All priorities</option>{['HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}><option value="All">All sources</option><option>AI Generated</option><option>AI Confirmed</option><option>Personal</option></select><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value)}>{['Newest', 'Due date', 'Priority'].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="task-view-bar"><div className="tabs task-tabs" aria-label="Filter by task status">{['All', 'Pending', 'In Progress', 'Completed'].map((value) => <button aria-pressed={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{value}</button>)}</div><span className="task-result-count">{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}</span></div>
    {tasksLoading ? <section className="panel"><Skeleton lines={6} /></section> : tasksError ? <section className="panel"><EmptyState title="Tasks could not be loaded" text={tasksError} action={<Button onClick={reloadTasks}>Try again</Button>} /></section> : (filtered.length || !tasks.length) ? <section className="task-kanban" aria-label="Task board" tabIndex={0}>{lanes.map((lane) => <div className={`task-lane lane-${lane.tone}`} key={lane.key}><header><div><h2><span className="task-lane-icon" aria-hidden="true">{lane.key === 'backlog' ? <Hourglass /> : lane.key === 'focus' ? <Sun /> : lane.key === 'progress' ? <CircleDot /> : <CheckCircle2 />}</span>{lane.title}</h2><span>{lane.items.length}</span></div><p>{lane.description}</p></header><div className="task-lane-body">{lane.items.length ? lane.items.map((item) => item.kind === 'group' ? <TaskGroupCard group={item} key={item.id} onEdit={(task) => { setFormError(''); setEdit(task); }} onDelete={setDeleting} onComplete={(task) => completeTask(task.id).catch((error) => notify(getErrorMessage(error)))} onReminder={setReminderTask} /> : <TaskKanbanCard task={item.task} key={item.id} onEdit={() => { setFormError(''); setEdit(item.task); }} onDelete={() => setDeleting(item.task)} onComplete={() => completeTask(item.id).catch((error) => notify(getErrorMessage(error)))} onReminder={() => setReminderTask(item.task)} />) : <div className="task-lane-empty">{lane.key === 'focus' ? <CalendarDays /> : lane.key === 'completed' ? <CheckCircle2 /> : lane.key === 'progress' ? <CircleDot /> : <FileText />}<strong>{lane.key === 'focus' ? 'No tasks for today' : lane.key === 'progress' ? 'No tasks in progress' : lane.key === 'completed' ? 'Completed tasks appear here' : 'Nothing queued up'}</strong><p>{lane.key === 'completed' ? 'Finish a task to see your progress.' : lane.key === 'focus' ? "You're all caught up for today." : lane.key === 'progress' ? 'Work underway will appear here.' : 'Future and unscheduled work lives here.'}</p>{lane.key !== 'completed' && <Button variant="secondary" onClick={() => { setFormError(''); setEdit({ id: 'new', title: '', priorityOverride: '', status: 'Pending' }); }}><Plus size={14} />New Task</Button>}</div>}</div></div>)}</section> : <section className="panel"><EmptyState title="Nothing needs your attention" text="You're all caught up in this view." /></section>}
    <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id === 'new' ? 'Create task' : 'Edit task'}><form className="modal-form" onSubmit={save}><Field label="Title"><input name="title" defaultValue={edit?.title} maxLength="200" required /></Field><Field label="Description"><textarea name="description" defaultValue={edit?.description || ''} maxLength="2000" /></Field><div className="form-grid"><Field label="Estimated duration (minutes)" hint="Leave blank for a suggested estimate when scheduling."><input name="estimatedDuration" type="number" min="1" max="2400" step="1" defaultValue={edit?.estimatedDuration || ''} /></Field><Field label="Due date"><input name="date" type="date" defaultValue={edit?.date || ''} /></Field><Field label="Priority control" hint="Automatic uses due-date urgency and confirmed importance."><select name="priorityOverride" defaultValue={edit?.priorityOverride || ''}><option value="">Use automatic priority</option>{['HIGH', 'MEDIUM', 'LOW'].map((value) => <option value={value} key={value}>Override: {value[0] + value.slice(1).toLowerCase()}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={edit?.status || 'Pending'}><option>Pending</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select></Field></div>{edit?.id !== 'new' && <div className="priority-insight"><div><span>Effective priority</span><PriorityBadge priority={edit?.priority} />{edit?.priorityOverride && <em>User override</em>}</div><div><span>Automatic calculation</span><PriorityBadge priority={edit?.calculatedPriority} /><strong>{edit?.priorityScore}/100</strong></div>{edit?.priorityReasons?.length > 0 && <ul>{edit.priorityReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}<small>{edit?.priorityOverride ? `Calculated ${edit.calculatedPriority?.toLowerCase()}, overridden to ${edit.priorityOverride.toLowerCase()} by you.` : 'Automatic priority is active.'}</small></div>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save task'}</Button></div></form></Modal>
    <ConfirmDialog open={Boolean(deleting)} title="Delete task?" text={`“${deleting?.title || ''}” will be permanently removed.`} confirmLabel="Delete task" onClose={() => setDeleting(null)} onConfirm={remove} />
    <TaskReminderModal task={reminderTask} onClose={() => setReminderTask(null)} onSave={async (values) => { try { await createReminder(values); setReminderTask(null); notify('Reminder created'); } catch (error) { notify(getErrorMessage(error)); } }} />
  </div>;
}

function TaskGroupCard({ group, onEdit, onDelete, onComplete, onReminder }) {
  const [expanded, setExpanded] = useState(false);
  const completed = group.tasks.filter((task) => task.status === 'Completed').length;
  const highestPriority = group.tasks.some((task) => task.priority === 'HIGH') ? 'HIGH' : group.tasks.some((task) => task.priority === 'MEDIUM') ? 'MEDIUM' : 'LOW';
  const visibleTasks = expanded ? group.tasks : group.tasks.slice(0, 2);
  const hiddenCount = group.tasks.length - visibleTasks.length;
  const accent = documentAccent(group.documentId, group.title, group.category);
  return <article className={`task-group-card ${expanded ? 'is-expanded' : 'is-collapsed'}`} style={{ '--folder-accent': accent.color, '--folder-tint': accent.tint }}>
    <button className="task-group-header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span className="task-group-icon">{expanded ? <FolderOpen /> : <Folder />}</span>
      <span className="task-group-heading"><strong>{group.title}</strong><em>{completed} of {group.tasks.length} tasks completed</em></span>
      <PriorityBadge priority={highestPriority} />
      <ChevronDown className={expanded ? 'is-open' : ''} />
    </button>
    <div className="task-group-progress" aria-label={`${completed} of ${group.tasks.length} completed`}><i style={{ width: `${group.tasks.length ? (completed / group.tasks.length) * 100 : 0}%` }} /></div>
    <div className="task-group-items">{visibleTasks.map((task) => <div className={`task-group-item ${task.status === 'Completed' ? 'is-completed' : ''}`} key={task.id}>
      <button className={`kanban-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={() => onComplete(task)} aria-label={task.status === 'Completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.status === 'Completed' && <Check />}</button>
      <button className="task-group-item-copy" onClick={() => onEdit(task)}><strong>{task.title}</strong>{task.description && <span>{task.description}</span>}<small><CalendarDays />{task.date ? new Date(`${task.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '') : 'No due date'}</small></button>
      <span className="task-priority-display" title={task.priorityReasons?.join(' • ')}><PriorityBadge priority={task.priority} /></span>
      <TaskActions title={task.title} onReminder={() => onReminder(task)} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />
    </div>)}</div>
    {group.tasks.length > 2 && <div className="task-group-disclosure">{!expanded && <span>+{hiddenCount} more task{hiddenCount === 1 ? '' : 's'}</span>}<button onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse' : 'View all tasks'}<ChevronDown className={expanded ? 'is-open' : ''} /></button></div>}
  </article>;
}

const DOCUMENT_ACCENTS = [
  { color: '#8b7cf6', tint: 'rgba(139,124,246,.12)' },
  { color: '#5f8ff4', tint: 'rgba(95,143,244,.12)' },
  { color: '#43b5aa', tint: 'rgba(67,181,170,.12)' },
  { color: '#d69a45', tint: 'rgba(214,154,69,.12)' },
  { color: '#d97891', tint: 'rgba(217,120,145,.12)' },
  { color: '#6f7de5', tint: 'rgba(111,125,229,.12)' },
  { color: '#4eae7d', tint: 'rgba(78,174,125,.12)' },
  { color: '#dc844e', tint: 'rgba(220,132,78,.12)' },
];

export function documentAccent(documentId, title = '', category = '') {
  const label = `${title} ${category}`.toLowerCase();
  if (/\binvoice\b|\bbill\b/.test(label)) return DOCUMENT_ACCENTS[7];
  if (/\bmeeting\b|\bappointment\b/.test(label)) return DOCUMENT_ACCENTS[6];
  if (/\bapplication\b/.test(label)) return DOCUMENT_ACCENTS[2];
  if (/\bassignment\s+a\b/.test(label)) return DOCUMENT_ACCENTS[0];
  if (/\bassignment\s+b\b/.test(label)) return DOCUMENT_ACCENTS[1];
  const stableKey = String(documentId || title || category || 'document');
  let hash = 0;
  for (let index = 0; index < stableKey.length; index += 1) hash = ((hash << 5) - hash + stableKey.charCodeAt(index)) | 0;
  return DOCUMENT_ACCENTS[Math.abs(hash) % DOCUMENT_ACCENTS.length];
}

function TaskKanbanCard({ task, onEdit, onDelete, onComplete, onReminder }) {
  const formattedDate = task.date ? new Date(`${task.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '') : 'No due date';
  return <article className={`kanban-task ${task.status === 'Completed' ? 'is-completed' : ''}`}><div className="kanban-task-top"><button className={`kanban-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={onComplete} aria-label={task.status === 'Completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.status === 'Completed' && <Check />}</button><button className="kanban-task-title" onClick={onEdit}><strong>{task.title}</strong></button><span className="task-priority-display" title={task.priorityReasons?.join(' • ')}><PriorityBadge priority={task.priority} /></span></div>{task.description && <p>{task.description}</p>}<div className="kanban-task-meta"><span>{task.category}</span><span><CalendarDays />{formattedDate}</span></div><footer><span className="task-status-pill">{task.status === 'Pending' ? 'To do' : task.status}</span><TaskActions title={task.title} onReminder={onReminder} onEdit={onEdit} onDelete={onDelete} /></footer></article>;
}

function TaskActions({ title, onReminder, onEdit, onDelete }) {
  return <details className="task-actions-disclosure" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}>
    <summary aria-label={`Actions for ${title}`} title="Task actions"><MoreHorizontal aria-hidden="true" /></summary>
    <div>{[[BellRing, 'Set reminder for', 'Reminder', onReminder], [Pencil, 'Edit', 'Edit', onEdit], [Trash2, 'Delete', 'Delete', onDelete]].map(([Icon, label, text, action]) => <button type="button" key={label} aria-label={`${label} ${title}`} onClick={event => { event.currentTarget.closest('details').open = false; action(); }}><Icon aria-hidden="true" />{text}</button>)}</div>
  </details>;
}

function TaskReminderModal({ task, onClose, onSave }) {
  if (!task) return null;
  const suggested = task.date ? new Date(`${task.date}T09:00:00`) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (task.date) suggested.setDate(suggested.getDate() - 1);
  if (suggested <= new Date()) suggested.setTime(Date.now() + 60 * 60 * 1000);
  const local = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000).toISOString();
  return <Modal open onClose={onClose} title="Set task reminder"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); onSave({ taskId: task.id, title: fields.get('title'), description: fields.get('description'), remindAt: new Date(`${fields.get('date')}T${fields.get('time')}`).toISOString() }); }}><Field label="Reminder title"><input name="title" defaultValue={task.title} required /></Field><Field label="Description"><textarea name="description" defaultValue={task.description || ''} /></Field><div className="form-grid"><Field label="Date"><input name="date" type="date" defaultValue={local.slice(0, 10)} required /></Field><Field label="Time"><input name="time" type="time" defaultValue={local.slice(11, 16)} required /></Field></div><div className="modal-actions"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button>Create reminder</Button></div></form></Modal>;
}
