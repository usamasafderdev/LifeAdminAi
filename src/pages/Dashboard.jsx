import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileImage,
  FileText,
  Lightbulb,
  ListChecks,
  Plus,
  Upload,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Button, PageHeader, PriorityBadge, CheckCircle } from '../components/UI';
import { daysUntil, isOverdue } from '../utils/dates';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const nav = useNavigate();
  const { documents, tasks, completeTask } = useApp();
  const { user } = useAuth();
  const firstName = user?.fullName?.trim().split(/\s+/)[0] || 'there';
  const effective = (t) => t.userPriority || t.systemPriority || t.priority;
  const urgent = tasks.filter((t) => effective(t) === 'URGENT' && t.status !== 'Completed');
  const open = tasks.filter((t) => t.status !== 'Completed');
  const completed = tasks.filter((t) => t.status === 'Completed');
  const overdue = open.filter((t) => isOverdue(t.date));
  const upcoming = open.filter((t) => { const d = daysUntil(t.date); return d !== null && d >= 0 && d <= 14; });
  const percent = tasks.length ? Math.round(completed.length / tasks.length * 100) : 0;
  return (
    <>
      <PageHeader
        title={`Good morning, ${firstName}`}
        description={urgent.length ? `${urgent.length} item${urgent.length === 1 ? '' : 's'} need your attention now.` : 'Nothing urgent needs your attention.'}
        action={
          <Button onClick={() => nav('/app/add')}>
            <Plus size={16} />
            Add Information
          </Button>
        }
      />
      <section className="metrics">
        <div>
          <span className="metric-icon urgent">
            <Clock3 />
          </span>
          <p>Urgent</p>
          <strong>{urgent.length}</strong>
          <small>Need action now</small>
        </div>
        <div>
          <span className="metric-icon blue">
            <CalendarDays />
          </span>
          <p>Upcoming</p>
          <strong>{upcoming.length}</strong>
          <small>Next 14 days</small>
        </div>
        <div>
          <span className="metric-icon green">
            <FileText />
          </span>
          <p>Documents</p>
          <strong>{documents.length}</strong>
          <small>Saved records</small>
        </div>
        <div>
          <span className="metric-icon amber">
            <ListChecks />
          </span>
          <p>Open Tasks</p>
          <strong>{open.length}</strong>
          <small>Still pending</small>
        </div>
      </section>
      <div className="dashboard-grid">
        <section className="panel attention">
          <div className="section-head">
            <div>
              <h2>Needs your attention</h2>
              <p>Your highest-priority open items</p>
            </div>
            <button onClick={() => nav('/app/tasks')}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          {tasks
            .filter((t) => t.status !== 'Completed')
            .slice(0, 4)
            .map((t) => (
              <div className="attention-row" key={t.id}>
                <CheckCircle onClick={() => completeTask(t.id)} />
                <div>
                  <strong>{t.title}</strong>
                  <span>
                    {t.category} · Due {t.due.toLowerCase()}
                  </span>
                </div>
                <PriorityBadge priority={t.priority} />
                <button onClick={() => nav(`/app/documents/${t.source}`)}>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
        </section>
        <section className="panel progress-panel">
          <div className="section-head">
            <div>
              <h2>Task progress</h2>
              <p>August overview</p>
            </div>
          </div>
          <div className="progress-visual modern-progress">
            <div className="progress-number">
              <strong>{percent}%</strong>
              <span>of August tasks complete</span>
            </div>
            <div className="legend">
              <p>
                <i className="green-dot" />
                Completed <b>{completed.length}</b>
              </p>
              <p>
                <i className="blue-dot" />
                Pending <b>{open.length}</b>
              </p>
              <p>
                <i className="red-dot" />
                Overdue <b>{overdue.length}</b>
              </p>
            </div>
          </div>
          <div className="segmented-progress">
            <i className="complete" style={{ width: `${percent}%` }} />
            <i className="pending" style={{ width: `${100 - percent}%` }} />
          </div>
          <div className="ai-insight">
            <span>
              <Lightbulb />
            </span>
            <div>
              <small>LIFEADMIN INSIGHT</small>
              <p>{upcoming.length ? `${upcoming.length} deadline${upcoming.length === 1 ? '' : 's'} fall within the next 14 days.` : 'No deadlines fall within the next 14 days.'}</p>
            </div>
            <button onClick={() => nav('/app/tasks')}>
              Review priorities <ArrowRight />
            </button>
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Upcoming</h2>
              <p>Your next important dates</p>
            </div>
            <button onClick={() => nav('/app/calendar')}>
              Calendar <ArrowRight size={14} />
            </button>
          </div>
          <div className="timeline">
            {open.filter(t => t.date).sort((a,b) => a.date.localeCompare(b.date)).slice(0,4).map((t) => { const d = new Date(`${t.date}T12:00:00`); const x = [String(d.getDate()), d.toLocaleString('en-US',{month:'short'}).toUpperCase(), t.title, t.category]; return (
              <div key={x[2]}>
                <time>
                  <b>{x[0]}</b>
                  <small>{x[1]}</small>
                </time>
                <i />
                <p>
                  <strong>{x[2]}</strong>
                  <span>{x[3]}</span>
                </p>
              </div>
            ); })}
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Quick actions</h2>
              <p>Capture something new</p>
            </div>
          </div>
          <div className="quick-actions">
            {[
              [Upload, 'Upload document'],
              [FileImage, 'Upload image'],
              [FileText, 'Paste text'],
              [Plus, 'Add manually'],
            ].map(([I, t], i) => (
              <button key={t} onClick={() => nav(`/app/add?method=${i}`)}>
                <I size={19} />
                <span>{t}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="panel recent">
        <div className="section-head">
          <div>
            <h2>Recent documents</h2>
            <p>Recently organized by LifeAdmin</p>
          </div>
          <button onClick={() => nav('/app/documents')}>
            View all documents <ArrowRight size={14} />
          </button>
        </div>
        <div className="recent-table">
          {documents.slice(0, 5).map((d) => (
            <button key={d.id} onClick={() => nav(`/app/documents/${d.id}`)}>
              <span className="mini-file">
                <FileText size={16} />
              </span>
              <span>
                <strong>{d.title}</strong>
                <small>
                  {d.category} · Added {d.date}
                </small>
              </span>
              <span>{d.deadline || 'No deadline'}</span>
              <PriorityBadge priority={d.priority} />
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
