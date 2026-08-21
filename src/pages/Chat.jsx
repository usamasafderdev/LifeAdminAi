import {
  ArrowUpRight,
  Bot,
  FileText,
  ListTodo,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Timer,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { conversations, documents } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { Badge, Button, IconButton, PageHeader, PriorityBadge } from '../components/UI';

const answers = {
  deadline:
    'The deadline is September 5, 2026. I recommend completing the payment and form one day earlier.',
  documents:
    'According to this notice, you need a CNIC copy, registration form and paid fee voucher.',
  required:
    'According to this notice, you need a CNIC copy, registration form and paid fee voucher.',
  happens: 'The notice says your registration may be blocked if you miss the deadline.',
  pay: 'The registration fee is PKR 5,000.',
  bill: 'Your electricity bill of PKR 18,750 is due August 27, followed by the internet bill on August 30.',
};
const getAnswer = (q) =>
  Object.entries(answers).find(([k]) => q.toLowerCase().includes(k))?.[1] ||
  'Based on your LifeAdmin records, your most urgent actions are the FYP proposal today and the semester fee tomorrow.';
export function AskLifeAdmin() {
  const { tasks, reminders } = useApp();
  const [active, setActive] = useState(conversations[0]),
    [messages, setMessages] = useState(conversations[0].messages),
    [input, setInput] = useState('');
  const send = (q) => {
    const text = q || input;
    if (!text.trim()) return;
    setMessages((v) => [
      ...v,
      { role: 'user', text },
      { role: 'assistant', text: getAnswer(text) },
    ]);
    setInput('');
  };
  return (
    <>
      <PageHeader
        title="Ask LifeAdmin"
        description="Ask questions across your tasks, deadlines, documents and reminders."
      />
      <div className="ask-layout">
        <aside className="history panel">
          <Button
            onClick={() => {
              setActive({ title: 'New conversation' });
              setMessages([]);
            }}
          >
            <Plus />
            New conversation
          </Button>
          <span>TODAY</span>
          {conversations.slice(0, 2).map((c) => (
            <button
              className={active.id === c.id ? 'active' : ''}
              key={c.id}
              onClick={() => {
                setActive(c);
                setMessages(c.messages);
              }}
            >
              <div>
                <strong>{c.title}</strong>
                <small>Updated recently</small>
              </div>
              <MoreHorizontal />
            </button>
          ))}
          <span>EARLIER</span>
          {conversations.slice(2).map((c) => (
            <button
              className={active.id === c.id ? 'active' : ''}
              key={c.id}
              onClick={() => {
                setActive(c);
                setMessages(c.messages);
              }}
            >
              <div>
                <strong>{c.title}</strong>
                <small>Previous conversation</small>
              </div>
              <MoreHorizontal />
            </button>
          ))}
        </aside>
        <ChatPanel
          title={active.title}
          messages={messages}
          input={input}
          setInput={setInput}
          send={send}
          global
          context={{
            documents: documents.length,
            tasks: tasks.filter((task) => task.status !== 'Completed').length,
            reminders: reminders.length,
          }}
        />
      </div>
    </>
  );
}
export function DocumentChat() {
  const { id } = useParams();
  const doc = documents.find((d) => d.id === id) || documents[0];
  const [messages, setMessages] = useState([
      { role: 'assistant', text: `I’m ready to answer questions about ${doc.title}.` },
    ]),
    [input, setInput] = useState('');
  const send = (q) => {
    const text = q || input;
    if (!text.trim()) return;
    setMessages((v) => [
      ...v,
      { role: 'user', text },
      { role: 'assistant', text: getAnswer(text) },
    ]);
    setInput('');
  };
  const nav = useNavigate();
  return (
    <>
      <PageHeader
        title={`Chat with ${doc.title}`}
        description="Answers are grounded in this document’s extracted information."
      />
      <div className="doc-chat-layout">
        <aside className="doc-context panel">
          <div className="context-file">
            <FileText />
          </div>
          <Badge tone="neutral">{doc.category}</Badge>
          <h2>{doc.title}</h2>
          <p>{doc.summary}</p>
          <dl>
            <dt>Deadline</dt>
            <dd>{doc.deadline}</dd>
            <dt>Priority</dt>
            <dd>
              <PriorityBadge priority={doc.priority} />
            </dd>
          </dl>
          <Button variant="secondary" onClick={() => nav(`/app/documents/${doc.id}`)}>
            View document
          </Button>
        </aside>
        <ChatPanel messages={messages} input={input} setInput={setInput} send={send} />
      </div>
    </>
  );
}
function ChatPanel({ title, messages, input, setInput, send, global, context }) {
  const prompts = global
    ? [
        'What should I focus on today?',
        'Which bills are due soon?',
        'What university tasks are unfinished?',
      ]
    : [
        'What is the deadline?',
        'What documents are required?',
        'What happens if I miss it?',
        'How much do I need to pay?',
      ];
  return (
    <section className="chat-panel panel">
      {title && (
        <header>
          <div>
            <Sparkles />
            <strong>{title}</strong>
          </div>
          <IconButton label="Delete conversation">
            <Trash2 />
          </IconButton>
        </header>
      )}
      <div className="messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="ai-orbit">
              <Sparkles />
            </span>
            <small>USING YOUR LIFEADMIN DATA</small>
            <h2>What would you like to know?</h2>
            <p>
              Ask about your tasks, deadlines, bills, documents, or anything LifeAdmin has
              organized.
            </p>
            {context && (
              <div className="context-counts">
                <span>
                  <FileText />
                  {context.documents}
                  <small>Documents</small>
                </span>
                <span>
                  <ListTodo />
                  {context.tasks}
                  <small>Open tasks</small>
                </span>
                <span>
                  <Timer />
                  {context.reminders}
                  <small>Reminders</small>
                </span>
                <span>
                  <Sparkles />6<small>Deadlines</small>
                </span>
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div className={`message ${m.role}`} key={i}>
            <span>{m.role === 'assistant' ? <Sparkles /> : 'HA'}</span>
            <div className="message-content">
              <p>{m.text}</p>
              {global && m.role === 'assistant' && (
                <>
                  <div className="answer-objects">
                    {documents
                      .filter((document) => ['doc-009', 'doc-011', 'doc-002'].includes(document.id))
                      .map((document) => (
                        <button
                          key={document.id}
                          onClick={() => window.location.assign(`/app/documents/${document.id}`)}
                        >
                          <span className="answer-file">
                            <FileText />
                          </span>
                          <div>
                            <strong>{document.title}</strong>
                            <small>
                              {document.amount || document.category} · {document.deadline}
                            </small>
                          </div>
                          <PriorityBadge priority={document.priority} />
                          <ArrowUpRight />
                        </button>
                      ))}
                  </div>
                  <details className="answer-sources">
                    <summary>Based on 2 tasks, 1 document and 1 reminder</summary>
                    <p>FYP Proposal Task · Semester Fee Voucher · Electricity Bill Reminder</p>
                  </details>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="suggestions">
        {prompts.map((p) => (
          <button onClick={() => send(p)} key={p}>
            {p}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask LifeAdmin…"
        />
        <Button aria-label="Send">
          <Send />
        </Button>
      </form>
    </section>
  );
}
