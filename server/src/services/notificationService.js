import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import { validTimezone } from './schedulingTimeService.js';
import { explainNotification } from './notificationAiService.js';
import { taskDateKey } from './taskDeadlineService.js';

export const notificationError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: true,
  tasks: true,
  reminders: true,
  goals: true,
  schedule: true,
  documents: true,
  aiSuggestions: false,
  timezone: 'UTC',
  version: 0,
});
export const NOTIFICATION_CATEGORY = Object.freeze({
  overdue_task: 'tasks',
  deadline_approaching: 'tasks',
  reminder_due: 'reminders',
  goal_progress_warning: 'goals',
  schedule_conflict: 'schedule',
  document_action: 'documents',
  ai_suggestion: 'aiSuggestions',
});
const templates = {
  overdue_task: [
    'Task overdue',
    'A task is overdue. Open it to review the deadline and remaining work.',
    'high',
  ],
  deadline_today: [
    'Task due today',
    'A task is due today. Review the remaining work before the day ends.',
    'high',
  ],
  deadline_tomorrow: [
    'Task due tomorrow',
    'A task is due tomorrow. Consider making time for it today.',
    'medium',
  ],
  reminder_due: [
    'Reminder approaching or due',
    'A reminder is due or within the next 15 minutes. Open it to review the details.',
    'high',
  ],
  schedule_conflict: [
    'Work may not fit before its deadline',
    'The scheduling rules could not fit all estimated work before its deadline. Review availability, duration, or the deadline on Calendar.',
    'high',
  ],
  document_action: [
    'Document needs action',
    'A confirmed document analysis contains actions to review. Open the document for details.',
    'medium',
  ],
  ai_suggestion: [
    'Make a plan for upcoming work',
    'Several tasks need attention. Review your priorities and consider a schedule preview.',
    'low',
  ],
};
export const notificationFingerprint = ({ type, resourceId = '', occurrence, phase = '' }) =>
  createHash('sha256')
    .update(JSON.stringify([type, String(resourceId), String(occurrence), phase]))
    .digest('hex');
const validId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    throw notificationError('Invalid notification or resource ID.');
  return id;
};
const visible = (userId) => ({ userId, deletedAt: null });
const publicFields = '-fingerprint -__v -deletedAt';

export async function getNotificationSettings(userId) {
  const user = await User.findById(userId).select('notificationSettings').lean();
  if (!user) throw notificationError('User not found.', 404);
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...user.notificationSettings, goalsAvailable: false };
}
export async function updateNotificationSettings(userId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length)
    throw notificationError('Provide notification preferences.');
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'timezone') patch[key] = validTimezone(value);
    else if (
      ![
        'enabled',
        'tasks',
        'reminders',
        'goals',
        'schedule',
        'documents',
        'aiSuggestions',
      ].includes(key) ||
      typeof value !== 'boolean'
    )
      throw notificationError('Invalid notification preference.');
    else patch[key] = value;
  }
  const result = await User.updateOne(
    { _id: userId },
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(patch).map(([key, value]) => [`notificationSettings.${key}`, value]),
        ),
        'notificationJob.nextCheckAt': new Date(0),
      },
      $inc: { 'notificationSettings.version': 1 },
    },
  );
  if (!result.matchedCount) throw notificationError('User not found.', 404);
  // Optional AI explanations are removed when consent is withdrawn.
  if (patch.aiSuggestions === false || patch.enabled === false)
    await Notification.updateMany(visible(userId), { $unset: { 'metadata.advice': 1 } });
  return getNotificationSettings(userId);
}

async function validateRelatedResource(userId, candidate) {
  if (candidate.relatedGoalId || candidate.type === 'goal_progress_warning')
    throw notificationError('Goals are not available in this workspace.');
  for (const [field, Model] of [
    ['relatedTaskId', Task],
    ['relatedReminderId', Reminder],
    ['relatedDocumentId', Document],
  ]) {
    if (!candidate[field]) continue;
    const filter = { _id: validId(candidate[field]), userId };
    if (Model === Task) filter.status = { $in: ['pending', 'in_progress'] };
    if (Model === Reminder) filter.status = 'active';
    const resource = await Model.findOne(filter)
      .select(
        'dueDate remindAt aiAnalysis.reviewedAt aiAnalysis.reviewStatus aiAnalysis.confirmedAnalysis.actionRequired',
      )
      .lean();
    if (!resource) throw notificationError('Related resource is unavailable.', 404);
    if (
      Model === Task &&
      !candidate.occurrence.startsWith(taskDateKey(resource.dueDate) || 'no-deadline')
    )
      throw notificationError('Task deadline changed.', 404);
    if (Model === Reminder && candidate.occurrence !== resource.remindAt.toISOString())
      throw notificationError('Reminder time changed.', 404);
    if (
      Model === Document &&
      (resource.aiAnalysis?.reviewStatus !== 'confirmed' ||
        !resource.aiAnalysis?.confirmedAnalysis?.actionRequired)
    )
      throw notificationError('Document no longer needs action.', 404);
  }
  const required = {
    overdue_task: 'relatedTaskId',
    deadline_approaching: 'relatedTaskId',
    reminder_due: 'relatedReminderId',
    schedule_conflict: 'relatedTaskId',
    document_action: 'relatedDocumentId',
  }[candidate.type];
  if (required && !candidate[required]) throw notificationError('A related resource is required.');
}

export async function createNotification(
  userId,
  candidate,
  { settings, explain = explainNotification, now = new Date() } = {},
) {
  const category = NOTIFICATION_CATEGORY[candidate?.type];
  const templateKey =
    candidate?.type === 'deadline_approaching' ? `deadline_${candidate.phase}` : candidate?.type;
  const template = templates[templateKey];
  if (
    !category ||
    !template ||
    typeof candidate.occurrence !== 'string' ||
    candidate.occurrence.length > 150
  )
    throw notificationError('Invalid notification rule result.');
  settings ||= await getNotificationSettings(userId);
  if (!settings.enabled || !settings[category]) return null;
  await validateRelatedResource(userId, candidate);
  const fingerprint = notificationFingerprint(candidate);
  let result;
  try {
    result = await Notification.findOneAndUpdate(
      { userId, fingerprint },
      {
        $setOnInsert: {
          userId,
          fingerprint,
          type: candidate.type,
          title: template[0],
          message: template[1],
          priority: template[2],
          read: false,
          relatedTaskId: candidate.relatedTaskId || null,
          relatedReminderId: candidate.relatedReminderId || null,
          relatedGoalId: candidate.relatedGoalId || null,
          relatedDocumentId: candidate.relatedDocumentId || null,
          metadata: { phase: candidate.phase || '', settingsVersion: settings.version },
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        includeResultMetadata: true,
        timestamps: false,
      },
    );
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
  if (result.lastErrorObject.updatedExisting) return null;
  const notification = result.value;
  // Recheck after the insert so a setting change during a scan cannot publish stale work.
  const current = await getNotificationSettings(userId);
  if (!current.enabled || !current[category] || current.version !== settings.version) {
    await Notification.deleteOne({ _id: notification._id, userId });
    return null;
  }
  if (settings.aiSuggestions && candidate.type === 'ai_suggestion') {
    let advice = '';
    try {
      advice = await explain(candidate.type);
    } catch {
      /* Optional AI cannot interrupt notifications. */
    }
    const latest = await getNotificationSettings(userId);
    if (advice && latest.enabled && latest.aiSuggestions && latest.version === settings.version) {
      // Only service-approved strings may enter persisted notifications, even with custom providers.
      const { NOTIFICATION_ADVICE } = await import('./notificationAiService.js');
      if (NOTIFICATION_ADVICE.includes(advice))
        await Notification.updateOne(
          { _id: notification._id, userId, deletedAt: null },
          { $set: { 'metadata.advice': advice } },
        );
    }
  }
  return notification;
}

export async function getUserNotifications(userId, { before, limit = 20, unread = false } = {}) {
  const size = Number(limit);
  if (!Number.isInteger(size) || size < 1 || size > 50)
    throw notificationError('Page size must be 1–50.');
  const filter = visible(userId);
  if (unread === true || unread === 'true') filter.read = false;
  if (before) {
    if (typeof before !== 'string' || before.length > 512)
      throw notificationError('Invalid notification cursor.');
    let cursor;
    try {
      cursor = JSON.parse(Buffer.from(before, 'base64url').toString());
    } catch {
      throw notificationError('Invalid notification cursor.');
    }
    if (!cursor || typeof cursor !== 'object')
      throw notificationError('Invalid notification cursor.');
    const date = new Date(cursor.createdAt);
    validId(cursor.id);
    if (!Number.isFinite(+date)) throw notificationError('Invalid notification cursor.');
    filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: cursor.id } }];
  }
  const [rows, unreadCount, importantCount, importantNotifications] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(size + 1)
      .select(publicFields)
      .lean(),
    Notification.countDocuments({ ...visible(userId), read: false }),
    Notification.countDocuments({ ...visible(userId), read: false, priority: 'high' }),
    Notification.find({ ...visible(userId), read: false, priority: 'high' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(3)
      .select(publicFields)
      .lean(),
  ]);
  const more = rows.length > size;
  const notifications = rows.slice(0, size);
  const last = notifications.at(-1);
  return {
    notifications,
    unreadCount,
    importantCount,
    importantNotifications,
    nextCursor: more
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last._id })).toString(
          'base64url',
        )
      : null,
  };
}
export async function markAsRead(userId, id) {
  const notification = await Notification.findOneAndUpdate(
    { ...visible(userId), _id: validId(id) },
    { $set: { read: true } },
    { new: true },
  ).select(publicFields);
  if (!notification) throw notificationError('Notification not found.', 404);
  return notification;
}
export async function markAllAsRead(userId) {
  return Notification.updateMany({ ...visible(userId), read: false }, { $set: { read: true } });
}
const erase = (now) => ({
  deletedAt: now,
  read: true,
  title: 'Removed',
  message: 'Removed',
  relatedTaskId: null,
  relatedReminderId: null,
  relatedGoalId: null,
  relatedDocumentId: null,
  metadata: {},
});
export async function deleteNotification(userId, id) {
  const result = await Notification.updateOne(
    { ...visible(userId), _id: validId(id) },
    { $set: erase(new Date()) },
  );
  if (!result.matchedCount) throw notificationError('Notification not found.', 404);
}
export async function cleanupOldNotifications({ now = new Date(), limit = 500 } = {}) {
  const ids = await Notification.find({
    deletedAt: null,
    createdAt: { $lt: new Date(+now - 90 * 86400000) },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  if (ids.length)
    await Notification.updateMany(
      { _id: { $in: ids.map((n) => n._id) }, deletedAt: null },
      { $set: erase(now) },
    );
  return ids.length;
}
export async function retireResolvedNotifications(userId, liveFingerprints, types, now) {
  let ids = [];
  const flush = async () => {
    if (ids.length)
      await Notification.updateMany(
        { userId, _id: { $in: ids }, deletedAt: null },
        { $set: erase(now) },
      );
    ids = [];
  };
  for await (const row of Notification.find({
    userId,
    deletedAt: null,
    type: { $in: types },
    createdAt: { $lte: now },
  })
    .select('fingerprint')
    .lean()
    .cursor({ batchSize: 100 })) {
    if (!liveFingerprints.has(row.fingerprint)) ids.push(row._id);
    if (ids.length === 100) await flush();
  }
  await flush();
}
export async function resolveNotificationResource(userId, id) {
  const row = await Notification.findOne({ ...visible(userId), _id: validId(id) }).lean();
  if (!row) throw notificationError('Notification not found.', 404);
  for (const [field, Model, path, query] of [
    ['relatedTaskId', Task, '/app/tasks', 'task'],
    ['relatedReminderId', Reminder, '/app/reminders', 'reminder'],
    ['relatedDocumentId', Document, '/app/documents', null],
  ]) {
    if (!row[field]) continue;
    validId(row[field]);
    if (!(await Model.exists({ _id: row[field], userId })))
      throw notificationError('The related resource is no longer available.', 404);
    if (row.type === 'schedule_conflict') return '/app/calendar';
    return query ? `${path}?${query}=${row[field]}` : `${path}/${row[field]}`;
  }
  if (row.relatedGoalId) {
    const Goal = mongoose.models.Goal;
    if (!Goal) throw notificationError('Goals are not available in this workspace.', 404);
    validId(row.relatedGoalId);
    if (!(await Goal.exists({ _id: row.relatedGoalId, userId })))
      throw notificationError('The related resource is no longer available.', 404);
    return `/app/goals/${row.relatedGoalId}`;
  }
  if (row.type === 'ai_suggestion') return '/app/calendar';
  throw notificationError('The related resource is no longer available.', 404);
}
