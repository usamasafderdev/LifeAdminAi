import {
  ArrowLeft,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Layers3,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  Badge,
  Button,
  CheckCircle,
  ConfirmDialog,
  EmptyState, Field, Modal,
  PageHeader,
  PriorityBadge,
  Skeleton,
} from '../components/UI';
import { formatDate } from '../utils/dates';
import { documentService } from '../services/documentService';

export default function DocumentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { documents, tasks, completeTask, notify, updateDocument, deleteDocument } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [remoteDocument, setRemoteDocument] = useState(null);
  const [loading, setLoading] = useState(/^[a-f\d]{24}$/i.test(id));
  const [loadError, setLoadError] = useState('');
  const localDocument = documents.find((d) => d.id === id);
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(id)) return;
    let active = true;
    setLoading(true); setLoadError('');
    documentService.get(id)
      .then((document) => { if (active) setRemoteDocument(document); })
      .catch(() => { if (active) setLoadError('Unable to load this document.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const doc = remoteDocument || localDocument;
  if (loading && !doc) return <div className="panel"><Skeleton lines={6} /></div>;
  if (loadError && !doc) return <EmptyState title="Unable to load this document." text="Check your connection or return to Documents." action={<Button onClick={() => nav('/app/documents')}>Back to documents</Button>} />;
  if (!doc) return <EmptyState title="Document not found" text="It may have been deleted." action={<Button onClick={() => nav('/app/documents')}>Back to documents</Button>} />;
  if (doc.isReal) return <SavedDocumentDetail document={doc} onBack={() => nav('/app/documents')} />;
  const related = tasks.filter((t) => t.source === doc.id);
  return (
    <>
      <button className="back" onClick={() => nav('/app/documents')}>
        <ArrowLeft size={15} />
        Documents / {doc.category}
      </button>
      <PageHeader
        title={doc.title}
        description={`${doc.type} · Uploaded ${doc.date}`}
        action={
          <div className="header-actions">
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              <Edit3 size={15} />
              Edit
            </Button>
            <Button onClick={() => nav(`/app/documents/${doc.id}/chat`)}>
              <Bot size={16} />
              Chat with document
            </Button>
          </div>
        }
      />
      <div className="detail-meta">
        <Badge tone="neutral">{doc.category}</Badge>
        <PriorityBadge priority={doc.priority} />
        <Badge tone="success">{doc.status}</Badge>
      </div>
      <div className="detail-layout">
        <div className="detail-content">
          <section className="panel ai-summary">
            <div className="section-label">
              <Bot size={15} />
              AI SUMMARY
            </div>
            <p>{doc.summary}</p>
          </section>
          <section className="panel">
            <h2>Important information</h2>
            <dl className="info-grid">
              <div>
                <dt>Deadline</dt>
                <dd>{doc.deadline || 'Not identified'}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{doc.amount || 'Not applicable'}</dd>
              </div>
              <div>
                <dt>Consequence</dt>
                <dd>{doc.consequence || 'No consequence identified'}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <PriorityBadge priority={doc.priority} />
                </dd>
              </div>
            </dl>
          </section>
          {doc.items && (
            <section className="panel">
              <h2>Required items</h2>
              <ul className="required-list">
                {doc.items.map((x) => (
                  <li key={x}>
                    <CheckCircle />
                    {x}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="panel">
            <div className="section-head">
              <div>
                <h2>Generated tasks</h2>
                <p>{related.length} actions linked to this document</p>
              </div>
            </div>
            {related.length ? (
              related.map((t) => (
                <div
                  className={`generated-task ${t.status === 'Completed' ? 'completed' : ''}`}
                  key={t.id}
                >
                  <CheckCircle
                    checked={t.status === 'Completed'}
                    onClick={() => completeTask(t.id)}
                  />
                  <div>
                    <strong>{t.title}</strong>
                    <span>Due {t.due}</span>
                  </div>
                  <PriorityBadge priority={t.priority} />
                </div>
              ))
            ) : (
              <p className="muted">No actions were generated from this document.</p>
            )}
          </section>
        </div>
        <aside className="source-panel panel">
          <div className="section-head">
            <div>
              <h2>Source document</h2>
              <p>Original uploaded file</p>
            </div>
          </div>
          <div className="paper-preview">
            <div className="paper-head">
              <span>UNIVERSITY OF CENTRAL PUNJAB</span>
            </div>
            <h4>{doc.title}</h4>
            <i />
            <i />
            <i />
            <i className="short" />
            <div className="paper-box" />
            <i />
            <i />
          </div>
          <div className="source-actions">
            <Button variant="secondary" onClick={() => notify('Opening source preview')}>
              <ExternalLink size={15} />
              View source
            </Button>
            <Button variant="secondary" onClick={() => notify('Mock download started')}>
              <Download size={15} />
              Download
            </Button>
          </div>
          <div className="source-links">
            <button onClick={() => setEditing(true)}>
              <Edit3 />
              Rename
            </button>
            <button onClick={() => setConfirm(true)} className="danger-text">
              <Trash2 />
              Delete
            </button>
          </div>
        </aside>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          deleteDocument(doc.id); notify('Document and related items deleted');
          nav('/app/documents');
        }}
        title="Delete document?"
        text="This will also delete tasks and reminders generated from this document."
      />
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit document">
        <form className="modal-form" onSubmit={e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); updateDocument(doc.id, { ...values, deadline: values.deadlineDate ? formatDate(values.deadlineDate) : doc.deadline }); setEditing(false); notify('Document updated'); }}>
          <Field label="Title"><input name="title" defaultValue={doc.title} required /></Field>
          <div className="form-grid"><Field label="Category"><input name="category" defaultValue={doc.category} /></Field><Field label="Priority"><select name="priority" defaultValue={doc.priority}>{['URGENT','HIGH','MEDIUM','LOW'].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Deadline"><input name="deadlineDate" type="date" defaultValue={doc.deadlineDate || ''} /></Field><Field label="Amount"><input name="amount" defaultValue={doc.amount || ''} /></Field></div>
          <Field label="Summary"><textarea name="summary" defaultValue={doc.summary} /></Field>
          <div className="modal-actions"><Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button><Button>Save changes</Button></div>
        </form>
      </Modal>
    </>
  );
}

function SavedDocumentDetail({ document, onBack }) {
  return (
    <div className="saved-document-page">
      <button className="back refined-back" onClick={onBack}><ArrowLeft size={15} />Documents</button>
      <header className="saved-document-header">
        <div className="saved-document-icon"><FileText /></div>
        <div className="saved-document-heading"><h1>{document.title}</h1><p>{document.category} · {document.type} · Saved {new Date(document.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p></div>
        <span className="verified-state"><CheckCircle2 />Saved</span>
      </header>
      <div className="saved-document-layout">
        <div className="saved-document-main">
          <section className="panel information-card">
            <div className="section-head enhanced"><div><span className="section-icon"><FileText /></span><div><h2>Saved information</h2><p>Original content from this record</p></div></div><span className="content-count">{document.extractedText?.length || 0} characters</span></div>
            <div className="document-text">{document.extractedText || 'No additional information was provided.'}</div>
          </section>
          <section className="analysis-empty">
            <span className="section-icon soft"><Layers3 /></span>
            <div><h2>Analysis not available yet</h2><p>This record has been saved, but no deadlines, priorities or actions have been identified.</p></div>
          </section>
          <section className="empty-work-card">
            <div><span className="section-icon soft"><CheckCircle2 /></span><div><h2>Generated tasks</h2><p>No tasks have been generated from this information yet.</p></div></div>
          </section>
        </div>
        <aside className="saved-document-aside">
          <section className="panel record-overview">
            <div className="aside-title"><h2>Record overview</h2><span className="status-dot">Active</span></div>
            <dl>
              <div><span><Layers3 /></span><dt>Source type</dt><dd>{document.type}</dd></div>
              <div><span><FileText /></span><dt>Category</dt><dd>{document.category}</dd></div>
              <div><span><CalendarDays /></span><dt>Created</dt><dd>{new Date(document.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
              <div><span><Clock3 /></span><dt>Last updated</dt><dd>{new Date(document.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
            </dl>
          </section>
          <section className="workspace-tip"><ShieldCheck /><div><strong>Private record</strong><p>Only your account can access this document.</p></div></section>
        </aside>
      </div>
    </div>
  );
}
