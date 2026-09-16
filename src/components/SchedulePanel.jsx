import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Globe2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Button, Field } from './UI';
import { schedulingService as service } from '../services/schedulingService';
import { useApp } from '../context/AppContext';
import { getErrorMessage } from '../services/api';
import { schedulingDay, schedulingInstant, schedulingLocal } from '../utils/schedulingDates';

const defaultProfile = () => ({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  workingDays: [1, 2, 3, 4, 5],
  availableTimeRanges: [{ start: '18:00', end: '22:00' }],
});
export default function SchedulePanel() {
  const [params, setParams] = useSearchParams();
  const [profile, setProfile] = useState(defaultProfile);
  const [saved, setSaved] = useState(null);
  const { tasks: allTasks, updateTask, reloadTasks, reloadReminders } = useApp();
  const tasks = allTasks.filter((task) => ['Pending', 'In Progress'].includes(task.status));
  const [selected, setSelected] = useState([]);
  const [proposal, setProposal] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [events, setEvents] = useState([]);
  const [date, setDate] = useState(() =>
    schedulingLocal(new Date(), defaultProfile().timezone).slice(0, 10),
  );
  const [view, setView] = useState(7);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [useAi, setUseAi] = useState(true);
  const request = useRef(0);
  const zone = saved?.timezone || defaultProfile().timezone;
  const previewZone = proposal?.timezone || zone;
  const setPreview = (value) => {
    setProposal(value);
    setBlocks(value?.blocks || []);
  };
  const perform = async (fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e.response || e.request ? getErrorMessage(e) : e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    service
      .availability()
      .then((p) => {
        if (!active) return;
        if (p) {
          setSaved(p);
          setProfile(p);
          setDate(schedulingLocal(new Date(), p.timezone).slice(0, 10));
        }
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const proposalId = params.get('proposal');
  useEffect(() => {
    let active = true;
    if (proposalId)
      service
        .proposal(proposalId)
        .then((p) => {
          if (active) setPreview(p);
        })
        .catch((e) => {
          if (active) setError(getErrorMessage(e));
        });
    return () => {
      active = false;
    };
  }, [proposalId]);
  const loadEvents = async () => {
    const id = ++request.current;
    const rows = await service.events(
      schedulingInstant(`${date}T00:00`, zone),
      schedulingInstant(`${schedulingDay(date, view)}T00:00`, zone),
    );
    if (id === request.current) setEvents(rows);
  };
  useEffect(() => {
    loadEvents().catch((e) => setError(e.response ? getErrorMessage(e) : e.message));
    return () => {
      request.current++;
    };
  }, [date, view, zone, allTasks]);
  const pending = proposal?.status === 'pending' && new Date(proposal.expiresAt) > new Date();
  const editTime = (index, field, value) => {
    try {
      const instant = schedulingInstant(value, previewZone);
      setBlocks((rows) => rows.map((b, i) => (i === index ? { ...b, [field]: instant } : b)));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <section className="panel schedule-panel" aria-label="Smart scheduling">
      <div className="schedule-panel-header">
        <div>
          <div className="schedule-title-row">
            <span className="schedule-title-icon">
              <CalendarClock size={17} />
            </span>
            <p className="eyebrow">Smart scheduling</p>
          </div>
          <h2>Plan your time</h2>
        </div>
        <div className="schedule-status-badge">
          <Globe2 size={14} /> {saved ? saved.timezone : zone}
        </div>
      </div>
      <p className="schedule-panel-subtitle">
        Choose available hours, review a suggested plan, then accept it to reserve time.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="schedule-notice" role="status">
          {notice}
        </p>
      )}

      <div className="schedule-card-group">
        <div className="schedule-card">
          <details open={!saved}>
            <summary>
              <span className="schedule-summary-label">
                <Clock3 size={16} />
                <span>
                  <strong>Availability</strong>
                  <small>{saved ? saved.timezone : 'Set your working hours'}</small>
                </span>
              </span>
            </summary>
            <form
              className="modal-form"
              onSubmit={(e) => {
                e.preventDefault();
                perform(async () => {
                  const p = await service.saveAvailability(profile);
                  setSaved(p);
                  setProfile(p);
                  setNotice('Availability saved.');
                });
              }}
            >
              <Field label="Timezone">
                <input
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  placeholder="Asia/Karachi"
                  required
                />
              </Field>
              <fieldset>
                <legend>Available days</legend>
                <div className="schedule-days">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={profile.workingDays.includes(i)}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            workingDays: e.target.checked
                              ? [...profile.workingDays, i]
                              : profile.workingDays.filter((d) => d !== i),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>
              {profile.availableTimeRanges.map((range, i) => (
                <div className="schedule-toolbar" key={i}>
                  {['start', 'end'].map((field) => (
                    <Field label={field === 'start' ? 'From' : 'Until'} key={field}>
                      <input
                        aria-label={`Range ${i + 1} ${field}`}
                        type="time"
                        value={range[field]}
                        required
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            availableTimeRanges: profile.availableTimeRanges.map((r, j) =>
                              i === j ? { ...r, [field]: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </Field>
                  ))}
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        availableTimeRanges: profile.availableTimeRanges.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove range
                  </Button>
                </div>
              ))}
              <div className="schedule-toolbar">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={profile.availableTimeRanges.length >= 8}
                  onClick={() =>
                    setProfile({
                      ...profile,
                      availableTimeRanges: [
                        ...profile.availableTimeRanges,
                        { start: '09:00', end: '12:00' },
                      ],
                    })
                  }
                >
                  Add hours
                </Button>
                <Button disabled={busy}>Save availability</Button>
              </div>
            </form>
          </details>
        </div>

        <div className="schedule-card">
          <details>
            <summary>
              <span className="schedule-summary-label">
                <ClipboardList size={16} />
                <span>
                  <strong>Tasks &amp; duration estimates</strong>
                  <small>{selected.length ? `${selected.length} selected` : 'All selected'}</small>
                </span>
              </span>
            </summary>
            <p>Durations are total work estimates. Existing blocks count toward this total.</p>
            {tasks.length ? (
              tasks.map((t) => (
                <div className="schedule-task" key={t.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(t.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.title}{' '}
                    <small>
                      {t.priority} · {t.due}
                    </small>
                  </label>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const value = new FormData(e.currentTarget).get('minutes');
                      perform(async () => {
                        await updateTask(t.id, {
                          estimatedDuration: value ? Number(value) : null,
                        });
                        setNotice('Duration saved. Generate a new preview to use it.');
                      });
                    }}
                  >
                    <input
                      aria-label={`Minutes for ${t.title}`}
                      name="minutes"
                      type="number"
                      min="1"
                      max="2400"
                      step="1"
                      placeholder="Auto estimate"
                      defaultValue={t.estimatedDuration || ''}
                    />
                    <Button variant="secondary" disabled={busy}>
                      Save minutes
                    </Button>
                  </form>
                </div>
              ))
            ) : (
              <p>
                Create tasks on the <Link to="/app/tasks">Tasks page</Link> first.
              </p>
            )}
          </details>
        </div>
      </div>

      <div className="schedule-planning">
        <div className="schedule-planning-heading">
          <span className="schedule-summary-label">
            <Sparkles size={16} />
            <span>
              <strong>Schedule planning</strong>
              <small>Let AI find the best time for your work</small>
            </span>
          </span>
        </div>
        <div className="schedule-toolbar schedule-planner-toolbar">
          <Field label="Planning period">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Today</option>
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={31}>Next 31 days</option>
            </select>
          </Field>
          <label className="schedule-toggle">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            AI estimates and explanation
          </label>
          <Button
            disabled={busy || !saved || !tasks.length}
            onClick={() =>
              perform(async () => {
                const p = await service.suggest({
                  days,
                  useAi,
                  ...(selected.length ? { taskIds: selected } : {}),
                });
                setPreview(p);
                setParams({ proposal: p._id });
              })
            }
          >
            {busy ? 'Working…' : 'Suggest schedule'}
          </Button>
        </div>
      </div>

      {proposal && (
        <section className="schedule-preview schedule-card">
          <h3>Suggested schedule · {proposal.status}</h3>
          <p>
            {new Set(blocks.map((b) => b.relatedTaskId)).size} tasks ·{' '}
            {Math.round(
              blocks.reduce(
                (sum, b) => sum + (new Date(b.endTime) - new Date(b.startTime)) / 60000,
                0,
              ),
            )}{' '}
            minutes · {previewZone}
          </p>
          <p>{proposal.explanation}</p>
          {proposal.warnings?.map((w, i) => (
            <p className="schedule-warning" key={i}>
              {w}
            </p>
          ))}
          {proposal.estimates?.some((e) => e.source !== 'user') && (
            <p>
              Suggested durations:{' '}
              {proposal.estimates
                .filter((e) => e.source !== 'user')
                .map(
                  (e) =>
                    `${tasks.find((t) => t.id === e.taskId)?.title || 'Task'}: ${e.minutes} min (${e.source})`,
                )
                .join('; ')}
              . Edit task minutes above and regenerate to override.
            </p>
          )}
          {blocks.map((b, i) => (
            <div className="schedule-block-edit" key={i}>
              <Link to={`/app/tasks?task=${b.relatedTaskId}`}>{b.title}</Link>
              <label>
                Start
                <input
                  type="datetime-local"
                  disabled={!pending || busy}
                  value={schedulingLocal(b.startTime, previewZone)}
                  onChange={(e) => editTime(i, 'startTime', e.target.value)}
                />
              </label>
              <label>
                End
                <input
                  type="datetime-local"
                  disabled={!pending || busy}
                  value={schedulingLocal(b.endTime, previewZone)}
                  onChange={(e) => editTime(i, 'endTime', e.target.value)}
                />
              </label>
              {pending && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setBlocks((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {pending ? (
            <div className="schedule-toolbar">
              <Button
                disabled={busy || !blocks.length}
                onClick={() =>
                  perform(async () => {
                    await service.accept(proposal._id, blocks);
                    setPreview(await service.proposal(proposal._id));
                    await loadEvents();
                    setNotice('Schedule accepted. Calendar blocks created.');
                  })
                }
              >
                Accept schedule
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    setPreview(await service.cancel(proposal._id));
                    setNotice('Schedule cancelled. No events created.');
                  })
                }
              >
                Cancel suggestion
              </Button>
              <small>Edit times above before accepting. Preview expires in 24 hours.</small>
            </div>
          ) : (
            <p>
              {proposal.status === 'pending'
                ? 'This preview expired. Generate a new schedule.'
                : `This schedule is ${proposal.status}.`}
            </p>
          )}
        </section>
      )}

      <div className="schedule-card schedule-calendar-card">
        <div className="schedule-card-head">
          <h3>
            <span className="schedule-section-icon">
              <CalendarClock size={16} />
            </span>
            Your scheduled blocks
          </h3>
          <div className="schedule-toolbar compact-toolbar">
            <Button variant="secondary" onClick={() => setDate(schedulingDay(date, -view))}>
              <ChevronLeft size={14} />
              Previous
            </Button>
            <input
              aria-label="Schedule start date"
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
            <Button variant="secondary" onClick={() => setDate(schedulingDay(date, view))}>
              Next
              <ChevronRight size={14} />
            </Button>
            <select
              aria-label="Calendar view"
              value={view}
              onChange={(e) => setView(Number(e.target.value))}
            >
              <option value={1}>Daily view</option>
              <option value={7}>Weekly view</option>
            </select>
            <span className="schedule-zone-label">{zone}</span>
          </div>
        </div>

        <div className={`schedule-agenda ${view === 1 ? 'single-day' : ''}`}>
          {Array.from({ length: view }, (_, i) => schedulingDay(date, i)).map((day) => (
            <section className="schedule-date-card" key={day}>
              <h4>
                <strong>
                  {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </strong>
                <small>
                  {events.filter((b) => schedulingLocal(b.startTime, zone).slice(0, 10) === day)
                    .length
                    ? `${events.filter((b) => schedulingLocal(b.startTime, zone).slice(0, 10) === day).length} block${events.filter((b) => schedulingLocal(b.startTime, zone).slice(0, 10) === day).length === 1 ? '' : 's'}`
                    : 'No blocks'}
                </small>
              </h4>
              {events
                .filter(
                  (b) =>
                    schedulingLocal(b.startTime, zone).slice(0, 10) <= day &&
                    schedulingLocal(new Date(new Date(b.endTime) - 1), zone).slice(0, 10) >= day,
                )
                .map((b) => (
                  <article key={b._id}>
                    <strong>{b.title}</strong>
                    <time>
                      {schedulingLocal(b.startTime, zone).slice(11)} –{' '}
                      {schedulingLocal(b.endTime, zone).slice(11)}
                    </time>
                    <small>
                      {b.type.replace('_', ' ')} · {b.status}
                    </small>
                    {b.relatedTaskId && (
                      <Link to={`/app/tasks?task=${b.relatedTaskId}`}>Open task</Link>
                    )}
                    {b.status === 'planned' && (
                      <div>
                        <button
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await service.change(b._id, 'completed');
                              await Promise.all([reloadTasks(), reloadReminders()]);
                              setSelected((ids) =>
                                ids.filter((id) => id !== String(b.relatedTaskId)),
                              );
                              setPreview(null);
                              window.dispatchEvent(new Event('lifeadmin-briefing-changed'));
                              await loadEvents();
                            })
                          }
                        >
                          {b.relatedTaskId ? 'Complete task' : 'Complete block'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            perform(async () => {
                              await service.change(b._id, 'cancelled');
                              await loadEvents();
                            })
                          }
                        >
                          Cancel block
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              {!events.some((b) => schedulingLocal(b.startTime, zone).slice(0, 10) === day) && (
                <p className="schedule-empty-day">No blocks starting today.</p>
              )}
            </section>
          ))}
        </div>
      </div>

      <div className="schedule-card busyness-card">
        <details>
          <summary>
            <span className="schedule-summary-label">
              <Plus size={16} />
              <span>
                <strong>Add busy time (meeting or personal)</strong>
                <small>Protect time from future suggestions</small>
              </span>
            </span>
          </summary>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                fields = new FormData(form);
              perform(async () => {
                await service.create({
                  title: fields.get('title'),
                  type: fields.get('type'),
                  startTime: schedulingInstant(fields.get('start'), zone),
                  endTime: schedulingInstant(fields.get('end'), zone),
                });
                form.reset();
                await loadEvents();
                setNotice('Busy time added. Future suggestions will avoid it.');
              });
            }}
          >
            <Field label="Title">
              <input name="title" maxLength="200" required />
            </Field>
            <Field label="Type">
              <select name="type">
                <option value="meeting">Meeting</option>
                <option value="personal">Personal</option>
              </select>
            </Field>
            <Field label={`Start (${zone})`}>
              <input name="start" type="datetime-local" required />
            </Field>
            <Field label={`End (${zone})`}>
              <input name="end" type="datetime-local" required />
            </Field>
            <Button disabled={busy || !saved}>Add busy time</Button>
          </form>
        </details>
      </div>
    </section>
  );
}
