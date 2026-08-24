import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TaskRow } from '../components/ItemRows';
import {
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PriorityBadge,
  SearchBox,
} from '../components/UI';
import { useApp } from '../context/AppContext';
import { DEMO_TODAY, dueLabel, isOverdue, isThisWeek } from '../utils/dates';

export default function Tasks() {
  const { tasks, setTasks, notify } = useApp();
  const [tab, setTab] = useState('All'),
    [query, setQuery] = useState(''),
    [priority, setPriority] = useState('All'),
    [category, setCategory] = useState('All'),
    [edit, setEdit] = useState(null);
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (tab === 'All' ||
            (tab === 'Completed'
              ? t.status === 'Completed'
              : tab === 'Overdue'
                ? isOverdue(t.date) && t.status !== 'Completed'
                : tab === 'Today'
                  ? t.date === DEMO_TODAY
                  : isThisWeek(t.date))) &&
          (priority === 'All' || (t.userPriority || t.systemPriority || t.priority) === priority) &&
          (category === 'All' || t.category === category) &&
          t.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [tasks, tab, query, priority, category],
  );
  const save = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = {
      title: fd.get('title'),
      priority: fd.get('priority'),
      status: fd.get('status'),
      description: fd.get('description'), category: fd.get('category'), date: fd.get('date'),
      due: dueLabel(fd.get('date')), userPriority: fd.get('priority'),
    };
    if (edit.id === 'new')
      setTasks((v) => [
        {
          id: crypto.randomUUID(),
          ...values,
          systemPriority: values.priority,
          source: null,
        },
        ...v,
      ]);
    else setTasks((v) => v.map((t) => (t.id === edit.id ? { ...t, ...values } : t)));
    setEdit(null);
    notify(edit.id === 'new' ? 'Task created' : 'Task changes saved');
  };
  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Actions generated from your documents and personal information."
        action={
          <Button
            onClick={() => setEdit({ id: 'new', title: '', priority: 'MEDIUM', status: 'Pending' })}
          >
            <Plus size={16} />
            New task
          </Button>
        }
      />
      <section className="count-strip">
        {[
          [
            'Today',
            tasks.filter((t) => t.date === DEMO_TODAY && t.status !== 'Completed').length,
          ],
          [
            'Upcoming',
            tasks.filter((t) => t.date > DEMO_TODAY && t.status !== 'Completed').length,
          ],
          [
            'Overdue',
            tasks.filter((t) => isOverdue(t.date) && t.status !== 'Completed').length,
          ],
          ['Completed', tasks.filter((t) => t.status === 'Completed').length],
        ].map((x) => (
          <button key={x[0]} onClick={() => setTab(x[0])}>
            <span>{x[0]}</span>
            <strong>{x[1]}</strong>
          </button>
        ))}
      </section>
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search tasks…" />
        <div className="tool-filters">
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="All">All priorities</option>
            {['URGENT','HIGH','MEDIUM','LOW'].map(x => <option key={x}>{x}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="All">All categories</option>
            {[...new Set(tasks.map(t => t.category))].sort().map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <div className="tabs">
        {['All', 'Today', 'This Week', 'Overdue', 'Completed'].map((x) => (
          <button className={tab === x ? 'active' : ''} onClick={() => setTab(x)} key={x}>
            {x}
          </button>
        ))}
      </div>
      <section className="panel task-list">
        {filtered.length ? (
          filtered.map((t) => <TaskRow key={t.id} task={t} onEdit={setEdit} />)
        ) : (
          <EmptyState
            title="Nothing needs your attention"
            text="You’re all caught up in this view."
          />
        )}
      </section>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id === 'new' ? 'Create task' : 'Edit task'}
      >
        <form className="modal-form" onSubmit={save}>
          <Field label="Title">
            <input name="title" defaultValue={edit?.title} required />
          </Field>
          <Field label="Description"><textarea name="description" defaultValue={edit?.description || ''} /></Field>
          <div className="form-grid">
            <Field label="Category"><select name="category" defaultValue={edit?.category || 'Personal'}>{[...new Set([...tasks.map(t => t.category), 'Personal'])].map(x => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Due date"><input name="date" type="date" defaultValue={edit?.date || DEMO_TODAY} required /></Field>
            <Field label="Priority">
              <select name="priority" defaultValue={edit?.priority}>
                <option>URGENT</option>
                <option>HIGH</option>
                <option>MEDIUM</option>
                <option>LOW</option>
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={edit?.status}>
                <option>Pending</option>
                <option>Completed</option>
              </select>
            </Field>
          </div>
          {edit?.id !== 'new' && (
            <div className="ai-origin">
              <span>AI Generated</span>
              <strong>Yes</strong>
              <span>System priority</span>
              <PriorityBadge priority={edit?.systemPriority || edit?.priority} />
              <span>Your priority</span>
              <PriorityBadge priority={edit?.priority} />
            </div>
          )}
          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
