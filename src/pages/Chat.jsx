import { MemoryIndicator, MemorySuggestions } from '../components/MemoryControls';
import { Bell, CheckCircle2, FileText, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, ConfirmDialog, PageHeader, Skeleton } from '../components/UI';
import { assistantService } from '../services/assistantService';
import { getErrorMessage } from '../services/api';
import { documentService } from '../services/documentService';

const prompts = [
  'What should I focus on today?',
  'What deadlines are coming up?',
  'What tasks are overdue?',
  'Summarize my current workload.',
  'What documents did I add recently?',
];
const safeError = (error) => {
  const status = error.response?.status;
  if (status === 429) return 'AI usage limits are temporarily reached. Please try again shortly.';
  if (status === 502) return 'The AI response could not be processed. Please try again.';
  if (status === 503) return 'LifeAdmin AI is temporarily unavailable. Please try again shortly.';
  if (status === 504) return 'The AI response took too long. Please try again.';
  if (!error.response) return 'Unable to reach the LifeAdmin server.';
  return getErrorMessage(error, 'LifeAdmin could not answer this question.');
};

function AssistantActions({ actions, onAction }) {
  const groups = [
    { type: 'open_schedule', title: 'Schedule', icon: CheckCircle2, hint: 'Review on Calendar' },
    {
      type: 'open_document',
      title:
        actions.filter((item) => item.type === 'open_document').length === 1
          ? 'Related document'
          : 'Related documents',
      icon: FileText,
      hint: 'Open source document',
    },
    { type: 'open_task', title: 'Tasks', icon: CheckCircle2, hint: 'View task' },
    { type: 'open_reminder', title: 'Reminders', icon: Bell, hint: 'View reminder' },
  ];
  return (
    <div className="assistant-action-groups">
      {groups.map((group) => {
        const items = actions.filter((item) => item.type === group.type);
        if (!items.length) return null;
        const Icon = group.icon;
        return (
          <section className={`assistant-action-group ${group.type}`} key={group.type}>
            <h4>{group.title}</h4>
            <div>
              {items.map((action) => (
                <button
                  type="button"
                  key={`${action.type}-${action.resourceId}`}
                  onClick={() => onAction(action)}
                >
                  <span className="assistant-action-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>
                    <strong>{action.resourceTitle}</strong>
                    <small>{group.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const documentIntent = (text = '') =>
  /(create|write|draft|generate|docx|pdf|markdown|report|document)/i.test(String(text));

export function AskLifeAdmin() {
  const nav = useNavigate();
  const endRef = useRef(null);
  const submittingRef = useRef(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [docStatus, setDocStatus] = useState('');
  const [generatedDoc, setGeneratedDoc] = useState(null);
  useEffect(() => {
    let active = true;
    assistantService
      .history()
      .then((items) => {
        if (active) setMessages(items);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, 'Unable to load your conversation.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, thinking]);
  const send = async (value, retryId = '') => {
    const text = (value || input).trim();
    if (!text || submittingRef.current) return;
    submittingRef.current = true;
    setThinking(true);
    setError('');
    setInput('');
    const pending = { id: `pending-${Date.now()}`, role: 'user', text };
    setMessages((items) =>
      retryId
        ? items.map((item) => (item.id === retryId ? { ...item, failed: false } : item))
        : [...items, pending],
    );
    try {
      const result = await assistantService.send(text);
      if (result.message.memory?.saved?.length)
        window.dispatchEvent(new Event('lifeadmin-memory-changed'));
      setMessages((items) => [
        ...items.filter((item) => item.id !== (retryId || pending.id)),
        result.userMessage,
        result.message,
      ]);
    } catch (requestError) {
      setMessages((items) =>
        items.map((item) =>
          item.id === (retryId || pending.id) ? { ...item, failed: true } : item,
        ),
      );
      setError(safeError(requestError));
    } finally {
      submittingRef.current = false;
      setThinking(false);
    }
  };
  const clear = async () => {
    setClearing(true);
    setError('');
    try {
      await assistantService.clear();
      setMessages([]);
      setConfirmClear(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to clear this conversation.'));
    } finally {
      setClearing(false);
    }
  };
  const openSource = (source) =>
    nav(
      source.type === 'document'
        ? `/app/documents/${source.sourceId}`
        : source.type === 'reminder'
          ? `/app/reminders?reminder=${source.sourceId}`
          : `/app/tasks?task=${source.sourceId}`,
    );
  const runAction = (action) => {
    if (action.type === 'open_schedule')
      nav(
        action.label === 'Open Calendar'
          ? '/app/calendar'
          : `/app/calendar?proposal=${action.resourceId}`,
      );
    else if (action.type === 'open_document') nav(`/app/documents/${action.resourceId}`);
    else if (action.type === 'open_task') nav(`/app/tasks?task=${action.resourceId}`);
    else if (action.type === 'open_reminder') nav(`/app/reminders?reminder=${action.resourceId}`);
  };
  const createDocumentFromPrompt = async (prompt) => {
    if (!prompt) return;
    setDocStatus('Generating content...');
    try {
      const result = await documentService.generateDocument({
        prompt,
        documentType: 'report',
        format: 'docx',
      });
      setDocStatus('Creating file...');
      setGeneratedDoc({
        id: result.documentId,
        downloadUrl: result.downloadUrl,
        fileName: result.fileName,
      });
      setDocStatus('Document ready');
    } catch (requestError) {
      setDocStatus(getErrorMessage(requestError, 'Unable to create the requested document.'));
    }
  };
  return (
    <>
      <PageHeader
        title="Ask LifeAdmin"
        description="Ask questions across your documents, tasks, and reminders."
        action={
          messages.length > 0 && (
            <Button variant="secondary" onClick={() => setConfirmClear(true)}>
              <Trash2 />
              Clear chat
            </Button>
          )
        }
      />
      <MemoryIndicator />
      <section className="panel global-assistant-shell">
        {error && (
          <p className="document-chat-error" role="alert">
            {error}
          </p>
        )}
        <div className="messages global-assistant-messages" aria-live="polite">
          {loading && (
            <div className="assistant-loading">
              <Skeleton lines={4} />
            </div>
          )}
          {!loading && !messages.length && (
            <div className="chat-empty">
              <span className="ai-orbit">
                <Sparkles />
              </span>
              <h2>How can I help with your workspace?</h2>
              <p>Ask about your real tasks, deadlines, reminders, or saved documents.</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              className={`message ${message.role} ${message.failed ? 'failed' : ''}`}
              key={message.id}
            >
              <span className="message-avatar">
                {message.role === 'assistant' ? <Sparkles /> : 'Y'}
              </span>
              <div className="message-content">
                <strong className="message-author">
                  {message.role === 'assistant' ? 'LifeAdmin' : 'You'}
                </strong>
                <div className="document-chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                    {message.text}
                  </ReactMarkdown>
                </div>
                {message.role === 'assistant' && <MemorySuggestions memory={message.memory} />}
                {message.contextUsed && (
                  <div className="assistant-context-indicator">
                    <Sparkles aria-hidden="true" />
                    <span>
                      <strong>Using conversation context</strong>
                      {message.contextLabels?.length > 0 && (
                        <small>{message.contextLabels.slice(0, 2).join(' · ')}</small>
                      )}
                    </span>
                  </div>
                )}
                {message.role === 'user' && documentIntent(message.text) && (
                  <div className="assistant-document-create">
                    <button
                      className="chat-retry"
                      onClick={() => createDocumentFromPrompt(message.text)}
                    >
                      Create Document
                    </button>
                  </div>
                )}
                {docStatus && (
                  <div className="assistant-document-status">
                    <small>{docStatus}</small>
                    {generatedDoc && (
                      <span>
                        <a href={generatedDoc.downloadUrl}>Open document</a>
                        <a href={generatedDoc.downloadUrl} download={generatedDoc.fileName}>
                          Download
                        </a>
                        <button className="chat-retry" onClick={() => nav(`/app/documents`)}>
                          Save to Documents
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {message.failed && (
                  <button className="chat-retry" onClick={() => send(message.text, message.id)}>
                    Retry
                  </button>
                )}
                {message.actions?.length > 0 && (
                  <AssistantActions actions={message.actions} onAction={runAction} />
                )}
                {message.sources?.length > 0 && (
                  <details className="workspace-sources">
                    <summary>Sources ({message.sources.length})</summary>
                    <div>
                      {message.sources.map((source) => (
                        <button
                          key={`${source.type}-${source.sourceId}`}
                          onClick={() => openSource(source)}
                        >
                          <span aria-hidden="true">
                            {source.type === 'document' ? (
                              <FileText />
                            ) : source.type === 'reminder' ? (
                              <Bell />
                            ) : (
                              <CheckCircle2 />
                            )}
                          </span>
                          <span>
                            <strong>{source.label}</strong>
                            <small>
                              {source.type}
                              {source.detail ? ` · ${source.detail}` : ''}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="message assistant">
              <span className="message-avatar">
                <Sparkles />
              </span>
              <div className="message-content">
                <strong className="message-author">LifeAdmin</strong>
                <div className="document-chat-markdown">
                  <p className="thinking">
                    LifeAdmin is checking your workspace <i /> <i /> <i />
                  </p>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {!loading && !messages.length && (
          <div className="suggestions global-assistant-prompts">
            {prompts.map((prompt) => (
              <button disabled={thinking} onClick={() => send(prompt)} key={prompt}>
                {prompt}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer document-chat-composer global-assistant-composer"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <textarea
            value={input}
            maxLength="3000"
            disabled={loading || thinking}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask LifeAdmin anything about your workspace..."
          />
          <Button disabled={loading || thinking || !input.trim()}>
            <Send />
            <span>Send</span>
          </Button>
        </form>
      </section>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clear}
        busy={clearing}
        title="Clear Ask LifeAdmin chat?"
        text="Only this conversation will be removed. Your documents, tasks, reminders, and analyses will remain unchanged."
        confirmLabel="Clear chat"
      />
    </>
  );
}
