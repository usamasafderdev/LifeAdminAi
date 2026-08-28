import { Calendar, Check, Clock3, ExternalLink, FileImage, FileText, Keyboard, MoreHorizontal, Trash2 } from 'lucide-react';
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

export function DocumentCard({ doc, view = 'grid', onDelete }) {
  const nav = useNavigate();
  const SourceIcon = doc.sourceType === 'image' ? FileImage : doc.sourceType === 'manual' || doc.sourceType === 'text' ? Keyboard : FileText;
  const preview = doc.extractedText?.replace(/\[\[PAGE:\d+\]\]|[#*|]/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    <article className={`document-card ${view}`}>
      <button className={`document-cover cover-${doc.sourceType || 'text'}`} onClick={() => nav(`/app/documents/${doc.id}`)} aria-label={`Open ${doc.title}`}>
        <span className="cover-type">{doc.type || 'Record'}</span>
        <span className="cover-fold" />
        <span className="cover-symbol"><SourceIcon /></span>
        <span className="cover-lines"><i /><i /><i /><i /></span>
        <strong>{doc.sourceType === 'image' ? 'Image' : doc.sourceType === 'pdf' ? 'PDF' : doc.sourceType === 'manual' ? 'Note' : 'Information'}</strong>
      </button>
      <div className="doc-icon">
        <SourceIcon />
        <span>{doc.type || 'Record'}</span>
      </div>
      <div className="doc-body">
        <div className="doc-top">
          <Badge tone="neutral">{doc.category}</Badge>
          {onDelete && <button className="document-delete-action" aria-label={`Delete ${doc.title}`} onClick={() => onDelete(doc)}><Trash2 /></button>}
        </div>
        <button className="document-open-action" onClick={() => nav(`/app/documents/${doc.id}`)}><h3>{doc.title}</h3></button>
        {view === 'grid' && <p>{preview || (doc.sourceType === 'image' ? 'No readable text detected in this image.' : 'No extracted text available.')}</p>}
        <div className="meta">
          <span>
            <Calendar size={13} />
            {doc.date ? `Created ${doc.date}` : 'Saved'}
          </span>
          <span title={doc.originalFilename || ''}>{doc.originalFilename || doc.type}</span>
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
        <span className="reminder-detail">{reminder.detail}</span>
        <div className="reminder-datetime"><strong>{reminder.displayDate?.date || reminder.when}</strong>{reminder.displayDate?.time && <><i aria-hidden="true" /><strong>{reminder.displayDate.time}</strong></>}</div>
      </div>
      <div className="inline-actions">
        <button className="snooze" onClick={onSnooze}>Snooze</button>
        <button className="dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}
