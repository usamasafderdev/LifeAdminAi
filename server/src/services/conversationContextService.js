import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import { applyTaskPriority } from './taskPriorityService.js';

const DATE_PATTERN = /\b(?:20\d{2}-\d{1,2}-\d{1,2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?)\b/gi;
const CONTEXT_REFERENCE = /\b(?:this|that|these|those|it|them|one|ones|previous|mentioned|above|the)\b/i;

function uniqueIds(history, type) {
  const seen = new Set(); const ids = [];
  for (const message of history) for (const item of message.sources || []) if (item.type === type && item.sourceId && !seen.has(String(item.sourceId))) { seen.add(String(item.sourceId)); ids.push(item.sourceId); }
  return ids;
}

function inferIntent(history) {
  const content = String([...history].reverse().find((item) => item.role === 'user')?.content || '').toLowerCase();
  if (/open|navigate|take me|go to|view/.test(content)) return 'navigation_request';
  if (/reminder/.test(content)) return 'reminder_query';
  if (/document|assignment|pdf|report|file/.test(content)) return 'document_query';
  if (/task|due|deadline|focus|need to do|have to do/.test(content)) return 'task_query';
  return '';
}

export function usesConversationContext(message) {
  return CONTEXT_REFERENCE.test(String(message || '')) || /\b(?:which|where)\s+(?:one|did)\b/i.test(String(message || ''));
}

export async function buildConversationContext({ userId, history = [], now = new Date() }) {
  const bounded = history.slice(-8);
  const [documents, rawTasks, reminders] = await Promise.all([
    Document.find({ userId, _id: { $in: uniqueIds(bounded, 'document') } }).select('title').lean(),
    Task.find({ userId, _id: { $in: uniqueIds(bounded, 'task') } }).select('title priority priorityOverride calculatedPriority priorityScore dueDate status documentId').lean(),
    Reminder.find({ userId, _id: { $in: uniqueIds(bounded, 'reminder') } }).select('title remindAt status').lean(),
  ]);
  const tasks = rawTasks.map((task) => applyTaskPriority(task, { now }));
  const mentionedDates = [...new Set(bounded.flatMap((item) => String(item.content || '').match(DATE_PATTERN) || []).map((item) => item.toLowerCase()))].slice(-5);
  return { documents, tasks, reminders, mentionedDates, lastIntent: inferIntent(bounded) };
}

export function preferredResourceType(context) {
  return context.lastIntent === 'task_query' ? 'task' : context.lastIntent === 'document_query' ? 'document' : context.lastIntent === 'reminder_query' ? 'reminder' : null;
}

export function contextForPrompt(context) {
  return [
    `Documents: ${context.documents.map((item) => item.title).join('; ') || 'None'}`,
    `Tasks: ${context.tasks.map((item) => `${item.title} | priority=${item.priority} | due=${item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : 'none'} | status=${item.status}`).join('; ') || 'None'}`,
    `Reminders: ${context.reminders.map((item) => `${item.title} | date=${item.remindAt ? new Date(item.remindAt).toISOString() : 'none'}`).join('; ') || 'None'}`,
    `Mentioned dates: ${context.mentionedDates.join('; ') || 'None'}`,
    `Last user intent: ${context.lastIntent || 'unknown'}`,
  ].join('\n').slice(0, 6000);
}

export function contextLabels(context) {
  return [...context.documents.map((item) => `Document: ${item.title}`), ...context.tasks.map((item) => `Task: ${item.title}`), ...context.reminders.map((item) => `Reminder: ${item.title}`)].slice(0, 5);
}

export function verifiedContextSources(context) {
  return [
    ...context.documents.map((item) => ({ type: 'document', sourceId: item._id, label: item.title, detail: 'Conversation context' })),
    ...context.tasks.map((item) => ({ type: 'task', sourceId: item._id, label: item.title, detail: `${item.priority} priority` })),
    ...context.reminders.map((item) => ({ type: 'reminder', sourceId: item._id, label: item.title, detail: 'Conversation context' })),
  ];
}
