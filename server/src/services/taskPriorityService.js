import { TASK_PRIORITIES } from '../models/Task.js';

export const PRIORITY_THRESHOLDS = Object.freeze({ high: 60, medium: 30 });
export const DUE_DATE_SCORES = Object.freeze({ overdue: 70, today: 65, oneDay: 55, threeDays: 45, sevenDays: 30, fourteenDays: 15, later: 5, none: 0 });
export const IMPORTANCE_SCORES = Object.freeze({ high: 25, medium: 12, low: 0 });

function calendarDayNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const stamp = Date.UTC(year, month - 1, day);
      const parsed = new Date(stamp);
      if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) return stamp / 86400000;
      return null;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
}

function dueDateResult(dueDate, now) {
  const dueDay = calendarDayNumber(dueDate);
  const today = calendarDayNumber(now);
  if (dueDay === null || today === null) return { points: 0, reason: 'No valid due date' };
  const days = dueDay - today;
  if (days < 0) return { points: DUE_DATE_SCORES.overdue, reason: 'Task is overdue' };
  if (days === 0) return { points: DUE_DATE_SCORES.today, reason: 'Task is due today' };
  if (days === 1) return { points: DUE_DATE_SCORES.oneDay, reason: 'Task is due tomorrow' };
  if (days <= 3) return { points: DUE_DATE_SCORES.threeDays, reason: `Task is due in ${days} days` };
  if (days <= 7) return { points: DUE_DATE_SCORES.sevenDays, reason: `Task is due within 7 days` };
  if (days <= 14) return { points: DUE_DATE_SCORES.fourteenDays, reason: 'Task is due within 14 days' };
  return { points: DUE_DATE_SCORES.later, reason: 'Task is due more than 14 days from now' };
}

function normalizedImportance(value) {
  return typeof value === 'string' && TASK_PRIORITIES.includes(value.toLowerCase()) ? value.toLowerCase() : 'low';
}

export function calculateTaskPriority({ dueDate, confirmedPriority, status = 'pending', now = new Date() } = {}) {
  if (['completed', 'cancelled'].includes(status)) {
    return { score: 0, priority: 'low', reasons: [`Task is ${status} and is not prioritized as active work`] };
  }
  const due = dueDateResult(dueDate, now);
  const importance = normalizedImportance(confirmedPriority);
  const importancePoints = IMPORTANCE_SCORES[importance];
  const score = Math.max(0, Math.min(100, due.points + importancePoints));
  const priority = score >= PRIORITY_THRESHOLDS.high ? 'high' : score >= PRIORITY_THRESHOLDS.medium ? 'medium' : 'low';
  const reasons = [due.reason];
  if (importancePoints > 0) reasons.push(`Confirmed importance is ${importance}`);
  return { score, priority, reasons };
}

export function applyTaskPriority(taskData, { now = new Date() } = {}) {
  const automatic = calculateTaskPriority({ dueDate: taskData.dueDate, confirmedPriority: taskData.confirmedPriority, status: taskData.status, now });
  const override = TASK_PRIORITIES.includes(taskData.priorityOverride) ? taskData.priorityOverride : null;
  return {
    ...taskData,
    calculatedPriority: automatic.priority,
    priorityScore: automatic.score,
    priorityReasons: automatic.reasons,
    priorityOverride: override,
    priority: override || automatic.priority,
    priorityCalculatedAt: now,
  };
}
