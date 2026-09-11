import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { checkUserNotifications } from './notificationEngineService.js';
import { cleanupOldNotifications } from './notificationService.js';

const LEASE_MS = 120000;
export async function runNotificationTick({
  now = new Date(),
  maxUsers = 100,
  check = checkUserNotifications,
  stopping = () => false,
} = {}) {
  let processed = 0,
    failures = 0;
  for (; processed < maxUsers && !stopping(); processed++) {
    const token = randomUUID();
    const user = await User.findOneAndUpdate(
      {
        'notificationSettings.enabled': { $ne: false },
        $and: [
          {
            $or: [
              { 'notificationJob.nextCheckAt': { $lte: now } },
              { 'notificationJob.nextCheckAt': { $exists: false } },
            ],
          },
          {
            $or: [
              { 'notificationJob.leaseUntil': { $lte: now } },
              { 'notificationJob.leaseUntil': null },
            ],
          },
        ],
      },
      {
        $set: {
          'notificationJob.leaseToken': token,
          'notificationJob.leaseUntil': new Date(+now + LEASE_MS),
        },
      },
      { new: true, sort: { 'notificationJob.nextCheckAt': 1, _id: 1 } },
    ).select('_id notificationSettings.version');
    if (!user) break;
    const owner = { _id: user._id, 'notificationJob.leaseToken': token };
    try {
      await check(user._id, {
        now,
        heartbeat: async () => {
          if (stopping()) return false;
          const result = await User.updateOne(owner, {
            $set: { 'notificationJob.leaseUntil': new Date(Date.now() + LEASE_MS) },
          });
          return result.matchedCount === 1;
        },
      });
    } catch {
      failures++;
      // Do not log user IDs, titles, content or provider errors containing user data.
      console.error('A notification check failed; it will retry on the next cycle.');
    } finally {
      await User.updateOne(owner, {
        $set: {
          'notificationJob.leaseToken': null,
          'notificationJob.leaseUntil': null,
          'notificationJob.nextCheckAt': new Date(+now + 60000),
        },
      });
    }
  }
  await cleanupOldNotifications({ now });
  return { processed, failures };
}

let timer = null,
  active = null,
  stopped = true;
export async function startNotificationScheduler() {
  if (!stopped || process.env.NOTIFICATIONS_WORKER_ENABLED === 'false') return;
  await Notification.init(); // Unique index must exist before any worker publishes.
  stopped = false;
  const configured = Number(process.env.NOTIFICATIONS_INTERVAL_MS) || 60000;
  const interval = Math.max(10000, Math.min(configured, 3600000));
  const tick = () => {
    if (stopped) return;
    active = runNotificationTick({ stopping: () => stopped })
      .catch(() => console.error('Notification worker unavailable; retrying.'))
      .finally(() => {
        active = null;
        if (!stopped) {
          timer = setTimeout(tick, interval);
          timer.unref();
        }
      });
  };
  timer = setTimeout(tick, 1000);
  timer.unref();
}
export async function stopNotificationScheduler() {
  stopped = true;
  if (timer) clearTimeout(timer);
  await active;
}
