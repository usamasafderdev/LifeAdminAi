import { ImportantAlerts } from '../components/NotificationCenter';
import DailyBriefingCard from '../components/DailyBriefingCard';
import { ArrowRight, BellRing, CalendarDays, Clock3, FileText, Lightbulb, ListChecks, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CheckCircle, EmptyState, PageHeader, PriorityBadge, Skeleton } from '../components/UI';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { integrationService } from '../services/integrationService';
import { TODAY, dueLabel } from '../utils/dates';

const empty = { counts: { documents: 0, openTasks: 0, highPriority: 0, upcomingDeadlines: 0, upcomingReminders: 0 }, deadlineSummary: { insight: 'No deadlines fall within the next 14 days.' }, taskProgress: { total: 0, completed: 0, pending: 0, overdue: 0 }, todaysFocus: [], upcomingReminders: [], recentDocuments: [] };

export default function Dashboard() {
  const requestVersion = useRef(0);
  const nav = useNavigate();
  const { tasks, reminders, updateTask, reloadReminders } = useApp();
  const { user } = useAuth();
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => { const version = ++requestVersion.current; setLoading(true); setError(''); try { const result = await integrationService.dashboard(TODAY); if (version === requestVersion.current) setData(result); } catch (e) { setError(getErrorMessage(e, 'Unable to load your dashboard.')); } finally { if (version === requestVersion.current) setLoading(false); } };
  useEffect(() => { load(); }, [tasks, reminders]);
  const complete = async (id) => { await updateTask(id, { status: 'Completed' }); await reloadReminders(); await load(); };
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'there';
  return <>
    <PageHeader title={`Good morning, ${firstName}`} description="Your real tasks, reminders, and documents in one place." action={<Button onClick={() => nav('/app/add')}><Plus size={16} />Add Information</Button>} />
    <ImportantAlerts />
    <DailyBriefingCard key={user?._id || user?.id} />
    {loading ? <section className="panel"><Skeleton lines={8} /></section> : error ? <EmptyState title="Dashboard could not be loaded" text={error} action={<Button onClick={load}>Try again</Button>} /> : <>
      <section className="metrics">
        <Metric icon={FileText} tone="green" label="Documents" value={data.counts.documents} note="Saved records" />
        <Metric icon={ListChecks} tone="blue" label="Open Tasks" value={data.counts.openTasks} note="Pending or in progress" />
        <Metric icon={Clock3} tone="urgent" label="High Priority" value={data.counts.highPriority} note="Open tasks" />
        <Metric icon={CalendarDays} tone="amber" label="Upcoming" value={data.counts.upcomingDeadlines} note="Deadlines in next 14 days" />
      </section>
      <div className="dashboard-grid dashboard-live-grid">
        <section className="panel attention"><SectionHead title="Today's Focus" subtitle="Tasks and reminders needing attention now" action={() => nav('/app/tasks')} label="View tasks" />
          {data.todaysFocus.length ? data.todaysFocus.map((item) => item.type === 'reminder' ? <ReminderFocusItem reminder={item} nav={nav} key={`reminder-${item.id}`} /> : <TaskFocusItem task={item} complete={complete} nav={nav} key={`task-${item.id}`} />) : <InlineEmpty icon={ListChecks} text="Nothing needs your attention right now." />}
        </section>
        <section className="panel"><SectionHead title="Upcoming reminders" subtitle="Your next active reminders" action={() => nav('/app/reminders')} label="View all" /><div className="timeline">
          {data.upcomingReminders.length ? data.upcomingReminders.map((reminder) => { const date = new Date(reminder.remindAt); return <div key={reminder.id}><time><b>{date.getDate()}</b><small>{date.toLocaleString(undefined, { month: 'short' }).toUpperCase()}</small></time><i /><p><strong>{reminder.title}</strong><span>{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></p></div>; }) : <InlineEmpty icon={BellRing} text="No upcoming reminders." />}
        </div></section>
      </div>
      <section className="panel progress-panel dashboard-progress-panel">
        <div className="section-head"><div><h2>Task progress</h2><p>All current tasks, separate from the deadline window</p></div></div>
        <div className="dashboard-progress-stats"><p><strong>{data.taskProgress.completed}</strong><span>Completed</span></p><p><strong>{data.taskProgress.pending}</strong><span>Pending</span></p><p><strong>{data.taskProgress.overdue}</strong><span>Overdue</span></p><p><strong>{data.taskProgress.total}</strong><span>Total active + completed</span></p></div>
        <div className="ai-insight"><span><Lightbulb /></span><div><small>LIFEADMIN INSIGHT</small><p>{data.deadlineSummary.insight}</p></div><button onClick={() => nav('/app/tasks')}>Review deadlines <ArrowRight /></button></div>
      </section>
      <section className="panel recent"><SectionHead title="Recent documents" subtitle="Recently updated records" action={() => nav('/app/documents')} label="View all documents" /><div className="recent-table">
        {data.recentDocuments.length ? data.recentDocuments.map((doc) => <button key={doc.id} onClick={() => nav(`/app/documents/${doc.id}`)}><span className="mini-file"><FileText size={16} /></span><span><strong>{doc.title}</strong><small>{doc.category} · {doc.type}</small></span><span>{doc.aiAnalysis?.status || 'Not analyzed'}</span><span>{doc.generatedTaskCount || 0} generated tasks</span><ArrowRight size={15} /></button>) : <InlineEmpty icon={FileText} text="No documents yet. Add information to begin." />}
      </div></section>
    </>}
  </>;
}

function Metric({ icon: Icon, tone, label, value, note }) { return <div><span className={`metric-icon ${tone}`}><Icon /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></div>; }
function SectionHead({ title, subtitle, action, label }) { return <div className="section-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={action}>{label} <ArrowRight size={14} /></button></div>; }
function InlineEmpty({ icon: Icon, text }) { return <div className="dashboard-inline-empty"><Icon /><span>{text}</span></div>; }
function TaskFocusItem({ task, complete, nav }) { return <div className="attention-row focus-task"><CheckCircle onClick={() => complete(task.id)} /><div><strong>{task.title}</strong><span>Task · {task.date ? `Due ${dueLabel(task.date)}` : 'High priority'} · {task.priority}</span></div><PriorityBadge priority={task.priority} /><button onClick={() => nav('/app/tasks')} aria-label={`Open ${task.title}`}><ArrowRight size={16} /></button></div>; }
function ReminderFocusItem({ reminder, nav }) { const date = new Date(reminder.remindAt); return <div className="attention-row focus-reminder"><span className="focus-reminder-icon"><BellRing /></span><div><strong>{reminder.title}</strong><span>Reminder · Today at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></div><span className="focus-type-badge">REMINDER</span><button onClick={() => nav('/app/reminders')} aria-label={`Open ${reminder.title}`}><ArrowRight size={16} /></button></div>; }
