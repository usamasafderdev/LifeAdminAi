const ACTIVE_STATUSES = new Set(['pending', 'in_progress']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function taskDateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function localTodayKey(now = new Date()) {
  if (typeof now === 'string' && DATE_KEY.test(now)) return now;
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid current date is required');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(dateKey, days) {
  if (!DATE_KEY.test(dateKey)) throw new TypeError('A valid calendar date is required');
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function summarizeTaskDeadlines(tasks, { today = localTodayKey(), windowDays = 14 } = {}) {
  if (!DATE_KEY.test(today)) throw new TypeError('today must use YYYY-MM-DD');
  const end = addCalendarDays(today, windowDays);
  const active = tasks.filter((task) => ACTIVE_STATUSES.has(task.status));
  const completed = tasks.filter((task) => task.status === 'completed');
  const overdue = active.filter((task) => { const due = taskDateKey(task.dueDate); return due && due < today; });
  const upcoming = active.filter((task) => { const due = taskDateKey(task.dueDate); return due && due >= today && due <= end; });
  const dueToday = upcoming.filter((task) => taskDateKey(task.dueDate) === today);
  const nearestDate = upcoming.map((task) => taskDateKey(task.dueDate)).sort()[0] || null;
  return {
    active,
    completed,
    overdue,
    upcoming,
    dueToday,
    nearestDate,
    progressTotal: active.length + completed.length,
    insight: deadlineInsight({ overdue: overdue.length, upcoming: upcoming.length, dueToday: dueToday.length, nearestDate }),
  };
}

export function deadlineInsight({ overdue, upcoming, dueToday, nearestDate }) {
  const plural = (count, singular, multiple = `${singular}s`) => `${count} ${count === 1 ? singular : multiple}`;
  if (overdue && upcoming) return `${plural(overdue, 'task')} ${overdue === 1 ? 'is' : 'are'} overdue, with ${upcoming} more due within the next 14 days.`;
  if (overdue) return `${plural(overdue, 'task')} ${overdue === 1 ? 'is' : 'are'} overdue and ${overdue === 1 ? 'needs' : 'need'} attention.`;
  if (dueToday && dueToday === upcoming) return `${plural(dueToday, 'task')} ${dueToday === 1 ? 'is' : 'are'} due today.`;
  if (upcoming) {
    const nearest = new Date(`${nearestDate}T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${plural(upcoming, 'task')} ${upcoming === 1 ? 'is' : 'are'} due within the next 14 days. The nearest deadline is ${nearest}.`;
  }
  return 'No deadlines fall within the next 14 days.';
}
