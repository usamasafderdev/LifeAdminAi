import { chatError } from '../services/chatError';
import { MemoryIndicator, MemorySuggestions } from './MemoryControls';
import { Download, FileText, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, EmptyState, PageHeader } from './UI';
import { getErrorMessage } from '../services/api';
import { documentService } from '../services/documentService';

const prompts = [
  'What is this document about?',
  'What are the important deadlines?',
  'What actions are required?',
  'Summarize the main requirements.',
];

export function DocumentChatWorkspace({ document, className = '' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [sourceView, setSourceView] = useState(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [sourceLoading, setSourceLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const submittingRef = useRef(false);
  const readable = Boolean(document.extractedText?.trim());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setSourceView(null);
    setError('');
    documentService
      .getChat(document.id)
      .then((history) => {
        if (active) setMessages(history);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, 'Unable to load chat history.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [document.id, historyRetry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, thinking]);

  const send = async (value, retryId = '') => {
    const text = (value || input).trim();
    if (!text || submittingRef.current || loading || clearing || !readable) return;
    submittingRef.current = true;
    setInput('');
    setThinking(true);
    setError('');
    const requestId =
      (retryId && messages.find((item) => item.id === retryId)?.requestId) || crypto.randomUUID();
    const optimistic = { id: `pending-${requestId}`, requestId, role: 'user', text };
    setMessages((items) =>
      retryId
        ? items.map((item) => (item.id === retryId ? { ...item, failed: false, requestId } : item))
        : [...items, optimistic],
    );
    try {
      const result = await documentService.sendChat(document.id, text, requestId);
      if (result.message.memory?.saved?.length)
        window.dispatchEvent(new Event('lifeadmin-memory-changed'));
      setMessages((items) => [
        ...items
          .filter((item) => item.id !== result.message.id)
          .map((item) => (item.id === (retryId || optimistic.id) ? result.userMessage : item)),
        result.message,
      ]);
    } catch (requestError) {
      setMessages((items) =>
        items.map((item) =>
          item.id === (retryId || optimistic.id) ? { ...item, failed: true } : item,
        ),
      );
      setError(chatError(requestError));
    } finally {
      submittingRef.current = false;
      setThinking(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('Clear chat history for this document?')) return;
    setClearing(true);
    setError('');
    try {
      await documentService.clearChat(document.id);
      setMessages([]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to clear chat history.'));
    } finally {
      setClearing(false);
    }
  };

  return (
    <section
      className={`chat-panel panel document-chat-panel ${className}`.trim()}
      id="ask-this-document"
    >
      <header className="document-chat-heading">
        <div>
          <span className="section-icon soft">
            <Sparkles />
          </span>
          <span>
            <strong>Ask This Document</strong>
            <small>Ask questions about the information inside this document.</small>
          </span>
        </div>
        {messages.length > 0 && (
          <Button variant="secondary" disabled={clearing || thinking} onClick={clear}>
            <Trash2 />
            {clearing ? 'Clearing...' : 'Clear chat'}
          </Button>
        )}
      </header>
      <MemoryIndicator />
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
      {sourceView && (
        <section className="knowledge-source-view" aria-label="Document source">
          <header>
            <strong>
              {document.title} ? {sourceView.page ? `Page ${sourceView.page} ? ` : ''}Chunk{' '}
              {sourceView.chunkIndex + 1}
            </strong>
            <button type="button" onClick={() => setSourceView(null)}>
              Close source
            </button>
          </header>
          <pre>{sourceView.content}</pre>
        </section>
      )}
      <div className="messages" aria-live="polite">
        {loading && <div className="chat-loading-inline">Loading chat history...</div>}
        {!loading && !messages.length && !thinking && (
          <div className="chat-empty">
            <span className="ai-orbit">
              <Sparkles />
            </span>
            <h2>Ask This Document</h2>
            <p>Ask questions about the information inside this document.</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            className={`message ${message.role} ${message.failed ? 'failed' : ''}`}
            key={message.id}
          >
            <span className="message-avatar" aria-hidden="true">
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
              {message.failed && (
                <button
                  className="chat-retry"
                  type="button"
                  disabled={thinking}
                  onClick={() => send(message.text, message.id)}
                >
                  Retry
                </button>
              )}
              {message.attachment?.type === 'generated_document' && (
                <div className="generated-document-card">
                  <span>
                    <FileText />
                    <span>
                      <strong>{message.attachment.fileName}</strong>
                      <small>Microsoft Word document</small>
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    disabled={downloading === message.id}
                    onClick={async () => {
                      setDownloading(message.id);
                      setError('');
                      try {
                        await documentService.downloadGenerated(
                          document.id,
                          message.attachment.generatedDocumentId,
                          message.attachment.fileName,
                        );
                      } catch (requestError) {
                        setError(
                          getErrorMessage(requestError, 'Unable to download this document.'),
                        );
                      } finally {
                        setDownloading('');
                      }
                    }}
                  >
                    <Download />
                    {downloading === message.id ? 'Downloading...' : 'Download DOCX'}
                  </Button>
                </div>
              )}
              {message.role === 'assistant' && message.sources?.length > 0 && (
                <div className="answer-sources">
                  <strong>Sources used</strong>
                  {message.sources.map((source) => (
                    <div key={`${source.revision || 'legacy'}-${source.chunkIndex}`}>
                      <FileText size={14} /> {source.documentTitle || document.title} ?{' '}
                      {source.page ? `Page ${source.page} ? ` : ''}Chunk {source.chunkIndex + 1}:{' '}
                      {source.label}{' '}
                      <button
                        type="button"
                        disabled={sourceLoading}
                        onClick={async () => {
                          setSourceLoading(true);
                          setError('');
                          try {
                            setSourceView(await documentService.getSource(document.id, source));
                          } catch (requestError) {
                            setError(getErrorMessage(requestError, 'Unable to open source.'));
                          } finally {
                            setSourceLoading(false);
                          }
                        }}
                      >
                        View source
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="message assistant">
            <span className="message-avatar" aria-hidden="true">
              <Sparkles />
            </span>
            <div className="message-content">
              <strong className="message-author">LifeAdmin</strong>
              <p className="thinking">
                LifeAdmin is checking this document <i /> <i /> <i />
              </p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="suggestions">
        {prompts.map((prompt) => (
          <button
            type="button"
            disabled={loading || thinking || !readable}
            onClick={() => send(prompt)}
            key={prompt}
          >
            {prompt}
          </button>
        ))}
      </div>
      {!readable && (
        <p className="document-chat-readable-warning">
          This document does not contain readable text to chat with.
        </p>
      )}
      <form
        className="composer document-chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          maxLength="3000"
          disabled={loading || thinking || !readable}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={
            readable
              ? 'Ask a question about this document...'
              : 'This document has no readable text'
          }
          aria-label="Ask a question about this document"
        />
        <Button
          aria-label="Send question"
          disabled={loading || thinking || !input.trim() || !readable}
        >
          <Send />
          <span>Send</span>
        </Button>
      </form>
    </section>
  );
}

export default function DocumentChat() {
  const { id } = useParams();
  const nav = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    documentService
      .get(id)
      .then((result) => {
        if (active) setDocument(result);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, 'Unable to open document chat.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (loading)
    return (
      <>
        <PageHeader title="Document chat" description="Loading grounded conversation..." />
        <section className="panel chat-loading">Loading document chat...</section>
      </>
    );
  if (!document)
    return (
      <EmptyState
        title="Document chat unavailable"
        text={error || 'The document may have been deleted.'}
        action={<Button onClick={() => nav('/app/documents')}>Back to documents</Button>}
      />
    );
  return (
    <>
      <PageHeader
        title={`Chat with ${document.title}`}
        description="Answers are grounded only in this document."
      />
      <div className="doc-chat-layout">
        <aside className="doc-context panel">
          <div className="context-file">
            <FileText />
          </div>
          <Badge tone="neutral">{document.category}</Badge>
          <h2>{document.title}</h2>
          <p>
            {document.extractedText?.trim()
              ? 'Readable document text is available for grounded questions.'
              : 'No readable text is available.'}
          </p>
          <Button variant="secondary" onClick={() => nav(`/app/documents/${document.id}`)}>
            View document
          </Button>
        </aside>
        <DocumentChatWorkspace key={document.id} document={document} />
      </div>
    </>
  );
}
