import { ArrowUpRight, FileText, MoreHorizontal, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Badge, Button, ConfirmDialog, EmptyState, IconButton, PageHeader, PriorityBadge } from '../components/UI';
import { daysUntil, formatDate, isThisWeek, toDateKey } from '../utils/dates';

const documentAnswer = (doc, q) => {
  const s = q.toLowerCase();
  if (/amount|fee|pay|cost/.test(s)) return doc.amount ? `The document states the amount is ${doc.amount}.` : 'This document does not mention that information.';
  if (/deadline|due|date/.test(s)) return doc.deadline ? `The stated deadline is ${doc.deadline}.` : 'This document does not mention that information.';
  if (/warranty|expire|expiry/.test(s)) { const date = doc.expiryDate || (doc.category === 'Warranty' ? doc.deadline : null); return date ? `The warranty/expiry date is ${date}.` : 'This document does not mention that information.'; }
  if (/required|submit|documents|items|actions/.test(s)) { const items = doc.requiredItems || doc.items || doc.actions; return items?.length ? `The listed items/actions are: ${items.join(', ')}.` : 'This document does not mention that information.'; }
  if (/consequence|late|miss|what happens/.test(s)) return doc.consequence ? `The document says: ${doc.consequence}.` : 'This document does not mention that information.';
  if (/summary|what.*(is|about)|information/.test(s)) return doc.summary || 'This document does not mention that information.';
  return doc.summary || 'This document does not mention that information.';
};
const suggestionsFor = (doc) => doc.category === 'Bills' ? ['How much do I need to pay?','When is it due?','What bill is this?','Is any action required?'] : doc.category === 'Warranty' ? ['When does the warranty expire?','What product is covered?','What information is available?'] : doc.category === 'Contracts' ? ['What important dates are mentioned?','Is there a notice period?','What actions are required?'] : ['What is the deadline?','What do I need to submit?','How much is the fee?','What happens if I miss it?'];

const retrieve = (query, documents, tasks, reminders) => {
  const q = query.toLowerCase(); let entities = [], text = '';
  const rank = (task) => ({ URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 })[task.userPriority || task.priority] ?? 4;
  if (/focus|today/.test(q)) { entities = tasks.filter(t => t.status !== 'Completed').sort((a,b) => rank(a) - rank(b)).slice(0,4); text = entities.length ? `Focus on ${entities.map(x=>x.title).join(', ')}.` : 'Nothing needs your attention today.'; }
  else if (/deadline|this week/.test(q)) { entities = [...tasks.filter(t => t.status !== 'Completed' && isThisWeek(t.date)), ...documents.filter(d => isThisWeek(d.deadlineDate || d.deadline))].sort((a,b) => toDateKey(a.date || a.deadline).localeCompare(toDateKey(b.date || b.deadline))); text = entities.length ? `You have ${entities.length} relevant deadlines this week.` : 'No deadlines are recorded this week.'; }
  else if (/bill/.test(q)) { entities = [...documents.filter(d => d.category === 'Bills'), ...tasks.filter(t => t.category === 'Bills' && t.status !== 'Completed')].sort((a,b) => daysUntil(a.date || a.deadline) - daysUntil(b.date || b.deadline)); text = entities.length ? `${entities.length} bill-related items are tracked.` : 'No upcoming bills are recorded.'; }
  else if (/university/.test(q)) { entities = tasks.filter(t => t.category === 'University' && t.status !== 'Completed'); text = `${entities.length} university tasks are unfinished.`; }
  else if (/warranty|laptop|macbook/.test(q)) { entities = documents.filter(d => /warranty|laptop|macbook/i.test(`${d.title} ${d.category} ${d.summary}`)); text = entities.length ? `I found ${entities.map(x=>x.title).join(', ')}.` : 'No laptop warranty is recorded.'; }
  else if (/subscription/.test(q)) { entities = documents.filter(d => d.category === 'Subscription'); text = entities.length ? `You are tracking ${entities.length} subscriptions: ${entities.map(x=>x.title).join(', ')}.` : 'No subscriptions are recorded.'; }
  else if (/expire/.test(q)) { entities = documents.filter(d => d.expiryDate || d.category === 'Warranty'); text = entities.length ? `I found ${entities.length} documents with expiry information.` : 'No expiring documents are recorded.'; }
  else { const words = q.split(/\s+/).filter(x => x.length > 3); entities = [...documents,...tasks,...reminders].filter(x => words.some(w => JSON.stringify(x).toLowerCase().includes(w))).slice(0,5); text = entities.length ? `I found ${entities.length} related LifeAdmin records.` : 'I could not find matching information in your LifeAdmin records.'; }
  return { text, entities };
};

export function AskLifeAdmin() {
  const { documents, tasks, reminders, conversations, setConversations, notify } = useApp();
  const [activeId, setActiveId] = useState(conversations[0]?.id || null), [input,setInput] = useState(''), [thinking,setThinking] = useState(false), [deleting,setDeleting] = useState(false);
  const active = conversations.find(c => c.id === activeId);
  const newChat = () => { const c={id:`c-${Date.now()}`,title:'New conversation',messages:[]}; setConversations(v=>[c,...v]); setActiveId(c.id); };
  const send = (value) => { const text=(value || input).trim(); if(!text || thinking) return; let id=activeId; if(!active){ const c={id:`c-${Date.now()}`,title:text.split(' ').slice(0,4).join(' '),messages:[]}; id=c.id; setConversations(v=>[c,...v]); setActiveId(id); } setConversations(v=>v.map(c=>c.id===id?{...c,title:c.messages.length?c.title:text.split(' ').slice(0,4).join(' '),messages:[...c.messages,{role:'user',text}]}:c)); setInput(''); setThinking(true); window.setTimeout(()=>{ const result=retrieve(text,documents,tasks,reminders); setConversations(v=>v.map(c=>c.id===id?{...c,messages:[...c.messages,{role:'assistant',...result}]}:c)); setThinking(false); },650); };
  const remove = () => { setConversations(v=>v.filter(c=>c.id!==activeId)); setActiveId(null); setDeleting(false); notify('Conversation deleted'); };
  return <><PageHeader title="Ask LifeAdmin" description="Ask questions across your tasks, deadlines, documents and reminders."/><div className="ask-layout"><aside className="history panel"><Button onClick={newChat}><Plus/>New conversation</Button><span>CONVERSATIONS</span>{conversations.map(c=><button className={activeId===c.id?'active':''} key={c.id} onClick={()=>setActiveId(c.id)}><div><strong>{c.title}</strong><small>Saved conversation</small></div><MoreHorizontal onClick={e=>{e.stopPropagation(); const title=window.prompt('Rename conversation',c.title); if(title) setConversations(v=>v.map(x=>x.id===c.id?{...x,title}:x));}}/></button>)}</aside><ChatPanel title={active?.title || 'New conversation'} messages={active?.messages || []} input={input} setInput={setInput} send={send} thinking={thinking} global onDelete={()=>setDeleting(true)} prompts={['What should I focus on today?','Which bills are due soon?','What university tasks are unfinished?','Find my laptop warranty.']}/></div><ConfirmDialog open={deleting} onClose={()=>setDeleting(false)} onConfirm={remove} title="Delete conversation?" text="This conversation history will be removed."/></>;
}

export function DocumentChat() {
  const { id } = useParams();
  const { documents } = useApp();
  const doc = documents.find((item) => item.id === id);
  const nav = useNavigate();
  const [messages, setMessages] = useState(doc ? [{ role: 'assistant', text: `I’m ready to answer questions about ${doc.title}.` }] : []);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  if (!doc) return <EmptyState title="Document not found" text="It may have been deleted." />;
  if (doc.isReal) {
    return <><PageHeader title={doc.title} description="Document chat" /><EmptyState title="Document chat is not available yet" text="This record is saved, but document analysis and grounded chat have not been enabled." action={<Button onClick={() => nav(`/app/documents/${doc.id}`)}>View document</Button>} /></>;
  }
  const send = (value) => {
    const text = (value || input).trim();
    if (!text || thinking) return;
    setMessages((items) => [...items, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setMessages((items) => [...items, { role: 'assistant', text: documentAnswer(doc, text) }]);
      setThinking(false);
    }, 650);
  };
  return <><PageHeader title={`Chat with ${doc.title}`} description="Answers are grounded in this document’s extracted information." /><div className="doc-chat-layout"><aside className="doc-context panel"><div className="context-file"><FileText /></div><Badge tone="neutral">{doc.category}</Badge><h2>{doc.title}</h2><p>{doc.summary}</p><dl><dt>Deadline</dt><dd>{doc.deadline || 'Not mentioned'}</dd><dt>Priority</dt><dd><PriorityBadge priority={doc.priority} /></dd></dl><Button variant="secondary" onClick={() => nav(`/app/documents/${doc.id}`)}>View document</Button></aside><ChatPanel messages={messages} input={input} setInput={setInput} send={send} thinking={thinking} prompts={suggestionsFor(doc)} /></div></>;
}

function ChatPanel({title,messages,input,setInput,send,thinking,global,onDelete,prompts}) { const nav=useNavigate(); return <section className="chat-panel panel">{title&&<header><div><Sparkles/><strong>{title}</strong></div>{onDelete&&<IconButton label="Delete conversation" onClick={onDelete}><Trash2/></IconButton>}</header>}<div className="messages">{!messages.length&&!thinking&&<div className="chat-empty"><span className="ai-orbit"><Sparkles/></span><h2>What would you like to know?</h2><p>Ask about your tasks, deadlines, bills, documents, or reminders.</p></div>}{messages.map((m,i)=><div className={`message ${m.role}`} key={i}><span>{m.role==='assistant'?<Sparkles/>:'HA'}</span><div className="message-content"><p>{m.text}</p>{global&&m.entities?.length>0&&<><div className="answer-objects">{m.entities.map(e=><button key={`${e.id}-${e.title}`} onClick={()=>nav(e.type||e.summary?`/app/documents/${e.id}`:e.when?'/app/reminders':'/app/tasks')}><span className="answer-file"><FileText/></span><div><strong>{e.title}</strong><small>{e.category||e.status} · {formatDate(e.date||e.deadline)}</small></div>{e.priority&&<PriorityBadge priority={e.priority}/>}<ArrowUpRight/></button>)}</div><details className="answer-sources"><summary>Based on {m.entities.length} live record{m.entities.length===1?'':'s'}</summary><p>{m.entities.map(e=>e.title).join(' · ')}</p></details></>}</div></div>)}{thinking&&<div className="message assistant"><span><Sparkles/></span><div className="message-content"><p className="thinking">LifeAdmin <i/> <i/> <i/></p></div></div>}</div><div className="suggestions">{prompts.map(p=><button onClick={()=>send(p)} key={p}>{p}</button>)}</div><form className="composer" onSubmit={e=>{e.preventDefault();send()}}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask LifeAdmin…"/><Button aria-label="Send" disabled={thinking}><Send/></Button></form></section> }
