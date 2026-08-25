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
import { documentCategories, documentService } from '../services/documentService';
import { getErrorMessage } from '../services/api';

export default function DocumentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { documents, tasks, completeTask, notify, updateDocument, deleteDocument } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [remoteDocument, setRemoteDocument] = useState(null);
  const [loading, setLoading] = useState(/^[a-f\d]{24}$/i.test(id));
  const [loadError, setLoadError] = useState('');
  const realId = /^[a-f\d]{24}$/i.test(id);
  const localDocument = realId ? null : documents.find((d) => d.id === id);
  useEffect(() => {
    if (!/^[a-f\d]{24}$/i.test(id)) return;
    let active = true;
    setLoading(true); setLoadError('');
    documentService.get(id)
      .then((document) => { if (active) setRemoteDocument(document); })
      .catch((error) => { if (active) setLoadError(error.response?.status === 404 ? 'not-found' : 'load-failed'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const doc = realId ? remoteDocument : localDocument;
  if (loading && !doc) return <div className="panel"><Skeleton lines={6} /></div>;
  if (loadError && !doc) return <EmptyState title={loadError === 'not-found' ? 'Document not found' : 'Unable to load this document.'} text={loadError === 'not-found' ? 'It may have been deleted or is not available to your account.' : 'Check your connection or return to Documents.'} action={<Button onClick={() => nav('/app/documents')}>Back to documents</Button>} />;
  if (!doc) return <EmptyState title="Document not found" text="It may have been deleted." action={<Button onClick={() => nav('/app/documents')}>Back to documents</Button>} />;
  if (doc.isReal) return <SavedDocumentDetail document={doc} onBack={() => nav('/app/documents')} onUpdate={async (values) => { const updated = await updateDocument(doc.id, values); setRemoteDocument(updated); notify('Document updated'); }} onDelete={async () => { await deleteDocument(doc.id); notify('Document deleted'); nav('/app/documents'); }} />;
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

function SavedDocumentDetail({ document, onBack, onUpdate, onDelete }) {
  const hasUploadedSource = ['pdf', 'image'].includes(document.sourceType);
  const [view, setView] = useState(hasUploadedSource ? 'original' : 'text');
  const [fileUrl, setFileUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [editingReal, setEditingReal] = useState(false);
  const [deletingReal, setDeletingReal] = useState(false);
  const [savingReal, setSavingReal] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  useEffect(() => {
    if (!hasUploadedSource) return undefined;
    let active = true;
    documentService.getFile(document.id)
      .then((url) => { if (active) setFileUrl(url); else URL.revokeObjectURL(url); })
      .catch(() => { if (active) setFileError('The original PDF preview could not be loaded.'); });
    return () => { active = false; };
  }, [document.id, hasUploadedSource]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  return (
    <div className="saved-document-page">
      <button className="back refined-back" onClick={onBack}><ArrowLeft size={15} />Documents</button>
      <header className="saved-document-header">
        <div className="saved-document-icon"><FileText /></div>
        <div className="saved-document-heading"><h1>{document.title}</h1><p>{document.category} · {document.type} · Saved {new Date(document.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p></div>
        <div className="saved-document-actions"><span className="verified-state"><CheckCircle2 />{document.sourceType === 'image' ? document.extractedText ? 'OCR complete' : 'No readable text detected' : document.sourceType === 'pdf' && document.extractedText ? 'Text extracted' : 'Saved'}</span><Button variant="secondary" onClick={() => { setMutationError(''); setEditingReal(true); }}><Edit3 size={14} />Edit</Button><Button variant="secondary" onClick={() => { setMutationError(''); setDeletingReal(true); }}><Trash2 size={14} />Delete</Button></div>
      </header>
      <div className="saved-document-layout">
        <div className="saved-document-main">
          <section className="panel information-card">
            <div className="section-head enhanced"><div><span className="section-icon"><FileText /></span><div><h2>{hasUploadedSource ? 'Document preview' : 'Saved information'}</h2><p>{hasUploadedSource ? `View the original ${document.sourceType === 'image' ? 'image' : 'design'} or switch to accessible extracted text` : 'Original content from this record'}</p></div></div>{hasUploadedSource ? <div className="pdf-view-switch" role="tablist"><button className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}>Original view</button><button className={view === 'text' ? 'active' : ''} onClick={() => setView('text')}>Readable text</button></div> : <span className="content-count">{document.extractedText?.length || 0} characters</span>}</div>
            {hasUploadedSource && view === 'original' ? <div className={document.sourceType === 'image' ? 'image-original-view' : 'pdf-original-view'}>{fileUrl ? document.sourceType === 'image' ? <img src={fileUrl} alt={`Original upload: ${document.title}`} /> : <iframe src={`${fileUrl}#toolbar=1&navpanes=0&view=FitH`} title={`Original PDF: ${document.title}`} /> : <div className="pdf-preview-state">{fileError || `Loading the original ${document.sourceType}…`}</div>}</div> : <div className={`document-text ${!document.extractedText ? 'no-text' : ''}`}>{hasUploadedSource && document.extractedText ? <StructuredPdfText text={document.extractedText} /> : document.extractedText || (document.sourceType === 'pdf' ? 'No selectable text was found in this PDF. It may contain scanned pages.' : document.sourceType === 'image' ? 'No readable text was detected in this image.' : 'No additional information was provided.')}</div>}
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
              {document.originalFilename && <div><span><FileText /></span><dt>Original file</dt><dd title={document.originalFilename}>{document.originalFilename}</dd></div>}
              <div><span><CalendarDays /></span><dt>Created</dt><dd>{new Date(document.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</dd></div>
              <div><span><Clock3 /></span><dt>Last updated</dt><dd>{new Date(document.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
            </dl>
          </section>
          <section className="workspace-tip"><ShieldCheck /><div><strong>Private record</strong><p>Only your account can access this document.</p></div></section>
        </aside>
      </div>
      <Modal open={editingReal} onClose={() => { if (!savingReal) setEditingReal(false); }} title="Edit document" size="large">
        <form className="modal-form" onSubmit={async (event) => { event.preventDefault(); if (savingReal) return; const values = Object.fromEntries(new FormData(event.currentTarget)); if (!values.title?.trim()) return setMutationError('Title is required.'); setSavingReal(true); setMutationError(''); try { await onUpdate({ title: values.title.trim(), category: values.category, extractedText: values.extractedText }); setEditingReal(false); } catch (error) { setMutationError(getErrorMessage(error, 'Unable to update document.')); } finally { setSavingReal(false); } }}>
          {mutationError && <div className="form-error" role="alert">{mutationError}</div>}
          <div className="form-grid"><Field label="Title"><input name="title" defaultValue={document.title} maxLength={200} required /></Field><Field label="Category"><select name="category" defaultValue={document.categoryValue}>{documentCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>
          <Field label={document.sourceType === 'image' ? 'Correct OCR text' : document.sourceType === 'pdf' ? 'Correct extracted text' : 'Saved information'} hint="Changes update the readable copy; the original uploaded file remains unchanged."><textarea name="extractedText" rows="14" maxLength={200000} defaultValue={document.extractedText || ''} /></Field>
          <div className="modal-actions"><Button type="button" variant="secondary" disabled={savingReal} onClick={() => setEditingReal(false)}>Cancel</Button><Button disabled={savingReal}>{savingReal && <span className="button-spinner" />}{savingReal ? 'Saving…' : 'Save changes'}</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={deletingReal} onClose={() => { if (!deletingBusy) { setDeletingReal(false); setMutationError(''); } }} onConfirm={async () => { setDeletingBusy(true); setMutationError(''); try { await onDelete(); } catch (error) { setMutationError(getErrorMessage(error, 'Unable to delete document.')); throw error; } finally { setDeletingBusy(false); } }} title="Delete document?" text={mutationError || `This permanently removes “${document.title}”${hasUploadedSource ? ' and its original uploaded file' : ''}.`} confirmLabel="Delete" busy={deletingBusy} />
    </div>
  );
}

function StructuredPdfText({ text }) {
  const pageParts = text.split(/\[\[PAGE:\d+\]\]/).filter((part) => part.trim());
  const pages = pageParts.length ? pageParts : [text];
  const [pageIndex, setPageIndex] = useState(0);
  const lines = pages[Math.min(pageIndex, pages.length - 1)].split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (line.startsWith('|') && lines[index + 1]?.trim().startsWith('|')) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) tableLines.push(lines[index++].trim());
      const rows = tableLines.map((row) => row.slice(1, -1).split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|').replace(/<br>/g, '\n')));
      if (rows.length >= 2) blocks.push(<div className="extracted-table-wrap" key={`table-${index}`}><table className="extracted-table"><thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr></thead><tbody>{rows.slice(2).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (line.startsWith('# ')) blocks.push(<h2 className="extracted-title" key={index}>{line.slice(2)}</h2>);
    else if (line.startsWith('## ')) blocks.push(<h3 className="extracted-section" key={index}>{line.slice(3)}</h3>);
    else if (/^[•●▪]\s*|^-\s+/.test(line)) {
      const items = [];
      while (index < lines.length) {
        const current = lines[index].trim();
        if (!/^[•●▪]\s*|^-\s+/.test(current)) break;
        let item = current.replace(/^[•●▪]\s*|^-\s+/, '');
        index += 1;
        while (index < lines.length) {
          const continuation = lines[index].trim();
          if (!continuation || /^[•●▪]\s*|^-\s+/.test(continuation) || continuation.startsWith('#') || continuation.startsWith('|')) break;
          item += ` ${continuation}`;
          index += 1;
        }
        items.push(item);
        while (index < lines.length && !lines[index].trim()) index += 1;
      }
      blocks.push(<ul className="extracted-list" key={`list-${index}`}>{items.map((item, itemIndex) => <li className={/\b(important|warning|must|prohibited|carefully|not accepted|no marks)\b/i.test(item) ? 'emphasis' : ''} key={itemIndex}>{item}</li>)}</ul>);
      continue;
    }
    else {
      const field = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
      const isHeading = index < 3 || (line.length < 100 && /(:$|instructions?|guidelines?|summary|conclusion)/i.test(line));
      const isWarning = /\b(please read|important|warning|prohibited|not accepted|no marks|must)\b/i.test(line);
      blocks.push(field ? <div className="extracted-field" key={index}><strong>{field[1]}</strong><span>{field[2]}</span></div> : isHeading ? <h3 className={`extracted-prose-heading ${isWarning ? 'warning' : ''}`} key={index}>{line}</h3> : <p className={isWarning ? 'extracted-warning' : ''} key={index}>{line}</p>);
    }
    index += 1;
  }
  return <div className="structured-pdf-reader">{pages.length > 1 && <div className="extracted-page-nav"><span>Readable page <strong>{pageIndex + 1}</strong> of {pages.length}</span><div><button disabled={pageIndex === 0} onClick={() => setPageIndex((page) => page - 1)}>Previous</button><button disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex((page) => page + 1)}>Next</button></div></div>}<article className="structured-pdf-text">{blocks}</article>{pages.length > 1 && <div className="extracted-page-footer"><button disabled={pageIndex === 0} onClick={() => setPageIndex((page) => page - 1)}>← Previous page</button><span>{pageIndex + 1} / {pages.length}</span><button disabled={pageIndex === pages.length - 1} onClick={() => setPageIndex((page) => page + 1)}>Next page →</button></div>}</div>;
}
