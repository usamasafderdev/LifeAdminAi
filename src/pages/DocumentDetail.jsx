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
import { taskService } from '../services/taskService';
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
  if (doc.isReal) return <SavedDocumentDetail document={doc} onBack={() => nav('/app/documents')} onUpdate={async (values) => { const updated = await updateDocument(doc.id, values); setRemoteDocument(updated); notify('Document updated'); }} onDelete={async () => { const result = await deleteDocument(doc.id); notify(result.deletedTasks ? `Document and ${result.deletedTasks} linked task${result.deletedTasks === 1 ? '' : 's'} deleted` : 'Document deleted'); nav('/app/documents'); }} />;
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
        text={related.length ? `Deleting “${doc.title}” will also permanently delete ${related.length} linked task${related.length === 1 ? '' : 's'}.` : `Delete “${doc.title}” permanently?`}
        confirmLabel={related.length ? 'Delete document & tasks' : 'Delete document'}
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
  const { tasks, addGeneratedTasks, notify } = useApp();
  const nav = useNavigate();
  const hasUploadedSource = ['pdf', 'image'].includes(document.sourceType);
  const [fileUrl, setFileUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [editingReal, setEditingReal] = useState(false);
  const [deletingReal, setDeletingReal] = useState(false);
  const [savingReal, setSavingReal] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [analysis, setAnalysis] = useState(document.aiAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisRetrySeconds, setAnalysisRetrySeconds] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [taskGenerationError, setTaskGenerationError] = useState('');
  const [selectedTaskIndexes, setSelectedTaskIndexes] = useState([]);
  const suggestedTasks = analysis?.confirmedAnalysis?.extractedActions || [];
  const aiSuggestedTasks = analysis?.extractedActions || [];
  const relatedTasks = tasks.filter((task) => String(task.documentId) === String(document.id));
  const generatedTitles = new Set(relatedTasks.map((task) => task.title.trim().toLocaleLowerCase()));
  const remainingSuggestedTasks = suggestedTasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !generatedTitles.has(task.title.trim().toLocaleLowerCase()));
  const remainingTaskIndexes = remainingSuggestedTasks.map(({ index }) => index);
  const generatedTaskKey = relatedTasks.map((task) => `${task.id}:${task.title}`).join('|');
  useEffect(() => { setAnalysis(document.aiAnalysis); }, [document.aiAnalysis]);
  useEffect(() => {
    if (!analysisRetrySeconds) return undefined;
    const timer = window.setTimeout(() => setAnalysisRetrySeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [analysisRetrySeconds]);
  useEffect(() => {
    setSelectedTaskIndexes(analysis?.reviewStatus === 'confirmed' ? remainingTaskIndexes : []);
  }, [analysis?.reviewStatus, analysis?.reviewedAt, generatedTaskKey]);
  useEffect(() => {
    let active = true;
    documentService.getAnalysis(document.id)
      .then((result) => { if (active) setAnalysis(result.aiAnalysis); })
      .catch(() => {});
    return () => { active = false; };
  }, [document.id]);
  const runAnalysis = async () => {
    if (analyzing || analysisRetrySeconds > 0 || !document.extractedText?.trim()) return;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const result = await documentService.analyze(document.id, { regenerate: analysis?.status === 'completed' });
      setAnalysis(result);
      setSelectedTaskIndexes([]);
      setAnalysisRetrySeconds(0);
      setReviewError('');
    } catch (error) {
      setAnalysisError(getErrorMessage(error, 'Document analysis could not be completed.'));
      setAnalysisRetrySeconds(error.response?.status === 503 ? 45 : 10);
    } finally {
      setAnalyzing(false);
    }
  };
  const confirmAnalysis = async (confirmedAnalysis) => {
    setReviewBusy(true); setReviewError('');
    try {
      const result = await documentService.confirmAnalysis(document.id, confirmedAnalysis);
      setAnalysis((current) => ({ ...current, reviewStatus: result.reviewStatus, reviewedAt: result.reviewedAt, confirmedAnalysis: result.confirmedAnalysis }));
    } catch (error) {
      setReviewError(getErrorMessage(error, 'Unable to confirm this analysis.'));
      throw error;
    } finally { setReviewBusy(false); }
  };
  const rejectAnalysis = async () => {
    setReviewBusy(true); setReviewError('');
    try {
      const result = await documentService.rejectAnalysis(document.id);
      setAnalysis((current) => ({ ...current, reviewStatus: result.reviewStatus, reviewedAt: result.reviewedAt, confirmedAnalysis: undefined }));
    } catch (error) {
      setReviewError(getErrorMessage(error, 'Unable to reject this analysis.'));
      throw error;
    } finally { setReviewBusy(false); }
  };
  const createTasksFromAnalysis = async () => {
    if (generatingTasks) return;
    setGeneratingTasks(true);
    setTaskGenerationError('');
    try {
      const result = await taskService.createFromDocument(document.id, selectedTaskIndexes);
      addGeneratedTasks(result.tasks);
      notify(result.created ? `${result.created} task${result.created === 1 ? '' : 's'} created${result.skipped ? `, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}` : result.skipped ? 'Selected tasks already exist' : 'No tasks selected');
    } catch (error) {
      setTaskGenerationError(getErrorMessage(error, 'Tasks could not be created from this analysis.'));
    } finally {
      setGeneratingTasks(false);
    }
  };
  const scrollToReview = () => window.document.getElementById('document-ai-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const analysisIsProcessing = analyzing || analysis?.status === 'processing';
  const reviewStatus = analysis?.reviewStatus;
  let taskWorkspaceMessage = 'Analyze document to identify actionable tasks.';
  if (analysisIsProcessing) taskWorkspaceMessage = 'Analyzing document...';
  else if (analysis?.status === 'completed' && reviewStatus === 'pending_review') {
    taskWorkspaceMessage = aiSuggestedTasks.length
      ? `${aiSuggestedTasks.length} suggested action${aiSuggestedTasks.length === 1 ? '' : 's'} found. Review and confirm the AI suggestions before creating tasks.`
      : 'No actions were suggested. Review the analysis and add any missing action before confirming.';
  } else if (reviewStatus === 'confirmed' && suggestedTasks.length > 0) {
    taskWorkspaceMessage = remainingSuggestedTasks.length
      ? `${suggestedTasks.length} confirmed actionable task${suggestedTasks.length === 1 ? '' : 's'}. ${remainingSuggestedTasks.length} still available to create.`
      : `${relatedTasks.length} task${relatedTasks.length === 1 ? '' : 's'} created from this document.`;
  } else if (reviewStatus === 'confirmed') taskWorkspaceMessage = 'No actionable tasks were confirmed.';
  else if (reviewStatus === 'rejected') taskWorkspaceMessage = 'AI suggestions were rejected.';
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
        <div className="saved-document-actions"><span className="verified-state"><CheckCircle2 />{document.sourceType === 'image' ? document.extractedText ? 'OCR complete' : 'No readable text detected' : document.sourceType === 'pdf' && document.extractedText ? 'Text extracted' : 'Saved'}</span><Button disabled={analyzing || analysisRetrySeconds > 0 || !document.extractedText?.trim()} onClick={runAnalysis}><Bot size={14} />{analyzing ? 'Analyzing...' : analysisRetrySeconds > 0 ? `Retry in ${analysisRetrySeconds}s` : analysis?.status === 'completed' ? 'Analyze again' : 'Analyze with AI'}</Button><Button variant="secondary" onClick={() => { setMutationError(''); setEditingReal(true); }}><Edit3 size={14} />Edit</Button><Button variant="secondary" onClick={() => { setMutationError(''); setDeletingReal(true); }}><Trash2 size={14} />Delete</Button></div>
      </header>
      <div className="saved-document-layout">
        <div className="saved-document-main">
          <section className="panel information-card">
            <div className="section-head enhanced"><div><span className="section-icon"><FileText /></span><div><h2>{hasUploadedSource ? 'Document preview' : 'Saved information'}</h2><p>{hasUploadedSource ? `View the original uploaded ${document.sourceType === 'image' ? 'image' : 'document'}` : 'Original content from this record'}</p></div></div>{!hasUploadedSource && <span className="content-count">{document.extractedText?.length || 0} characters</span>}</div>
            {hasUploadedSource ? <div className={document.sourceType === 'image' ? 'image-original-view' : 'pdf-original-view'}>{fileUrl ? document.sourceType === 'image' ? <img src={fileUrl} alt={`Original upload: ${document.title}`} /> : <iframe src={`${fileUrl}#toolbar=1&navpanes=0&view=FitH`} title={`Original PDF: ${document.title}`} /> : <div className="pdf-preview-state">{fileError || `Loading the original ${document.sourceType}…`}</div>}</div> : <div className={`document-text ${!document.extractedText ? 'no-text' : ''}`}>{document.extractedText || 'No additional information was provided.'}</div>}
          </section>
          {analysis?.status === 'completed' ? <AiReviewWorkspace analysis={analysis} busy={reviewBusy} serverError={reviewError} onConfirm={confirmAnalysis} onReject={rejectAnalysis} /> : <section className={`analysis-empty ${analysisError ? 'analysis-failed' : ''}`}>
            <span className="section-icon soft"><Bot /></span>
            <div><h2>{analyzing ? 'Analyzing your document' : analysisError ? 'Analysis could not be completed' : 'AI analysis not started'}</h2><p>{analyzing ? 'LifeAdmin is identifying important dates, information, actions, and risks.' : analysisError || 'Analyze this document to identify useful information and suggested actions.'}</p>{analysisError && <Button variant="secondary" disabled={analyzing || analysisRetrySeconds > 0} onClick={runAnalysis}>{analysisRetrySeconds > 0 ? `Retry available in ${analysisRetrySeconds}s` : 'Retry analysis'}</Button>}</div>
          </section>}
          <section className="empty-work-card generated-task-workspace">
            <div><span className="section-icon soft"><CheckCircle2 /></span><div><h2>Generated tasks</h2><p>{taskWorkspaceMessage}</p></div></div>
            {taskGenerationError && <p className="form-error" role="alert">{taskGenerationError}</p>}
            {reviewStatus === 'confirmed' && remainingSuggestedTasks.length > 0 && <div className="suggested-task-preview"><div className="suggested-task-title"><div><strong>Confirmed tasks ready to create</strong><span>Select the remaining approved actions you want to create.</span></div><button onClick={() => setSelectedTaskIndexes(selectedTaskIndexes.length === remainingSuggestedTasks.length ? [] : remainingTaskIndexes)}>{selectedTaskIndexes.length === remainingSuggestedTasks.length ? 'Clear all' : 'Select all'}</button></div>{remainingSuggestedTasks.map(({ task, index }) => <label className="suggested-task-option" key={`${task.title}-${index}`}><input type="checkbox" checked={selectedTaskIndexes.includes(index)} onChange={() => setSelectedTaskIndexes((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} /><span><strong>{task.title}</strong>{task.description && <small>{task.description}</small>}</span><PriorityBadge priority={task.priority} />{task.dueDate && <time>{task.dueDate}</time>}</label>)}</div>}
            {relatedTasks.length > 0 && <div className="document-generated-list">{relatedTasks.map((task) => <div key={task.id}><CheckCircle2 /><span><strong>{task.title}</strong><small>{task.status} · {task.priority} priority</small></span></div>)}</div>}
            <div className="generated-task-actions">
              {!analysisIsProcessing && analysis?.status !== 'completed' && <Button disabled={analyzing || analysisRetrySeconds > 0 || !document.extractedText?.trim()} onClick={runAnalysis}><Bot size={15} />{analysisRetrySeconds > 0 ? `Retry in ${analysisRetrySeconds}s` : 'Analyze with AI'}</Button>}
              {analysis?.status === 'completed' && reviewStatus === 'pending_review' && <Button onClick={scrollToReview}><CheckCircle2 size={15} />Review Actions</Button>}
              {reviewStatus === 'confirmed' && remainingSuggestedTasks.length > 0 && <Button disabled={generatingTasks || !selectedTaskIndexes.length} onClick={createTasksFromAnalysis}><CheckCircle2 size={15} />{generatingTasks ? 'Creating tasks…' : `Create Selected Tasks (${selectedTaskIndexes.length})`}</Button>}
              {relatedTasks.length > 0 && <Button variant="secondary" onClick={() => nav('/app/tasks')}>View Tasks</Button>}
              {analysis?.status === 'completed' && ((reviewStatus === 'confirmed' && suggestedTasks.length === 0) || reviewStatus === 'rejected') && <Button variant="secondary" onClick={() => nav('/app/tasks')}>Add Task Manually</Button>}
              {analysis?.status === 'completed' && reviewStatus !== 'pending_review' && <Button variant="secondary" disabled={analyzing || analysisRetrySeconds > 0} onClick={runAnalysis}><Bot size={15} />{analysisRetrySeconds > 0 ? `Retry in ${analysisRetrySeconds}s` : 'Analyze Again'}</Button>}
            </div>
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
      <ConfirmDialog open={deletingReal} onClose={() => { if (!deletingBusy) { setDeletingReal(false); setMutationError(''); } }} onConfirm={async () => { setDeletingBusy(true); setMutationError(''); try { await onDelete(); } catch (error) { setMutationError(getErrorMessage(error, 'Unable to delete document.')); throw error; } finally { setDeletingBusy(false); } }} title="Delete document?" text={mutationError || (relatedTasks.length ? `Deleting “${document.title}” will also permanently delete ${relatedTasks.length} linked task${relatedTasks.length === 1 ? '' : 's'}${hasUploadedSource ? ' and its uploaded file' : ''}.` : `Delete “${document.title}” permanently${hasUploadedSource ? ' along with its uploaded file' : ''}?`)} confirmLabel={relatedTasks.length ? 'Delete document & tasks' : 'Delete document'} busy={deletingBusy} />
    </div>
  );
}

function createReviewDraft(analysis) {
  const source = analysis.reviewStatus === 'confirmed' && analysis.confirmedAnalysis ? analysis.confirmedAnalysis : analysis;
  return {
    actionRequired: source.actionRequired === true || (source.extractedActions || []).length > 0,
    summary: source.summary || '', category: source.category || '',
    importantDates: (source.importantDates || []).map((item) => ({ ...item })),
    extractedActions: (source.extractedActions || []).map((item) => ({ ...item })),
    keyInformation: [...(source.keyInformation || [])], risksOrConsequences: [...(source.risksOrConsequences || [])],
  };
}

function AiReviewWorkspace({ analysis, busy, serverError, onConfirm, onReject }) {
  const [draft, setDraft] = useState(() => createReviewDraft(analysis));
  const [localError, setLocalError] = useState('');
  useEffect(() => { setDraft(createReviewDraft(analysis)); setLocalError(''); }, [analysis.reviewStatus, analysis.confirmedAnalysis]);
  const confirmed = analysis.reviewStatus === 'confirmed';
  const rejected = analysis.reviewStatus === 'rejected';
  const editable = !confirmed && !rejected;
  const updateList = (field, index, value) => setDraft((current) => ({ ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? value : item) }));
  const removeList = (field, index) => setDraft((current) => ({ ...current, [field]: current[field].filter((_, itemIndex) => itemIndex !== index) }));
  const submit = async () => {
    const invalidDate = draft.importantDates.some((item) => !item.date.trim() || !item.description.trim());
    const invalidAction = draft.extractedActions.some((item) => !item.title.trim() || !['low', 'medium', 'high'].includes(item.priority));
    const invalidText = [...draft.keyInformation, ...draft.risksOrConsequences].some((item) => !item.trim());
    if (invalidDate || invalidAction || invalidText) return setLocalError('Complete or remove empty review items before confirming.');
    setLocalError('');
    await onConfirm({
      actionRequired: draft.extractedActions.length > 0,
      summary: draft.summary.trim(), category: draft.category,
      importantDates: draft.importantDates.map((item) => ({ date: item.date.trim(), description: item.description.trim() })),
      extractedActions: draft.extractedActions.map((item) => ({ title: item.title.trim(), description: item.description.trim(), priority: item.priority, ...(item.dueDate ? { dueDate: item.dueDate.trim() } : {}) })),
      keyInformation: draft.keyInformation.map((item) => item.trim()), risksOrConsequences: draft.risksOrConsequences.map((item) => item.trim()),
    }).catch(() => {});
  };
  const statusLabel = confirmed ? 'Analysis confirmed' : rejected ? 'Analysis rejected' : 'Review AI suggestions';
  return <section className="ai-review-workspace" id="document-ai-review">
    <header className={`ai-review-header status-${analysis.reviewStatus || 'pending_review'}`}><span className="ai-hero-icon"><Bot /></span><div><small>Human review required</small><h2>{statusLabel}</h2><p>{confirmed ? 'These reviewed details are ready for future LifeAdmin features.' : rejected ? 'The AI suggestion was rejected. Analyze again to create a new review.' : 'AI can make mistakes. Check and edit every suggestion before confirming.'}</p></div><span className="review-status-pill"><i />{(analysis.reviewStatus || 'pending_review').replace('_', ' ')}</span></header>
    {(localError || serverError) && <div className="form-error" role="alert">{localError || serverError}</div>}
    <div className="ai-review-form">
      <ReviewSection icon={<Bot />} title="AI generated summary" hint="Edit the summary so it matches the source document."><textarea value={draft.summary} disabled={!editable || busy} maxLength={5000} rows="4" onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} /></ReviewSection>
      <ReviewSection icon={<Layers3 />} title="Category" hint="Choose the closest document category."><select value={draft.category} disabled={!editable || busy} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}><option value="">No category</option>{documentCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></ReviewSection>
      <ReviewSection icon={<CalendarDays />} title="Important dates" hint="Remove dates that are not explicitly supported by the document." action={editable && <button onClick={() => setDraft((current) => ({ ...current, importantDates: [...current.importantDates, { date: '', description: '' }] }))}>+ Add date</button>}><div className="review-edit-list">{draft.importantDates.map((item, index) => <div className="review-edit-row date" key={index}><input aria-label="Date" placeholder="Date" value={item.date} disabled={!editable || busy} onChange={(event) => updateList('importantDates', index, { ...item, date: event.target.value })} /><input aria-label="Date description" placeholder="What happens on this date?" value={item.description} disabled={!editable || busy} onChange={(event) => updateList('importantDates', index, { ...item, description: event.target.value })} />{editable && <button aria-label="Remove date" onClick={() => removeList('importantDates', index)}>×</button>}</div>)}{!draft.importantDates.length && <p className="review-none">No important dates identified.</p>}</div></ReviewSection>
      <ReviewSection icon={<CheckCircle2 />} title="Suggested actions" hint="Confirm that every action is actually required. Add a due date only when the document states one." action={editable && <button onClick={() => setDraft((current) => ({ ...current, actionRequired: true, extractedActions: [...current.extractedActions, { title: '', description: '', priority: 'medium', dueDate: '' }] }))}>+ Add action</button>}><div className="review-edit-list">{!draft.extractedActions.length && <div className="no-action-detected"><CheckCircle2 /><div><strong>No actionable tasks detected</strong><p>This document appears informational. Add an action only if it contains a real obligation you need to complete.</p></div></div>}{draft.extractedActions.map((item, index) => <div className="review-action-card" key={index}><div><input aria-label="Action title" placeholder="Action title" value={item.title} disabled={!editable || busy} onChange={(event) => updateList('extractedActions', index, { ...item, title: event.target.value })} /><select aria-label="Action priority" value={item.priority} disabled={!editable || busy} onChange={(event) => updateList('extractedActions', index, { ...item, priority: event.target.value })}>{['low', 'medium', 'high'].map((priority) => <option key={priority}>{priority}</option>)}</select><input aria-label="Action due date" type="date" value={item.dueDate || ''} disabled={!editable || busy} onChange={(event) => updateList('extractedActions', index, { ...item, dueDate: event.target.value })} />{editable && <button aria-label="Remove action" onClick={() => removeList('extractedActions', index)}>×</button>}</div><textarea aria-label="Action description" placeholder="Action details" value={item.description} disabled={!editable || busy} rows="2" onChange={(event) => updateList('extractedActions', index, { ...item, description: event.target.value })} /></div>)}</div></ReviewSection>
      {['keyInformation', 'risksOrConsequences'].map((field) => <ReviewSection key={field} icon={field === 'keyInformation' ? <FileText /> : <ShieldCheck />} title={field === 'keyInformation' ? 'Key information' : 'Risks & consequences'} hint={field === 'keyInformation' ? 'Keep only important facts found in the document.' : 'Review possible outcomes carefully.'} action={editable && <button onClick={() => setDraft((current) => ({ ...current, [field]: [...current[field], ''] }))}>+ Add item</button>}><div className="review-edit-list">{draft[field].map((item, index) => <div className="review-edit-row" key={index}><input value={item} aria-label={`${field} item`} disabled={!editable || busy} onChange={(event) => updateList(field, index, event.target.value)} />{editable && <button aria-label="Remove item" onClick={() => removeList(field, index)}>×</button>}</div>)}{!draft[field].length && <p className="review-none">No items identified.</p>}</div></ReviewSection>)}
    </div>
    {editable && <footer className="ai-review-actions"><div><ShieldCheck /><span><strong>Your confirmation matters</strong><small>Future automation will only use confirmed information.</small></span></div><Button variant="secondary" disabled={busy} onClick={() => onReject().catch(() => {})}>Reject analysis</Button><Button disabled={busy} onClick={submit}>{busy ? 'Saving review…' : 'Confirm analysis'}</Button></footer>}
  </section>;
}

function ReviewSection({ icon, title, hint, action, children }) {
  return <section className="review-section"><header><span>{icon}</span><div><h3>{title}</h3><p>{hint}</p></div>{action}</header><div className="review-section-body">{children}</div></section>;
}
