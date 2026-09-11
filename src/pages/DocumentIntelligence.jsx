import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Calendar, CheckCircle2, Link2, XCircle } from 'lucide-react';
import { Button, EmptyState } from '../components/UI';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { documentService } from '../services/documentService';

const STORAGE_KEY = 'la_multi_document_history_v1';

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function hydrateTitleMap(documents) {
  return new Map(documents.map((document) => [String(document.id), document.title]));
}

function confidenceLabel(value) {
  if (typeof value === 'number') return `${Math.round(value * 100)}%`;
  if (typeof value === 'string' && value.trim()) return `${Math.round(Number(value) * 100)}%`;
  return 'n/a';
}

export default function DocumentIntelligence() {
  const { id } = useParams();
  const { documents, createTask, notify } = useApp();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busyAction, setBusyAction] = useState('');
  const [taskError, setTaskError] = useState('');
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const historyEntry = await documentService.getAnalysisHistory(id);
        if (!historyEntry || cancelled) return;
        setEntry({
          id: historyEntry._id || id,
          createdAt: historyEntry.createdAt,
          selectedDocuments: (historyEntry.selectedDocuments || []).map((item) => String(item)),
          summaryReference: historyEntry.summaryReference,
          report: historyEntry.report,
        });
      } catch (serverError) {
        const fallbackEntries = readHistory();
        const fallback = fallbackEntries.find((item) => String(item.id) === String(id)) || null;
        if (fallback && !cancelled) {
          setEntry(fallback);
        } else if (!cancelled) {
          setError('Unable to load the saved intelligence analysis.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const report = entry?.report || null;
  const documentTitleMap = hydrateTitleMap(documents);

  const selectedDocumentSet = new Set((entry?.selectedDocuments || []).map(String));
  const visibleDocuments = documents.filter((document) =>
    selectedDocumentSet.has(String(document.id)),
  );

  const createSuggestionTask = async (action) => {
    if (!action) return;
    setTaskError('');
    setBusyAction(action.title);
    try {
      await createTask({
        title: action.title || 'Follow up on cross-document action',
        description: action.description || 'Suggested cross-document action.',
        dueDate: action.dueDate || '',
        priority: action.priority || 'medium',
        status: 'Pending',
      });
      notify('Task created');
    } catch (error) {
      const message =
        error?.response?.data?.message || error?.message || 'Unable to create the task.';
      setTaskError(message);
      notify(message);
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <div className="intelligence-page">
        <div className="page-header">
          <div>
            <span className="kicker">
              <Link2 size={15} />
              Document Intelligence
            </span>
            <h1>Document Intelligence</h1>
            <p className="muted">Loading saved analysis…</p>
          </div>
          <Button variant="secondary" onClick={() => nav('/app/documents')}>
            Back to library
          </Button>
        </div>
        <EmptyState
          title="Loading intelligence report"
          text="Checking the saved analysis history."
        />
      </div>
    );
  }

  if (error || !entry || !report) {
    return (
      <div className="intelligence-page">
        <div className="page-header">
          <div>
            <span className="kicker">
              <Link2 size={15} />
              Document Intelligence
            </span>
            <h1>Document Intelligence</h1>
            <p className="muted">No analysis record found for this selection.</p>
          </div>
          <Button variant="secondary" onClick={() => nav('/app/documents')}>
            Back to library
          </Button>
        </div>
        <EmptyState
          title="No saved intelligence report"
          text={error || 'Return to the document library and analyze a document set together.'}
        />
      </div>
    );
  }

  return (
    <div className="intelligence-page">
      <header className="page-header">
        <div>
          <span className="kicker">
            <Link2 size={15} />
            Document Intelligence
          </span>
          <h1>Document Intelligence</h1>
          <p className="muted">
            Analysis saved {new Date(entry.createdAt || Date.now()).toLocaleString()}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" onClick={() => nav('/app/documents')}>
            Back to library
          </Button>
        </div>
      </header>

      <section className="intelligence-summary panel">
        <div className="section-head">
          <div>
            <span className="section-label">Analysis Summary</span>
            <p>{report.summary || 'No summary available.'}</p>
          </div>
          <span className="meta-chip">{entry.selectedDocuments.length} documents</span>
        </div>
      </section>

      <section className="intelligence-grid">
        <aside className="intelligence-aside panel">
          <div className="section-head compact">
            <div>
              <span className="section-label">Selected documents</span>
              <h3>Document set</h3>
            </div>
          </div>
          <div className="document-set">
            {(visibleDocuments.length
              ? visibleDocuments
              : entry.selectedDocuments.map((docId) => ({
                  id: String(docId),
                  title: documentTitleMap.get(String(docId)) || 'Document',
                }))
            ).map((document) => (
              <div className="doc-set-row" key={document.id}>
                <span className="doc-check">
                  <CheckCircle2 size={13} />
                </span>
                <span className="doc-name">{document.title || document.id}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="intelligence-content">
          <section className="panel intelligence-section">
            <div className="section-head">
              <div>
                <span className="section-label">Connected documents</span>
                <h2>Relationship details</h2>
              </div>
            </div>
            {(report.connections || []).length ? (
              <div className="relationship-list">
                {report.connections.map((connection, index) => {
                  const a =
                    documentTitleMap.get(String(connection.documentA)) || connection.documentA;
                  const b =
                    documentTitleMap.get(String(connection.documentB)) || connection.documentB;
                  return (
                    <article
                      className="relationship-card"
                      key={`${connection.documentA}-${connection.documentB}-${index}`}
                    >
                      <div className="relationship-row">
                        <span className="relationship-title">{a}</span>
                        <span className="connection-arrow">
                          <Link2 size={14} />
                        </span>
                        <span className="relationship-title">{b}</span>
                      </div>
                      <div className="relationship-meta">
                        <span>
                          <strong>Relationship:</strong> {connection.relationshipType || 'Related'}
                        </span>
                        <span>
                          <strong>Reason:</strong> {connection.reason}
                        </span>
                        <span>
                          <strong>Confidence:</strong> {confidenceLabel(connection.confidenceScore)}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted">No connected documents detected.</p>
            )}
          </section>

          <section className="panel intelligence-section">
            <div className="section-head">
              <div>
                <span className="section-label">Conflicts</span>
                <h2>Conflict analysis</h2>
              </div>
            </div>
            {(report.conflicts || []).length ? (
              <div className="conflict-list">
                {report.conflicts.map((conflict, index) => (
                  <article
                    className="conflict-card"
                    key={`${conflict.documentA}-${conflict.documentB}-${index}`}
                  >
                    <span className="conflict-icon">
                      <XCircle size={15} />
                    </span>
                    <div>
                      <div className="conflict-text">{conflict.reason}</div>
                      <small>Confidence: {confidenceLabel(conflict.confidenceScore)}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No conflicts detected.</p>
            )}
          </section>

          <section className="panel intelligence-section">
            <div className="section-head">
              <div>
                <span className="section-label">Important information</span>
                <h2>Key signals</h2>
              </div>
            </div>
            {(report.importantInformation || []).length ? (
              <ul className="important-list">
                {report.importantInformation.map((item, index) => (
                  <li key={index}>
                    <CheckCircle2 size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No important information extracted.</p>
            )}
          </section>

          <section className="panel intelligence-section">
            <div className="section-head">
              <div>
                <span className="section-label">Suggested actions</span>
                <h2>Suggested next steps</h2>
              </div>
            </div>
            {(report.suggestedActions || []).length ? (
              <div className="suggested-action-list">
                {report.suggestedActions.map((action, index) => (
                  <article className="suggested-action-card" key={`${action.title}-${index}`}>
                    <div className="suggested-action-top">
                      <div>
                        <strong>{action.title}</strong>
                        <p>{action.description}</p>
                      </div>
                      <div className="action-meta">
                        {action.dueDate && (
                          <span>
                            <Calendar size={14} />
                            {action.dueDate}
                          </span>
                        )}
                        <span className="priority-label">{action.priority || 'medium'}</span>
                      </div>
                    </div>
                    <div className="suggested-action-bottom">
                      <Button
                        variant="secondary"
                        disabled={busyAction === action.title}
                        onClick={() => createSuggestionTask(action)}
                      >
                        {busyAction === action.title ? 'Creating…' : 'Create Task'}
                      </Button>
                    </div>
                    {taskError && (
                      <p className="error-text">
                        <AlertCircle size={14} />
                        {taskError}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No suggested actions returned.</p>
            )}
          </section>
        </main>
      </section>
    </div>
  );
}
