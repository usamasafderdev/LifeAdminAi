import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import Notification from '../models/Notification.js';
import AvailabilityProfile from '../models/AvailabilityProfile.js';
import { generateToken } from '../utils/generateToken.js';
import {
  checkUserNotifications,
  taskNotificationCandidate,
} from '../services/notificationEngineService.js';
import {
  runNotificationTick,
  startNotificationScheduler,
  stopNotificationScheduler,
} from '../services/notificationSchedulerService.js';
import {
  createNotification,
  getNotificationSettings,
  updateNotificationSettings,
  cleanupOldNotifications,
  notificationFingerprint,
} from '../services/notificationService.js';
import { explainNotification } from '../services/notificationAiService.js';

let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${++checks}: ${label}`);
};
const now = new Date('2026-09-11T10:00:00Z');
check(
  taskNotificationCandidate({ _id: 't', status: 'pending', dueDate: '2026-09-10' }, '2026-09-11')
    .type === 'overdue_task',
  'Overdue rule uses calendar dates',
);
check(
  !taskNotificationCandidate(
    { _id: 't', status: 'completed', dueDate: '2026-09-10' },
    '2026-09-11',
  ),
  'Completed task is excluded',
);
check(
  (await explainNotification('overdue_task', {
    generate: async () => {
      throw new Error('Offline');
    },
  })) === '',
  'AI provider failure returns deterministic fallback',
);
check(
  (await explainNotification('overdue_task', {
    generate: async () => ({ text: '{"adviceIndex":99}' }),
  })) === '',
  'Out-of-range AI advice is rejected',
);
check(
  (await explainNotification('overdue_task', {
    generate: async () => ({ text: '{"adviceIndex":1}' }),
  })) === 'Consider reserving an available work block on Calendar.',
  'Valid AI output selects only approved advice',
);

const databaseName = `lifeadmin_notifications_test_${randomUUID().replaceAll('-', '')}`;
let server;
try {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([
    Notification.init(),
    User.init(),
    Task.init(),
    Reminder.init(),
    AvailabilityProfile.init(),
    Document.init(),
  ]);
  const users = await User.create([
    {
      fullName: 'Notification User A',
      email: 'notification-a@example.test',
      password: 'NotificationTest123',
    },
    {
      fullName: 'Notification User B',
      email: 'notification-b@example.test',
      password: 'NotificationTest123',
    },
  ]);
  const a = users[0]._id,
    b = users[1]._id;
  process.env.JWT_SECRET ||= 'isolated-notification-test-secret';
  const tokens = users.map((u) => generateToken(u._id));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  const request = async (path = '', { user = 0, method = 'GET', body } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(user === null ? {} : { authorization: `Bearer ${tokens[user]}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };
  const task = await Task.create({
    userId: a,
    title: 'Private medical condition information',
    dueDate: '2026-09-10',
    status: 'pending',
    priorityOverride: 'low',
  });
  const tomorrow = await Task.create({
    userId: a,
    title: 'Submit assignment',
    dueDate: '2026-09-12',
    status: 'pending',
  });
  await Task.create({ userId: a, title: 'Due today', dueDate: '2026-09-11', status: 'pending' });
  await Task.create({ userId: b, title: 'Second user', dueDate: '2026-09-10' });
  const reminder = await Reminder.create({
    userId: a,
    title: 'Reminder details',
    remindAt: new Date(+now + 10 * 60000),
  });
  await checkUserNotifications(a, { now });
  const overdue = await Notification.findOne({ userId: a, type: 'overdue_task' });
  check(overdue.priority === 'high', '1: Overdue task creates high-priority notification');
  check(
    (await Notification.findOne({ userId: a, relatedTaskId: tomorrow._id })).priority === 'medium',
    '2: Tomorrow deadline creates medium notification',
  );
  check(
    (await Notification.countDocuments({ userId: a, type: 'reminder_due' })) === 1,
    'Approaching reminder creates notification',
  );
  check(
    !JSON.stringify(await Notification.find({ userId: a }).lean()).includes(task.title),
    'No sensitive resource titles or content are copied',
  );
  check(
    (await Task.findById(task._id)).priorityOverride === 'low',
    'Notification urgency does not mutate task priority',
  );
  const before = await Notification.countDocuments({ userId: a });
  await Promise.all(Array.from({ length: 10 }, () => checkUserNotifications(a, { now })));
  check(
    (await Notification.countDocuments({ userId: a })) === before,
    '3: Ten concurrent checks produce no duplicates',
  );
  check((await request('', { user: null })).status === 401, 'JWT required');
  check(
    (await request(`/${overdue._id}/read`, { user: 1, method: 'PATCH' })).status === 404,
    '4: Other user cannot mark notification read',
  );
  check(
    (await request(`/${overdue._id}/resource`, { user: 1 })).status === 404,
    'Other user cannot navigate through notification',
  );
  check(
    (await request(`/${overdue._id}`, { user: 1, method: 'DELETE' })).status === 404,
    'Other user cannot delete notification',
  );
  check(
    (await request(`/${overdue._id}/read`, { method: 'PATCH' })).notification.read,
    '5: Read status persists',
  );
  const resolved = await request(`/${overdue._id}/resource`);
  check(
    resolved.path === `/app/tasks?task=${task._id}`,
    'Task navigation returns an owned internal route',
  );
  const reminderRow = await Notification.findOne({ relatedReminderId: reminder._id });
  check(
    (await request(`/${reminderRow._id}/resource`)).path ===
      `/app/reminders?reminder=${reminder._id}`,
    'Reminder navigation resolves correctly',
  );
  const unreadBefore = (await request()).unreadCount;
  await request(`/${reminderRow._id}/read`, { method: 'PATCH' });
  check(
    (await request()).unreadCount === unreadBefore - 1,
    'Unread count decreases after marking read',
  );
  await request(`/${overdue._id}`, { method: 'DELETE' });
  check(
    !(await request()).notifications.some((n) => n._id === String(overdue._id)),
    '6: Deleted notification disappears from list',
  );
  await checkUserNotifications(a, { now });
  check(
    (await Notification.countDocuments({ userId: a, type: 'overdue_task', deletedAt: null })) === 0,
    'Deleting an alert does not cause it to be recreated',
  );
  check(
    (await request('/settings', { method: 'PATCH', body: { userId: b } })).status === 400,
    'Settings reject ownership injection',
  );
  check(
    (await request('/settings', { method: 'PATCH', body: { timezone: 'Invalid/Zone' } })).status ===
      400,
    'Invalid timezone rejected',
  );
  await request('/settings', { method: 'PATCH', body: { enabled: false } });
  const newTask = await Task.create({ userId: a, title: 'No alert', dueDate: '2026-09-10' });
  await checkUserNotifications(a, { now });
  check(
    !(await Notification.exists({ relatedTaskId: newTask._id })),
    '7: Disabled notifications generate no records',
  );
  await updateNotificationSettings(a, { enabled: true, aiSuggestions: true });
  await checkUserNotifications(a, {
    now,
    explain: async () => {
      throw new Error('Provider unavailable');
    },
  });
  check(
    await Notification.exists({ userId: a, type: 'ai_suggestion' }),
    '8: AI failure preserves useful deterministic suggestion',
  );
  check(
    await Notification.exists({ relatedTaskId: newTask._id }),
    'AI failure does not block required alerts',
  );
  const aiRow = await Notification.findOne({ userId: a, type: 'ai_suggestion' });
  check(!aiRow.metadata.advice, 'Failed AI produces no unverified explanation');
  await request('/read-all', { method: 'PATCH' });
  check((await request()).unreadCount === 0, 'Mark all read works');
  await checkUserNotifications(b, { now });
  check(
    (await request('', { user: 1 })).notifications.every((n) => n.userId === String(b)),
    'Second-user list is isolated',
  );
  check(
    (await request('?limit=1')).notifications.length === 1 &&
      (await request('?limit=1')).nextCursor,
    'List uses bounded cursor pagination',
  );
  const first = await request('?limit=1');
  const next = await request(`?limit=1&before=${first.nextCursor}`);
  check(
    first.notifications[0]._id !== next.notifications[0]._id,
    'Next page does not repeat the previous item',
  );
  check((await request('?before=bnVsbA')).status === 400, 'Malformed cursors fail safely');
  check((await request('/not-an-id/resource')).status === 400, 'Malformed IDs rejected');
  const forged = await Notification.create({
    userId: a,
    type: 'deadline_approaching',
    title: 'Test fixture',
    message: 'Test fixture',
    priority: 'medium',
    fingerprint: 'forged-test',
    relatedTaskId: (await Task.findOne({ userId: b }))._id,
  });
  check(
    (await request(`/${forged._id}/resource`)).status === 404,
    'Navigation verifies resource ownership even for corrupted records',
  );
  const doc = await Document.create({
    userId: a,
    title: 'Confidential document',
    sourceType: 'text',
    aiAnalysis: {
      status: 'completed',
      reviewStatus: 'confirmed',
      reviewedAt: now,
      confirmedAnalysis: { actionRequired: true },
    },
  });
  await checkUserNotifications(a, { now });
  const docRow = await Notification.findOne({ userId: a, relatedDocumentId: doc._id });
  check(
    docRow && (await request(`/${docRow._id}/resource`)).path === `/app/documents/${doc._id}`,
    'Confirmed actionable document creates navigable alert',
  );
  await Document.deleteOne({ _id: doc._id });
  check(
    (await request(`/${docRow._id}/resource`)).status === 404,
    'Deleted resource produces controlled unavailable result',
  );
  await AvailabilityProfile.create({
    userId: a,
    timezone: 'Asia/Karachi',
    workingDays: [],
    availableTimeRanges: [],
  });
  const impossible = await Task.create({
    userId: a,
    title: 'Cannot fit',
    estimatedDuration: 240,
    dueDate: '2026-09-12',
  });
  await checkUserNotifications(a, { now });
  check(
    await Notification.exists({
      userId: a,
      relatedTaskId: impossible._id,
      type: 'schedule_conflict',
    }),
    'Scheduling engine reports insufficient availability without AI',
  );
  check(
    (await request('/settings')).settings.goalsAvailable === false,
    'Missing goal system is explicitly unavailable',
  );
  const goalNotification = await Notification.create({
    userId: a,
    type: 'goal_progress_warning',
    title: 'Goal warning',
    message: 'A goal is behind progress.',
    priority: 'high',
    relatedGoalId: new mongoose.Types.ObjectId(),
    fingerprint: notificationFingerprint({
      type: 'goal_progress_warning',
      resourceId: 'goal-regression',
      occurrence: '2026-09-11',
      phase: 'regression',
    }),
  });
  check(
    (await request(`/${goalNotification._id}/resource`)).status === 404,
    'Goal resource navigation stays unavailable when the workspace lacks a goal model',
  );
  const retained = await Notification.findOne({ userId: a, deletedAt: null });
  await Notification.collection.updateOne(
    { _id: retained._id },
    { $set: { createdAt: new Date(+now - 100 * 86400000) } },
  );
  await cleanupOldNotifications({ now });
  const tombstone = await Notification.findById(retained._id);
  check(
    tombstone.deletedAt && tombstone.message === 'Removed' && !tombstone.relatedTaskId,
    'Cleanup erases old content but retains duplicate protection',
  );
  await Task.insertMany(
    Array.from({ length: 110 }, (_, i) => ({
      userId: b,
      title: `Bulk task ${i}`,
      dueDate: '2026-09-10',
    })),
  );
  await Reminder.insertMany(
    Array.from({ length: 110 }, (_, i) => ({
      userId: b,
      title: `Bulk reminder ${i}`,
      remindAt: now,
    })),
  );
  await checkUserNotifications(b, { now });
  check(
    (await Notification.countDocuments({ userId: b, type: 'overdue_task' })) === 111 &&
      (await Notification.countDocuments({ userId: b, type: 'reminder_due' })) === 110,
    '100+ tasks and reminders are processed across batches',
  );
  const originalJob = {
    nextCheckAt: new Date(0),
    leaseUntil: new Date(+now - 1),
    leaseToken: 'crashed-worker',
  };
  await User.updateMany({}, { $set: { notificationJob: originalJob } });
  let calls = 0;
  const job = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const ticks = await Promise.all([
    runNotificationTick({ now, check: job }),
    runNotificationTick({ now, check: job }),
  ]);
  check(
    calls === 2 && ticks.reduce((sum, t) => sum + t.processed, 0) === 2,
    'Concurrent workers claim each user once and recover expired leases',
  );
  check(
    (await runNotificationTick({ now, check: job })).processed === 0,
    'Next-check timestamp survives subsequent ticks',
  );
  const staleSettings = await getNotificationSettings(a);
  await updateNotificationSettings(a, { enabled: false });
  const staleTask = await Task.create({ userId: a, title: 'Stale worker', dueDate: '2026-09-10' });
  const candidate = taskNotificationCandidate(staleTask, '2026-09-11');
  await createNotification(a, candidate, { settings: staleSettings, now });
  check(
    !(await Notification.exists({ userId: a, fingerprint: notificationFingerprint(candidate) })),
    'Settings change fences a stale background scan',
  );
  console.log(`Notifications: ${checks} checks passed.`);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState) {
    if (
      mongoose.connection.name === databaseName &&
      /^lifeadmin_notifications_test_[a-f0-9]{32}$/.test(databaseName)
    )
      await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
