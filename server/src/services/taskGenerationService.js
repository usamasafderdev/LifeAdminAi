import Task from '../models/Task.js';
import { validateTaskInput } from './taskValidator.js';
import { applyTaskPriority } from './taskPriorityService.js';

function normalizePriority(value) {
  const priority = typeof value === 'string' ? value.trim().toLowerCase() : 'medium';
  return ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
}

function normalizeDueDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function selectedActions(actions, actionIndexes) {
  if (actionIndexes === undefined) return actions;
  if (!Array.isArray(actionIndexes) || actionIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= actions.length)) {
    const error = new Error('Selected task indexes are invalid');
    error.statusCode = 400;
    error.code = 'INVALID_TASK_SELECTION';
    throw error;
  }
  return [...new Set(actionIndexes)].map((index) => actions[index]);
}

export async function generateTasksFromAnalysis(document, userId, { actionIndexes, now = new Date() } = {}) {
  const confirmed = document?.aiAnalysis?.confirmedAnalysis;
  const actions = confirmed?.extractedActions;
  if (document?.aiAnalysis?.reviewStatus !== 'confirmed' || !confirmed || !Array.isArray(actions)) {
    const error = new Error('Document has no confirmed analysis');
    error.statusCode = 400;
    error.code = 'NO_CONFIRMED_ANALYSIS';
    throw error;
  }

  const chosen = selectedActions(actions, actionIndexes);
  const existing = await Task.find({ userId, documentId: document._id }).select('title');
  const knownTitles = new Set(existing.map((task) => task.title.trim().toLocaleLowerCase()));
  const tasks = [];
  let skippedDuplicates = 0;

  for (const action of chosen) {
    const title = typeof action?.title === 'string' ? action.title.replace(/\0/g, '').trim().slice(0, 200) : '';
    if (!title) continue;
    const duplicateKey = title.toLocaleLowerCase();
    if (knownTitles.has(duplicateKey)) {
      skippedDuplicates += 1;
      continue;
    }
    const description = typeof action.description === 'string' ? action.description.replace(/\0/g, '').trim().slice(0, 2000) : '';
    const values = validateTaskInput({
      title,
      description,
      priority: normalizePriority(action.priority),
      status: 'pending',
      dueDate: normalizeDueDate(action.dueDate),
    });
    const confirmedPriority = values.priority;
    delete values.priority;
    tasks.push(applyTaskPriority({ ...values, confirmedPriority, priorityOverride: null, userId, documentId: document._id, source: 'ai_confirmed' }, { now }));
    knownTitles.add(duplicateKey);
  }

  return { tasks, skippedDuplicates };
}
