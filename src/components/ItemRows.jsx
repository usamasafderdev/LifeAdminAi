import { Calendar, Check, Clock3, ExternalLink, MoreHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Badge, CheckCircle, IconButton, PriorityBadge } from './UI';

export function TaskRow({ task, onEdit }) {
  const { completeTask, deleteTask, snoozeTask, documents } = useApp();
  const nav = useNavigate();
  const source = documents.find((d) => d.id === (task.source || task.sourceDocumentId));
  return (
    <div className={`task-row ${task.status === 'Completed' ? 'completed' : ''}`}>
      <CheckCircle checked={task.status === 'Completed'} onClick={() => completeTask(task.id)} />
      <div className="row-main">
        <strong>{task.title}</strong>
        <div className="meta">
          <span>{task.category}</span>
          <span>
            <Clock3 size={13} />
            {task.due}
          </span>
          {source && (
            <button onClick={() => nav(`/app/documents/${source.id}`)}>
              <ExternalLink size={12} />
              {source.title}
            </button>
          )}
        </div>
      </div>
      <PriorityBadge priority={task.priority} />
      <div className="row-menu">
        <IconButton label="Task actions">
          <MoreHorizontal size={17} />
        </IconButton>
        <div className="context-menu">
          <button onClick={() => onEdit?.(task)}>Edit</button>
          <button onClick={() => snoozeTask(task.id)}>Snooze</button>
          {source && (
            <button onClick={() => nav(`/app/documents/${source.id}`)}>Open source</button>
          )}
          <button className="danger-text" onClick={() => deleteTask(task.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentCard({ doc, view = 'grid' }) {
  const nav = useNavigate();
  return (
    <article className={`document-card ${view}`} onClick={() => nav(`/app/documents/${doc.id}`)}>
      <div className="doc-icon">
        <span>{doc.type === 'Invoice' ? 'PDF' : 'DOC'}</span>
      </div>
      <div className="doc-body">
        <div className="doc-top">
          <Badge tone="neutral">{doc.category}</Badge>
          {doc.priority && <PriorityBadge priority={doc.priority} />}
        </div>
        <h3>{doc.title}</h3>
        <p>{doc.summary || 'No additional information was provided.'}</p>
        <div className="meta">
          <span>
            <Calendar size={13} />
            {doc.deadline || doc.date || 'Saved'}
          </span>
          <span>{doc.status || 'Saved'}</span>
        </div>
      </div>
    </article>
  );
}

export function ReminderRow({ reminder, onSnooze, onDismiss }) {
  return (
    <div className="reminder-row">
      <div className="reminder-time">
        <Clock3 size={16} />
      </div>
      <div className="row-main">
        <strong>{reminder.title}</strong>
        <div className="meta">
          <span>{reminder.detail}</span>
          <span>{reminder.when}</span>
        </div>
      </div>
      <div className="inline-actions">
        <button onClick={onSnooze}>Snooze</button>
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
