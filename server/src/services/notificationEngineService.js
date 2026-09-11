import Notification from '../models/Notification.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import CalendarEvent from '../models/CalendarEvent.js';
import { calendarService } from './calendarService.js';
import { buildSchedule } from './schedulingService.js';
import { taskDateKey } from './taskDeadlineService.js';
import { localDate, addDays, wallTime } from './schedulingTimeService.js';
import {
  getNotificationSettings,
  createNotification,
  notificationFingerprint,
  retireResolvedNotifications,
} from './notificationService.js';

export function taskNotificationCandidate(task, today) {
  if (!['pending', 'in_progress'].includes(task.status)) return null;
  const due = taskDateKey(task.dueDate);
  if (!due || due > addDays(today, 1)) return null;
  return {
    type: due < today ? 'overdue_task' : 'deadline_approaching',
    phase: due < today ? 'overdue' : due === today ? 'today' : 'tomorrow',
    resourceId: String(task._id),
    relatedTaskId: task._id,
    occurrence: due,
  };
}

export async function checkUserNotifications(
  userId,
  { now = new Date(), explain, heartbeat = async () => true } = {},
) {
  const settings = await getNotificationSettings(userId);
  if (!settings.enabled) return { created: 0, examined: 0 };
  const profile = await calendarService.availability(userId);
  const timezone = profile?.timezone || settings.timezone;
  const today = localDate(now, timezone);
  const live = new Set();
  const scannedTypes = [];
  if (settings.tasks) scannedTypes.push('overdue_task', 'deadline_approaching');
  if (settings.reminders) scannedTypes.push('reminder_due');
  if (settings.documents) scannedTypes.push('document_action');
  if (settings.aiSuggestions) scannedTypes.push('ai_suggestion');
  let created = 0,
    examined = 0,
    urgent = 0,
    batch = [];
  const flush = async () => {
    if (!batch.length) return;
    if (!(await heartbeat())) throw new Error('Notification worker lease lost');
    const latest = await getNotificationSettings(userId);
    if (!latest.enabled || latest.version !== settings.version) {
      batch = [];
      return;
    }
    const existing = new Set(
      (
        await Notification.find({
          userId,
          fingerprint: { $in: batch.map(notificationFingerprint) },
        })
          .select('fingerprint')
          .lean()
      ).map((n) => n.fingerprint),
    );
    for (const candidate of batch) {
      if (existing.has(notificationFingerprint(candidate))) continue;
      try {
        const result = await createNotification(userId, candidate, { settings, explain, now });
        if (result) created++;
      } catch (error) {
        // A resource can disappear while the background cursor is running.
        if (error.statusCode !== 404) throw error;
      }
    }
    batch = [];
  };
  const add = async (candidate) => {
    examined++;
    if (candidate) {
      batch.push(candidate);
      live.add(notificationFingerprint(candidate));
    }
    if (batch.length >= 100) await flush();
  };
  if (settings.tasks || settings.aiSuggestions) {
    for await (const task of Task.find({
      userId,
      status: { $in: ['pending', 'in_progress'] },
      dueDate: { $ne: null, $lt: new Date(`${addDays(today, 2)}T00:00:00Z`) },
    })
      .select('status dueDate')
      .lean()
      .cursor({ batchSize: 100 })) {
      const candidate = taskNotificationCandidate(task, today);
      if (candidate) urgent++;
      if (settings.tasks) await add(candidate);
    }
  }
  if (settings.reminders) {
    // One catch-up day covers restarts without replaying ancient reminders.
    for await (const reminder of Reminder.find({
      userId,
      status: 'active',
      remindAt: { $gte: new Date(+now - 86400000), $lte: new Date(+now + 15 * 60000) },
    })
      .select('remindAt')
      .lean()
      .cursor({ batchSize: 100 })) {
      await add({
        type: 'reminder_due',
        relatedReminderId: reminder._id,
        resourceId: String(reminder._id),
        occurrence: reminder.remindAt.toISOString(),
      });
    }
  }
  if (settings.documents) {
    for await (const doc of Document.find({
      userId,
      'aiAnalysis.status': 'completed',
      'aiAnalysis.reviewStatus': 'confirmed',
      'aiAnalysis.confirmedAnalysis.actionRequired': true,
    })
      .select('aiAnalysis.reviewedAt')
      .lean()
      .cursor({ batchSize: 100 })) {
      await add({
        type: 'document_action',
        relatedDocumentId: doc._id,
        resourceId: String(doc._id),
        occurrence: doc.aiAnalysis.reviewedAt?.toISOString() || 'confirmed',
      });
    }
  }
  await flush();
  if (settings.schedule && profile) {
    const end = wallTime(addDays(today, 7), '00:00', timezone);
    // Schedule checks use known duration only, never AI estimates in a background job.
    const taskCursor = Task.find({
      userId,
      status: { $in: ['pending', 'in_progress'] },
      estimatedDuration: { $gt: 0 },
      dueDate: {
        $gte: new Date(`${today}T00:00:00Z`),
        $lt: new Date(`${addDays(today, 7)}T00:00:00Z`),
      },
    })
      .sort({ dueDate: 1, _id: 1 })
      .lean()
      .cursor({ batchSize: 50 });
    if (end) {
      const busy = await calendarService.list(userId, now, end);
      let chunk = [],
        complete = true;
      const processChunk = async (tasks) => {
        if (!tasks.length) return;
        if (!(await heartbeat())) throw new Error('Notification worker lease lost');
        const allocations = await CalendarEvent.find({
          userId,
          relatedTaskId: { $in: tasks.map((t) => t._id) },
          status: { $ne: 'cancelled' },
        })
          .limit(5001)
          .lean();
        if (allocations.length <= 5000) {
          // Per-task feasibility checks avoid mistaking the preview's 100-block cap for a conflict.
          for (const task of tasks) {
            const plan = buildSchedule({ tasks: [task], profile, now, days: 7, busy, allocations });
            const booked = allocations
              .filter((b) => String(b.relatedTaskId) === String(task._id))
              .reduce((sum, b) => sum + (b.endTime - b.startTime) / 60000, 0);
            const suggested = plan.blocks.reduce(
              (sum, b) => sum + (b.endTime - b.startTime) / 60000,
              0,
            );
            if (booked + suggested < task.estimatedDuration)
              await add({
                type: 'schedule_conflict',
                relatedTaskId: task._id,
                resourceId: String(task._id),
                occurrence: `${taskDateKey(task.dueDate)}:${task.estimatedDuration}`,
              });
          }
        } else complete = false;
      };
      try {
        for await (const task of taskCursor) {
          chunk.push(task);
          if (chunk.length === 50) {
            await processChunk(chunk);
            chunk = [];
          }
        }
        await processChunk(chunk);
        if (complete) scannedTypes.push('schedule_conflict');
      } finally {
        await taskCursor.close();
      }
    }
  }
  if (settings.aiSuggestions && urgent >= 3)
    await add({ type: 'ai_suggestion', occurrence: today });
  await flush();
  const latest = await getNotificationSettings(userId);
  if (latest.enabled && latest.version === settings.version && (await heartbeat()))
    await retireResolvedNotifications(userId, live, scannedTypes, now);
  return { created, examined };
}
