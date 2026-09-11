import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import { applyTaskPriority } from './taskPriorityService.js';
import { localTodayKey, summarizeTaskDeadlines, taskDateKey } from './taskDeadlineService.js';

const OPEN_STATUSES = new Set(['pending', 'in_progress']);

function effectiveTask(task, now) {
  const plain = task.toObject ? task.toObject() : task;
  return applyTaskPriority(plain, { now });
}

function taskFocusRank(task, today) {
  const due = taskDateKey(task.dueDate);
  if (due && due < today) return 0;
  if (due === today) return 2;
  if (task.priority === 'high') return 4;
  return 5;
}

export function reminderDayBounds(today, timezoneOffset = 0) {
  const localMidnightAsUtc = Date.parse(`${today}T00:00:00.000Z`);
  const start = new Date(localMidnightAsUtc + timezoneOffset * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function mergeTodaysFocus(tasks, reminders, { today, now, timezoneOffset = 0, limit = 5 }) {
  const day = reminderDayBounds(today, timezoneOffset);
  const taskItems = tasks.filter((task) => {
    const due = taskDateKey(task.dueDate);
    return OPEN_STATUSES.has(task.status) && (task.priority === 'high' || (due && due <= today));
  }).map((task) => ({ ...task, type: 'task', focusRank: taskFocusRank(task, today), focusTime: task.dueDate ? new Date(task.dueDate).getTime() : Number.MAX_SAFE_INTEGER }));
  const reminderItems = reminders.filter((reminder) => reminder.status === 'active' && new Date(reminder.remindAt) >= day.start && new Date(reminder.remindAt) < day.end).map((reminder) => ({ ...reminder, type: 'reminder', focusRank: new Date(reminder.remindAt) <= now ? 1 : 3, focusTime: new Date(reminder.remindAt).getTime() }));
  return [...taskItems, ...reminderItems].sort((a, b) => a.focusRank - b.focusRank || a.focusTime - b.focusTime || new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || String(a._id).localeCompare(String(b._id))).slice(0, limit).map(({ focusRank, focusTime, ...item }) => item);
}

export async function getDashboardData(userId, { now = new Date(), today = localTodayKey(now), timezoneOffset = 0, focusLimit = 5, documentLimit = 5, reminderLimit = 5 } = {}) {
  const day = reminderDayBounds(today, timezoneOffset);
  const [rawTasks, documents, upcomingReminders, todayReminders] = await Promise.all([
    Task.find({ userId }),
    Document.find({ userId }).sort({ updatedAt: -1, createdAt: -1 }).limit(documentLimit)
      .select('title sourceType category aiAnalysis.status generatedTaskCount createdAt updatedAt'),
    Reminder.find({ userId, status: 'active', remindAt: { $gt: now } }).sort({ remindAt: 1, _id: 1 }).limit(reminderLimit)
      .select('title description remindAt status taskId documentId'),
    Reminder.find({ userId, status: 'active', remindAt: { $gte: day.start, $lt: day.end } }).sort({ remindAt: 1, _id: 1 }).lean(),
  ]);
  const tasks = rawTasks.map((task) => effectiveTask(task, now));
  const openTasks = tasks.filter((task) => OPEN_STATUSES.has(task.status));
  const deadlines = summarizeTaskDeadlines(tasks, { today });
  const todaysFocus = mergeTodaysFocus(openTasks, todayReminders, { today, now, timezoneOffset, limit: focusLimit });

  return {
    counts: {
      documents: await Document.countDocuments({ userId }),
      openTasks: openTasks.length,
      highPriority: openTasks.filter((task) => task.priority === 'high').length,
      upcomingDeadlines: deadlines.upcoming.length,
      upcomingReminders: await Reminder.countDocuments({ userId, status: 'active', remindAt: { $gt: now } }),
    },
    deadlineSummary: {
      upcoming: deadlines.upcoming.length,
      overdue: deadlines.overdue.length,
      dueToday: deadlines.dueToday.length,
      nearestDate: deadlines.nearestDate,
      insight: deadlines.insight,
    },
    taskProgress: { total: deadlines.progressTotal, completed: deadlines.completed.length, pending: deadlines.active.length, overdue: deadlines.overdue.length },
    todaysFocus,
    upcomingReminders,
    recentDocuments: documents,
  };
}

export async function getCalendarEvents(userId, { start, end }) {
  const [tasks, reminders] = await Promise.all([
    Task.find({ userId, dueDate: { $ne: null, $gte: start, $lt: end } }).sort({ dueDate: 1, _id: 1 })
      .select('title description status dueDate priority priorityOverride calculatedPriority documentId'),
    Reminder.find({ userId, status: 'active', remindAt: { $gte: start, $lt: end } }).sort({ remindAt: 1, _id: 1 })
      .select('title description status remindAt taskId documentId'),
  ]);
  const now = new Date();
  return [
    ...tasks.map((raw) => {
      const task = effectiveTask(raw, now);
      return { id: String(task._id), type: 'task', title: task.title, description: task.description, date: task.dueDate, status: task.status, priority: task.priority, taskId: String(task._id), documentId: task.documentId ? String(task.documentId) : null };
    }),
    ...reminders.map((reminder) => ({ id: String(reminder._id), type: 'reminder', title: reminder.title, description: reminder.description, date: reminder.remindAt, status: reminder.status, reminderId: String(reminder._id), taskId: reminder.taskId ? String(reminder.taskId) : null, documentId: reminder.documentId ? String(reminder.documentId) : null })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}
