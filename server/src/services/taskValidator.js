import { TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';

export class TaskValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskValidationError';
    this.code = 'INVALID_TASK_DATA';
    this.statusCode = 400;
  }
}

function cleanString(value, field, maximum, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') throw new TaskValidationError(`${field} must be a string`);
  const cleaned = value.replace(/\0/g, '').trim();
  if (required && !cleaned) throw new TaskValidationError(`${field} is required`);
  if (cleaned.length > maximum) throw new TaskValidationError(`${field} cannot exceed ${maximum} characters`);
  return cleaned;
}

function parseDueDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) throw new TaskValidationError('dueDate must be a valid date');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TaskValidationError('dueDate must be a valid date');
  return date;
}

export function validateTaskInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TaskValidationError('Task data is required');
  const values = {};
  if (!partial || Object.hasOwn(input, 'title')) values.title = cleanString(input.title, 'title', 200, { required: true });
  if (!partial || Object.hasOwn(input, 'description')) values.description = cleanString(input.description ?? '', 'description', 2000) ?? '';
  if (!partial || Object.hasOwn(input, 'priority')) {
    const priority = input.priority ?? 'medium';
    if (typeof priority !== 'string' || !TASK_PRIORITIES.includes(priority)) throw new TaskValidationError('Invalid task priority');
    values.priority = priority;
  }
  if (!partial || Object.hasOwn(input, 'status')) {
    const status = input.status ?? 'pending';
    if (typeof status !== 'string' || !TASK_STATUSES.includes(status)) throw new TaskValidationError('Invalid task status');
    values.status = status;
  }
  if (!partial || Object.hasOwn(input, 'dueDate')) values.dueDate = parseDueDate(input.dueDate);
  return values;
}
