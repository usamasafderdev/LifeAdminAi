import { CalendarDays, Check, ChevronDown, CircleDot, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, PageHeader, PriorityBadge, SearchBox, Skeleton } from '../components/UI';
import { useApp } from '../context/AppContext';
import { DEMO_TODAY, isOverdue } from '../utils/dates';
import { getErrorMessage } from '../services/api';

export default function Tasks() {
  const { tasks, documents, tasksLoading, tasksError, reloadTasks, createTask, updateTask, deleteTask, completeTask, notify } = useApp();
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('All');
  const [source, setSource] = useState('All');
  const [sort, setSort] = useState('Newest');
  const [edit, setEdit] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const filtered = useMemo(() => tasks.filter((task) =>
    (tab === 'All' || task.status === tab) &&
    (priority === 'All' || task.priority === priority) &&
    (source === 'All' || task.category === source) &&
    (task.title.toLowerCase().includes(query.trim().toLowerCase()) || documents.find((document) => String(document.id) === String(task.documentId))?.title?.toLowerCase().includes(query.trim().toLowerCase())),
  ).sort((a, b) => {
    if (sort === 'Due date') return (a.date || '9999-12-31').localeCompare(b.date || '9999-12-31');
    if (sort === 'Priority') return ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] ?? 3) - ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority] ?? 3);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  }), [tasks, documents, tab, query, priority, source, sort]);

  const boardItems = useMemo(() => {
    const documentNames = new Map(documents.map((document) => [String(document.id), document.title]));
    const grouped = new Map();
    const items = [];
    filtered.forEach((task) => {
      if (!task.documentId) return items.push({ kind: 'task', id: task.id, task, status: task.status, date: task.date });
      const key = String(task.documentId);
      if (!grouped.has(key)) grouped.set(key, { kind: 'group', id: `document-${key}`, documentId: key, title: documentNames.get(key) || 'Document assignment', tasks: [] });
      grouped.get(key).tasks.push(task);
    });
    grouped.forEach((group) => {
      const active = group.tasks.filter((task) => task.status !== 'Completed');
      group.status = active.length === 0 ? 'Completed' : active.some((task) => task.status === 'In Progress') ? 'In Progress' : 'Pending';
      group.date = active.find((task) => task.date === DEMO_TODAY)?.date || active.map((task) => task.date).filter(Boolean).sort()[0] || '';
      items.push(group);
    });
    return items;
  }, [filtered, documents]);

  const lanes = useMemo(() => [
    { key: 'backlog', title: 'Backlog & Upcoming', tone: 'rose', description: 'Assignments and upcoming actions', items: boardItems.filter((item) => !['Completed', 'In Progress'].includes(item.status) && item.date !== DEMO_TODAY) },
    { key: 'focus', title: "Today's Focus", tone: 'blue', description: 'Work that needs attention today', items: boardItems.filter((item) => !['Completed', 'In Progress'].includes(item.status) && item.date === DEMO_TODAY) },
    { key: 'progress', title: 'In Progress', tone: 'amber', description: 'Work currently underway', items: boardItems.filter((item) => item.status === 'In Progress') },
    { key: 'completed', title: 'Completed', tone: 'green', description: 'Finished work', items: boardItems.filter((item) => item.status === 'Completed') },
  ], [boardItems]);

  const counts = [
    ['Today', tasks.filter((task) => task.date === DEMO_TODAY && task.status !== 'Completed').length],
    ['Upcoming', tasks.filter((task) => task.date > DEMO_TODAY && task.status !== 'Completed').length],
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
      priority: fields.get('priority'),
      status: fields.get('status'),
      dueDate: fields.get('date') || null,
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

  return <>
    <PageHeader title="My Tasks" description="Actions generated from confirmed documents and tasks you create yourself." action={<Button onClick={() => { setFormError(''); setEdit({ id: 'new', title: '', priority: 'MEDIUM', status: 'Pending' }); }}><Plus size={16} />New task</Button>} />
    <section className="count-strip task-metrics">{counts.map(([label, count]) => <div className={`task-metric metric-${label.toLowerCase()}`} key={label}><span><small>{label}</small><strong>{count}</strong></span><i aria-hidden="true"><b style={{ '--metric-progress': `${Math.min(100, count * 12)}%` }} /></i></div>)}</section>
    <div className="toolbar task-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search tasks…" /><div className="tool-filters"><select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="All">All priorities</option>{['HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Source" value={source} onChange={(event) => setSource(event.target.value)}><option value="All">All sources</option><option>AI Confirmed</option><option>Personal</option></select><select aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value)}>{['Newest', 'Due date', 'Priority'].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="tabs task-tabs">{['All', 'Pending', 'In Progress', 'Completed'].map((value) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{value}</button>)}</div>
    {tasksLoading ? <section className="panel"><Skeleton lines={6} /></section> : tasksError ? <section className="panel"><EmptyState title="Tasks could not be loaded" text={tasksError} action={<Button onClick={reloadTasks}>Try again</Button>} /></section> : filtered.length ? <section className="task-kanban" aria-label="Task board">{lanes.map((lane) => <div className={`task-lane lane-${lane.tone}`} key={lane.key}><header><div><h2>{lane.title}</h2><span>{lane.items.length}</span></div><p>{lane.description}</p></header><div className="task-lane-body">{lane.items.length ? lane.items.map((item) => item.kind === 'group' ? <TaskGroupCard group={item} key={item.id} onEdit={(task) => { setFormError(''); setEdit(task); }} onDelete={setDeleting} onComplete={(task) => completeTask(task.id).catch((error) => notify(getErrorMessage(error)))} /> : <TaskKanbanCard task={item.task} key={item.id} onEdit={() => { setFormError(''); setEdit(item.task); }} onDelete={() => setDeleting(item.task)} onComplete={() => completeTask(item.id).catch((error) => notify(getErrorMessage(error)))} />) : <div className="task-lane-empty"><CircleDot /><span>No tasks here</span></div>}</div></div>)}</section> : <section className="panel"><EmptyState title="Nothing needs your attention" text="You're all caught up in this view." /></section>}
    <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id === 'new' ? 'Create task' : 'Edit task'}><form className="modal-form" onSubmit={save}><Field label="Title"><input name="title" defaultValue={edit?.title} maxLength="200" required /></Field><Field label="Description"><textarea name="description" defaultValue={edit?.description || ''} maxLength="2000" /></Field><div className="form-grid"><Field label="Due date"><input name="date" type="date" defaultValue={edit?.date || ''} /></Field><Field label="Priority"><select name="priority" defaultValue={edit?.priority || 'MEDIUM'}>{['HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={edit?.status || 'Pending'}><option>Pending</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select></Field></div>{edit?.id !== 'new' && <div className="ai-origin"><span>Source</span><Badge>{edit?.category}</Badge><span>Priority</span><PriorityBadge priority={edit?.priority} /></div>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save task'}</Button></div></form></Modal>
    <ConfirmDialog open={Boolean(deleting)} title="Delete task?" text={`“${deleting?.title || ''}” will be permanently removed.`} confirmLabel="Delete task" onClose={() => setDeleting(null)} onConfirm={remove} />
  </>;
}

function TaskGroupCard({ group, onEdit, onDelete, onComplete }) {
  const [expanded, setExpanded] = useState(true);
  const completed = group.tasks.filter((task) => task.status === 'Completed').length;
  const highestPriority = group.tasks.some((task) => task.priority === 'HIGH') ? 'HIGH' : group.tasks.some((task) => task.priority === 'MEDIUM') ? 'MEDIUM' : 'LOW';
  return <article className="task-group-card">
    <button className="task-group-header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span className="task-group-icon"><FileText /></span>
      <span className="task-group-heading"><small>DOCUMENT ASSIGNMENT</small><strong>{group.title}</strong><em>{completed} of {group.tasks.length} important actions completed</em></span>
      <PriorityBadge priority={highestPriority} />
      <ChevronDown className={expanded ? 'is-open' : ''} />
    </button>
    <div className="task-group-progress" aria-label={`${completed} of ${group.tasks.length} completed`}><i style={{ width: `${group.tasks.length ? (completed / group.tasks.length) * 100 : 0}%` }} /></div>
    {expanded && <div className="task-group-items">{group.tasks.map((task) => <div className={`task-group-item ${task.status === 'Completed' ? 'is-completed' : ''}`} key={task.id}>
      <button className={`kanban-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={() => onComplete(task)} aria-label={task.status === 'Completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.status === 'Completed' && <Check />}</button>
      <button className="task-group-item-copy" onClick={() => onEdit(task)}><strong>{task.title}</strong>{task.description && <span>{task.description}</span>}</button>
      <PriorityBadge priority={task.priority} />
      <div className="task-group-item-actions"><button onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}><Pencil /></button><button onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`}><Trash2 /></button></div>
    </div>)}</div>}
  </article>;
}

function TaskKanbanCard({ task, onEdit, onDelete, onComplete }) {
  const formattedDate = task.date ? new Date(`${task.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '') : 'No due date';
  return <article className={`kanban-task ${task.status === 'Completed' ? 'is-completed' : ''}`}><div className="kanban-task-top"><button className={`kanban-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={onComplete} aria-label={task.status === 'Completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.status === 'Completed' && <Check />}</button><button className="kanban-task-title" onClick={onEdit}><strong>{task.title}</strong></button><PriorityBadge priority={task.priority} /></div>{task.description && <p>{task.description}</p>}<div className="kanban-task-meta"><span>{task.category}</span><span><CalendarDays />{formattedDate}</span></div><footer><span className="task-status-pill">{task.status === 'Pending' ? 'To do' : task.status}</span><div className="task-card-actions"><button onClick={onEdit} aria-label={`Edit ${task.title}`}><Pencil />Edit</button><button onClick={onDelete} aria-label={`Delete ${task.title}`}><Trash2 />Delete</button></div></footer></article>;
}
