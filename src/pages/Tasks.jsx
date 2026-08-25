import { CalendarDays, Check, CircleDot, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, EmptyState, Field, Modal, PageHeader, PriorityBadge, SearchBox } from '../components/UI';
import { useApp } from '../context/AppContext';
import { DEMO_TODAY, dueLabel, isOverdue, isThisWeek } from '../utils/dates';

export default function Tasks() {
  const { tasks, setTasks, notify, completeTask } = useApp();
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('All');
  const [category, setCategory] = useState('All');
  const [edit, setEdit] = useState(null);
  const filtered = useMemo(() => tasks.filter((task) =>
    (tab === 'All' || (tab === 'Completed' ? task.status === 'Completed' : tab === 'Overdue' ? isOverdue(task.date) && task.status !== 'Completed' : tab === 'Today' ? task.date === DEMO_TODAY : isThisWeek(task.date))) &&
    (priority === 'All' || (task.userPriority || task.systemPriority || task.priority) === priority) &&
    (category === 'All' || task.category === category) &&
    task.title.toLowerCase().includes(query.trim().toLowerCase()),
  ), [tasks, tab, query, priority, category]);
  const lanes = useMemo(() => [
    { key: 'backlog', title: 'Backlog & Upcoming', tone: 'rose', description: 'Planned work and upcoming actions', tasks: filtered.filter((task) => task.status !== 'Completed' && task.status !== 'In Progress' && task.date !== DEMO_TODAY) },
    { key: 'focus', title: "Today's Focus", tone: 'blue', description: 'Tasks that need attention today', tasks: filtered.filter((task) => task.status !== 'Completed' && task.status !== 'In Progress' && task.date === DEMO_TODAY) },
    { key: 'progress', title: 'In Progress', tone: 'amber', description: 'Work currently underway', tasks: filtered.filter((task) => task.status === 'In Progress') },
    { key: 'completed', title: 'Completed', tone: 'green', description: 'Finished tasks', tasks: filtered.filter((task) => task.status === 'Completed') },
  ], [filtered]);
  const counts = [
    ['Today', tasks.filter((task) => task.date === DEMO_TODAY && task.status !== 'Completed').length],
    ['Upcoming', tasks.filter((task) => task.date > DEMO_TODAY && task.status !== 'Completed').length],
    ['Overdue', tasks.filter((task) => isOverdue(task.date) && task.status !== 'Completed').length],
    ['Completed', tasks.filter((task) => task.status === 'Completed').length],
  ];
  const save = (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const values = { title: fields.get('title'), priority: fields.get('priority'), status: fields.get('status'), description: fields.get('description'), category: fields.get('category'), date: fields.get('date'), due: dueLabel(fields.get('date')), userPriority: fields.get('priority') };
    if (edit.id === 'new') setTasks((current) => [{ id: crypto.randomUUID(), ...values, systemPriority: values.priority, source: null }, ...current]);
    else setTasks((current) => current.map((task) => task.id === edit.id ? { ...task, ...values } : task));
    setEdit(null); notify(edit.id === 'new' ? 'Task created' : 'Task changes saved');
  };
  return <><PageHeader title="My Tasks" description="Actions generated from your documents and personal information." action={<Button onClick={() => setEdit({ id: 'new', title: '', priority: 'MEDIUM', status: 'Pending' })}><Plus size={16} />New task</Button>} />
    <section className="count-strip task-metrics">{counts.map(([label, count]) => <button className={`task-metric metric-${label.toLowerCase()}`} key={label} onClick={() => setTab(label)}><span><small>{label}</small><strong>{count}</strong></span><i aria-hidden="true"><b style={{ '--metric-progress': `${Math.min(100, count * 12)}%` }} /></i></button>)}</section>
    <div className="toolbar task-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search tasks…" /><div className="tool-filters"><select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="All">All priorities</option>{['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All categories</option>{[...new Set(tasks.map((task) => task.category))].sort().map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="tabs task-tabs">{['All', 'Today', 'This Week', 'Overdue', 'Completed'].map((value) => <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{value}</button>)}</div>
    {filtered.length ? <section className="task-kanban" aria-label="Task board">{lanes.map((lane) => <div className={`task-lane lane-${lane.tone}`} key={lane.key}><header><div><h2>{lane.title}</h2><span>{lane.tasks.length}</span></div><p>{lane.description}</p></header><div className="task-lane-body">{lane.tasks.length ? lane.tasks.map((task) => <TaskKanbanCard task={task} key={task.id} onEdit={() => setEdit(task)} onComplete={() => completeTask(task.id)} />) : <div className="task-lane-empty"><CircleDot /><span>No tasks here</span></div>}</div></div>)}</section> : <section className="panel"><EmptyState title="Nothing needs your attention" text="You’re all caught up in this view." /></section>}
    <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id === 'new' ? 'Create task' : 'Edit task'}><form className="modal-form" onSubmit={save}><Field label="Title"><input name="title" defaultValue={edit?.title} required /></Field><Field label="Description"><textarea name="description" defaultValue={edit?.description || ''} /></Field><div className="form-grid"><Field label="Category"><select name="category" defaultValue={edit?.category || 'Personal'}>{[...new Set([...tasks.map((task) => task.category), 'Personal'])].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Due date"><input name="date" type="date" defaultValue={edit?.date || DEMO_TODAY} required /></Field><Field label="Priority"><select name="priority" defaultValue={edit?.priority}>{['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={edit?.status}><option>Pending</option><option>In Progress</option><option>Completed</option></select></Field></div>{edit?.id !== 'new' && <div className="ai-origin"><span>System priority</span><PriorityBadge priority={edit?.systemPriority || edit?.priority} /><span>Your priority</span><PriorityBadge priority={edit?.priority} /></div>}<div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit">Save changes</Button></div></form></Modal>
  </>;
}

function TaskKanbanCard({ task, onEdit, onComplete }) {
  const priority = task.userPriority || task.systemPriority || task.priority;
  const formattedDate = task.date ? new Date(`${task.date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(',', '') : task.due;
  return <article className={`kanban-task ${task.status === 'Completed' ? 'is-completed' : ''}`}><div className="kanban-task-top"><button className={`kanban-check ${task.status === 'Completed' ? 'checked' : ''}`} onClick={onComplete} aria-label={task.status === 'Completed' ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.status === 'Completed' && <Check />}</button><button className="kanban-task-title" onClick={onEdit}><strong>{task.title}</strong></button><PriorityBadge priority={priority} /></div>{task.description && <p>{task.description}</p>}<div className="kanban-task-meta"><span>{task.category}</span><span><CalendarDays />{formattedDate}</span></div><footer><span className="task-status-pill">{task.status === 'Pending' ? 'To do' : task.status}</span><button onClick={onEdit} aria-label={`Edit ${task.title}`}><Pencil />Edit</button></footer></article>;
}
