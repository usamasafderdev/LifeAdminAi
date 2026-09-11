import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { getDashboardData, mergeTodaysFocus, reminderDayBounds } from '../services/integrationService.js';

const TODAY = '2026-09-03'; const NOW = new Date('2026-09-03T04:00:00.000Z'); const OFFSET = -300;
const later = new Date('2026-09-03T12:44:00.000Z'); const earlier = new Date('2026-09-03T03:00:00.000Z'); const tomorrow = new Date('2026-09-04T07:00:00.000Z');
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(70, '.')} PASS`); };
const task = (title, dueDate, priority = 'medium', status = 'pending') => ({ _id: title, title, dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null, priority, status, createdAt: NOW });
const reminder = (title, remindAt, status = 'active') => ({ _id: title, title, remindAt, status, createdAt: NOW });
const focus = (tasks = [], reminders = []) => mergeTodaysFocus(tasks, reminders, { today: TODAY, now: NOW, timezoneOffset: OFFSET, limit: 10 });

async function run() {
  let ids = [];
  try {
    check(focus([], [reminder('Later today', later)]).some((item) => item.title === 'Later today'), '1. Reminder later today appears in focus');
    check(!focus([], [reminder('Tomorrow', tomorrow)]).length, '2. Tomorrow reminder is not in focus');
    check(focus([], [reminder('Earlier today', earlier)]).some((item) => item.title === 'Earlier today'), '3. Earlier active reminder remains in focus');
    check(!focus([], [reminder('Dismissed', later, 'dismissed')]).length, '4. Dismissed reminder is excluded');
    check(!focus([], [reminder('Completed', later, 'completed')]).length, '5. Completed reminder is excluded');
    check(!focus([], [reminder('Cancelled', later, 'cancelled')]).length, '6. Cancelled reminder is excluded');
    check(focus([task('Due today', TODAY)]).some((item) => item.title === 'Due today'), '7. Task due today appears');
    check(focus([task('Overdue task', '2026-09-02'), task('Due today', TODAY)])[0].title === 'Overdue task', '8. Overdue task appears first');
    check(focus([task('Future high', '2026-09-10', 'high')]).length === 1, '9. Future high-priority task appears');
    check(focus([task('Future medium', '2026-09-10')], [reminder('Tomorrow', tomorrow)]).length === 0, '10. No eligible items produces empty focus');
    const mixed = focus([task('Overdue task', '2026-09-02'), task('Due today', TODAY), task('Future high', '2026-09-10', 'high')], [reminder('Earlier reminder', earlier), reminder('Later reminder', later)]);
    check(mixed.map((item) => item.title).join('|') === 'Overdue task|Earlier reminder|Due today|Later reminder|Future high', '11. Mixed focus ordering is deterministic');

    await connectDB(); const emails = ['focus-a@lifeadmin.local', 'focus-b@lifeadmin.local']; const old = await User.find({ email: { $in: emails } }).select('_id'); if (old.length) await Promise.all([Task.deleteMany({ userId: { $in: old.map((item) => item._id) } }), Reminder.deleteMany({ userId: { $in: old.map((item) => item._id) } })]); await User.deleteMany({ email: { $in: emails } });
    const [a, b] = await User.create([{ fullName: 'Focus A', email: emails[0], password: 'DashboardFocus123' }, { fullName: 'Focus B', email: emails[1], password: 'DashboardFocus123' }]); ids = [a._id, b._id];
    const dueToday = await Reminder.create({ userId: a._id, title: 'Pay Electricity Bill', remindAt: later, status: 'active' }); await Reminder.create({ userId: a._id, title: 'Tomorrow reminder', remindAt: tomorrow, status: 'active' });
    const [dashboardA, dashboardB] = await Promise.all([getDashboardData(a._id, { now: NOW, today: TODAY, timezoneOffset: OFFSET }), getDashboardData(b._id, { now: NOW, today: TODAY, timezoneOffset: OFFSET })]);
    check(dashboardA.todaysFocus.some((item) => item.type === 'reminder') && dashboardB.todaysFocus.length === 0, '12. Reminder focus remains user-isolated');
    const bounds = reminderDayBounds(TODAY, OFFSET); check(bounds.start.toISOString() === '2026-09-02T19:00:00.000Z' && later >= bounds.start && later < bounds.end, '13. UTC reminder maps to displayed local day safely');
    dueToday.status = 'dismissed'; await dueToday.save(); const refreshed = await getDashboardData(a._id, { now: NOW, today: TODAY, timezoneOffset: OFFSET }); check(!refreshed.todaysFocus.some((item) => String(item._id) === String(dueToday._id)), '14. Dismissal is reflected on Dashboard refresh');
    check(dashboardA.upcomingReminders.some((item) => item.title === 'Tomorrow reminder'), '15. Tomorrow reminder remains in Upcoming Reminders');
    console.log('Dashboard unified focus verification completed successfully.');
  } catch (error) { console.error(`Dashboard focus verification failed: ${error.message}`); process.exitCode = 1; }
  finally { if (ids.length) await Promise.all([Task.deleteMany({ userId: { $in: ids } }), Reminder.deleteMany({ userId: { $in: ids } }), User.deleteMany({ _id: { $in: ids } })]); if (mongoose.connection.readyState) await mongoose.connection.close(); }
}
run();
