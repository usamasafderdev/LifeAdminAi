import mongoose from 'mongoose';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import { REMINDER_STATUSES } from '../models/Reminder.js';

const ALLOWED_FIELDS = ['title', 'description', 'remindAt', 'status', 'taskId', 'documentId'];
const invalid = (message) => { const error = new Error(message); error.statusCode = 400; error.code = 'INVALID_REMINDER_DATA'; throw error; };

function cleanString(value, name, max, required = false) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') invalid(`${name} must be a string`);
  const result = value.replace(/\0/g, '').trim();
  if (required && !result) invalid(`${name} is required`);
  if (result.length > max) invalid(`${name} cannot exceed ${max} characters`);
  return result;
}

async function ownedLinks(body, userId, current = {}) {
  const taskValue = Object.hasOwn(body, 'taskId') ? body.taskId : current.taskId;
  let task = null;
  if (taskValue) {
    if (!mongoose.isObjectIdOrHexString(taskValue)) invalid('Invalid task ID');
    task = await Task.findOne({ _id: taskValue, userId }).select('_id documentId title');
    if (!task) { const error = new Error('Linked task not found'); error.statusCode = 404; throw error; }
  }
  const taskWasExplicitlyCleared = Object.hasOwn(body, 'taskId') && !body.taskId;
  const documentValue = Object.hasOwn(body, 'documentId') ? body.documentId : (task?.documentId || (taskWasExplicitlyCleared ? null : current.documentId));
  if (documentValue) {
    if (!mongoose.isObjectIdOrHexString(documentValue)) invalid('Invalid document ID');
    const document = await Document.exists({ _id: documentValue, userId });
    if (!document) { const error = new Error('Linked document not found'); error.statusCode = 404; throw error; }
  }
  return { taskId: task?._id || null, documentId: documentValue || null, source: task ? 'task' : 'manual' };
}

export async function validateReminderInput(input, userId, { partial = false, current = {}, now = new Date() } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.includes(key))) invalid('Reminder ownership and metadata are backend-controlled');
  const values = {};
  if (!partial || Object.hasOwn(body, 'title')) values.title = cleanString(body.title, 'Title', 200, true);
  if (!partial || Object.hasOwn(body, 'description')) values.description = cleanString(body.description ?? '', 'Description', 2000) ?? '';
  if (!partial || Object.hasOwn(body, 'remindAt')) {
    const date = new Date(body.remindAt);
    if (!body.remindAt || !Number.isFinite(date.getTime())) invalid('Reminder date and time are invalid');
    if (!partial && date.getTime() < now.getTime() - 60_000) invalid('New reminders cannot be created in the past');
    values.remindAt = date;
  }
  if (!partial || Object.hasOwn(body, 'status')) {
    const status = body.status ?? 'active';
    if (!REMINDER_STATUSES.includes(status)) invalid('Invalid reminder status');
    values.status = status;
  }
  if (!partial || Object.hasOwn(body, 'taskId') || Object.hasOwn(body, 'documentId')) Object.assign(values, await ownedLinks(body, userId, current));
  return values;
}

export function derivedReminderState(reminder, now = new Date()) {
  if (reminder.status !== 'active') return reminder.status;
  return new Date(reminder.remindAt).getTime() <= now.getTime() ? 'due' : 'upcoming';
}

export function reminderResponse(reminder, now = new Date()) {
  const value = reminder.toObject ? reminder.toObject() : reminder;
  const linkedTask = value.taskId && typeof value.taskId === 'object' && value.taskId.title ? value.taskId : null;
  const linkedDocument = value.documentId && typeof value.documentId === 'object' && value.documentId.title ? value.documentId : null;
  return { ...value, taskId: linkedTask?._id || value.taskId || null, documentId: linkedDocument?._id || value.documentId || null, linkedTask, linkedDocument, derivedState: derivedReminderState(value, now) };
}
