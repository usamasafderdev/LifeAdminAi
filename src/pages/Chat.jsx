import { MemoryIndicator, MemorySuggestions } from '../components/MemoryControls';
import { Bell, CheckCircle2, FileText, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button, ConfirmDialog, PageHeader, Skeleton } from '../components/UI';
import { assistantService } from '../services/assistantService';
import { chatError as safeError } from '../services/chatError';
import { getErrorMessage } from '../services/api';
import { documentService } from '../services/documentService';
import { useApp } from '../context/AppContext';

const prompts = [
  'What should I focus on today?',
  'What deadlines are coming up?',
  'What tasks are overdue?',
  'Summarize my current workload.',
  'What documents did I add recently?',
];
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
  const { documents, documentsLoading, documentsError, reloadDocuments } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('conversation') || '';
  const [conversations, setConversations] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [olderLoading, setOlderLoading] = useState(false);
  const preserveScroll = useRef(false);
  const activeConversation = useRef(conversationId);
  activeConversation.current = conversationId;
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
  const [selectingDocument, setSelectingDocument] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const selectedDocumentId =
    conversations.find((chat) => chat._id === conversationId)?.documentId || '';
  const selectedDocument = documents.find((doc) => doc.id === selectedDocumentId);
  const selectedDocumentName =
    selectedDocument?.title || selectedDocument?.originalFilename || 'Selected document';
  const recentDocuments = [...documents]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  if (selectedDocument && !recentDocuments.some((doc) => doc.id === selectedDocumentId))
    recentDocuments.unshift(selectedDocument);
  const chooseDocument = async (documentId) => {
    if (submittingRef.current || selectingDocument) return;
    setSelectingDocument(true);
    setError('');
    try {
      let id = conversationId;
      if (!id) id = (await assistantService.create())._id;
      const updated = await assistantService.selectDocument(id, documentId || null);
      setConversations((items) => [updated, ...items.filter((chat) => chat._id !== id)]);
      if (id !== conversationId) setParams({ conversation: id });
      setShowDocumentPicker(false);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setSelectingDocument(false);
    }
  };
  const startDocumentChat = () => setShowDocumentPicker(true);
  const startGeneralChat = () => {
    if (!conversationId) return newChat();
    if (selectedDocumentId) return chooseDocument('');
    setShowDocumentPicker(false);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setHasMore(false);
    setError('');
    (async () => {
      try {
        const items = await assistantService.conversations();
        if (!active) return;
        setConversations(items);
        if (!conversationId) {
          if (items[0]) setParams({ conversation: items[0]._id }, { replace: true });
          return;
        }
        const history = await assistantService.history(conversationId);
        if (active) {
          setMessages(history.messages);
          setHasMore(history.hasMore);
        }
      } catch (err) {
        if (active) setError(safeError(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId, historyRetry]);
  useEffect(() => {
    const clearChat = () => {
      setMessages([]);
      setConversations([]);
      setHasMore(false);
      setParams({}, { replace: true });
    };
    window.addEventListener('lifeadmin-chat-cleared', clearChat);
    return () => window.removeEventListener('lifeadmin-chat-cleared', clearChat);
  }, [setParams]);
  useEffect(() => {
    if (preserveScroll.current) {
      preserveScroll.current = false;
      return;
    }
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, thinking]);
  const newChat = async () => {
    if (submittingRef.current || loading) return;
    setLoading(true);
    try {
      const chat = await assistantService.create();
      setParams({ conversation: chat._id });
    } catch (err) {
      setError(safeError(err));
      setLoading(false);
    }
  };
  const loadOlder = async () => {
    setOlderLoading(true);
    const container = endRef.current?.parentElement;
    const height = container?.scrollHeight || 0;
    try {
      const result = await assistantService.history(conversationId, messages[0]?.id);
      if (activeConversation.current !== conversationId) return;
      preserveScroll.current = true;
      setMessages((items) => [...result.messages, ...items]);
      setHasMore(result.hasMore);
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - height;
      });
    } catch (err) {
      setError(safeError(err));
    } finally {
      setOlderLoading(false);
    }
  };
  const send = async (value, retryId = '') => {
    const text = (value || input).trim();
    if (
      !text ||
      submittingRef.current ||
      loading ||
      clearing ||
      selectingDocument ||
      !conversationId
    )
      return;
    submittingRef.current = true;
    setThinking(true);
    setError('');
    setInput('');
    const requestId =
      (retryId && messages.find((item) => item.id === retryId)?.requestId) || crypto.randomUUID();
    const pending = { id: `pending-${requestId}`, requestId, role: 'user', text };
    setMessages((items) =>
      retryId
        ? items.map((item) => (item.id === retryId ? { ...item, failed: false, requestId } : item))
        : [...items, pending],
    );
    try {
      const result = await assistantService.send(text, conversationId, requestId);
      if (activeConversation.current !== conversationId) return;
      if (result.message.memory?.saved?.length)
        window.dispatchEvent(new Event('lifeadmin-memory-changed'));
      setMessages((items) => [
        ...items
          .filter((item) => item.id !== result.message.id)
          .map((item) => (item.id === (retryId || pending.id) ? result.userMessage : item)),
        result.message,
      ]);
      assistantService
        .conversations()
        .then(setConversations)
        .catch(() => {});
    } catch (requestError) {
      if (activeConversation.current !== conversationId) return;
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
      await assistantService.clear(conversationId);
      setParams({});
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
        description="Ask LifeAdmin anything. It uses your workspace context when available and general AI knowledge when needed."
        action={
          messages.length > 0 && (
            <Button
              variant="secondary"
              disabled={loading || thinking || clearing}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 />
              Clear chat
            </Button>
          )
        }
      />
      <MemoryIndicator />
      <nav className="conversation-history panel" aria-label="Conversation history">
        <Button variant="secondary" disabled={loading || thinking || clearing} onClick={newChat}>
          New Chat
        </Button>
        <label htmlFor="recent-conversations">Recent conversations</label>
        <select
          id="recent-conversations"
          value={conversationId}
          disabled={loading || thinking || clearing}
          onChange={(event) => setParams({ conversation: event.target.value })}
        >
          <option value="" disabled>
            Select a conversation
          </option>
          {conversations.map((chat) => (
            <option key={chat._id} value={chat._id}>
              {chat.title} - {new Date(chat.updatedAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </nav>
      <section className="panel global-assistant-shell">
        <div
          className={`chat-context-bar ${selectedDocumentId ? 'document-active' : 'general-active'}`}
        >
          <span className="chat-context-icon" aria-hidden="true">
            {selectedDocumentId ? <FileText /> : <Sparkles />}
          </span>
          <div className="chat-context-copy">
            <strong>{selectedDocumentId ? 'Discussing document' : 'General conversation'}</strong>
            <span>{selectedDocumentId ? selectedDocumentName : 'No document selected'}</span>
            <small>{selectedDocumentId ? 'Primary context' : 'General chat'}</small>
          </div>
          <div className="chat-context-actions">
            <button
              type="button"
              className="chat-context-action"
              disabled={
                loading ||
                thinking ||
                selectingDocument ||
                documentsLoading ||
                messages.some((message) => message.failed)
              }
              onClick={() => setShowDocumentPicker((value) => !value)}
            >
              {selectedDocumentId ? 'Change document' : 'Discuss a document'}
            </button>
            {selectedDocumentId && (
              <button
                type="button"
                className="chat-context-remove"
                disabled={
                  thinking ||
                  selectingDocument ||
                  loading ||
                  messages.some((message) => message.failed)
                }
                onClick={() => chooseDocument('')}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        {showDocumentPicker && (
          <div className="chat-document-picker">
            <div>
              <strong>Choose a document to discuss</strong>
              <small>Your selection becomes the active context for this conversation.</small>
            </div>
            {documentsError && (
              <button type="button" className="chat-retry" onClick={reloadDocuments}>
                Retry document list
              </button>
            )}
            {!documentsLoading && !documentsError && recentDocuments.length === 0 && (
              <p className="chat-picker-empty">
                Upload a document first, then return here to discuss it.
              </p>
            )}
            <div className="chat-document-options">
              {recentDocuments.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  data-document-id={doc.id}
                  onClick={() => chooseDocument(doc.id)}
                  disabled={selectingDocument}
                >
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>{doc.title || doc.originalFilename}</strong>
                    <small>{doc.type || 'Document'}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="document-chat-error" role="alert">
            {error}{' '}
            <button
              type="button"
              disabled={thinking || loading}
              onClick={() => setHistoryRetry((value) => value + 1)}
            >
              Reload history
            </button>
          </p>
        )}
        <div className="messages global-assistant-messages" aria-live="polite">
          {hasMore && (
            <button className="chat-retry" disabled={olderLoading || thinking} onClick={loadOlder}>
              {olderLoading ? 'Loading...' : 'Load earlier messages'}
            </button>
          )}
          {loading && (
            <div className="assistant-loading">
              <Skeleton lines={4} />
            </div>
          )}
          {!loading && !messages.length && (
            <div className="chat-empty chat-empty-welcome">
              <span className="ai-orbit">{selectedDocumentId ? <FileText /> : <Sparkles />}</span>
              <h2>
                {selectedDocumentId ? `Let's discuss ${selectedDocumentName}` : 'How can I help?'}
              </h2>
              <p>
                {selectedDocumentId
                  ? 'Ask for explanations, summaries, or help working through the document step by step.'
                  : 'Choose how you want to chat.'}
              </p>
              {selectedDocumentId ? (
                <div className="chat-welcome-prompts">
                  {[
                    'Summarize this document',
                    'Explain this assignment',
                    'What do I need to do?',
                    "Let's go through it step by step",
                  ].map((prompt) => (
                    <button
                      type="button"
                      disabled={thinking}
                      onClick={() => send(prompt)}
                      key={prompt}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chat-start-options">
                  <button type="button" onClick={startGeneralChat} disabled={loading || thinking}>
                    <Sparkles aria-hidden="true" />
                    <span>
                      <strong>General question</strong>
                      <small>Ask LifeAdmin anything.</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={startDocumentChat}
                    disabled={loading || thinking || documentsLoading}
                  >
                    <FileText aria-hidden="true" />
                    <span>
                      <strong>Discuss a document</strong>
                      <small>Choose a document and discuss it with LifeAdmin.</small>
                    </span>
                  </button>
                </div>
              )}
              {!selectedDocumentId && (
                <div className="chat-general-prompts" aria-label="Suggested questions">
                  {prompts.map((prompt) => (
                    <button
                      type="button"
                      disabled={thinking}
                      onClick={() => send(prompt)}
                      key={prompt}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
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
                    LifeAdmin is thinking <i /> <i /> <i />
                  </p>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
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
            disabled={loading || thinking || selectingDocument}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Ask LifeAdmin a question..."
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
