import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import User from '../models/User.js';

const EMAILS = ['integration-a@lifeadmin.local', 'integration-b@lifeadmin.local', 'integration-empty@lifeadmin.local'];
const PASSWORD = 'IntegrationTest123';
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(69, '.')} PASS`); };
const shift = (days, hours = 12) => { const date = new Date(); date.setHours(hours, 0, 0, 0); date.setDate(date.getDate() + days); return date; };

async function run() {
  let server; let userIds = [];
  try {
    await connectDB();
    const old = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = old.map((user) => user._id);
    if (oldIds.length) await Promise.all([Document.deleteMany({ userId: { $in: oldIds } }), Task.deleteMany({ userId: { $in: oldIds } }), Reminder.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, method = 'GET', body } = {}) => { const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
    const register = async (name, email) => (await request('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } })).body;
    const [a, b, fresh] = await Promise.all([register('Integration A', EMAILS[0]), register('Integration B', EMAILS[1]), register('Integration Empty', EMAILS[2])]);
    userIds = [a.user._id, b.user._id, fresh.user._id];
    const emptyDashboard = await request('/api/dashboard', { token: fresh.token });
    check(emptyDashboard.status === 200 && Object.values(emptyDashboard.body.counts).every((value) => value === 0), '1. New user dashboard data returns zero counts');

    const doc = await Document.create({ userId: a.user._id, title: 'Real assignment', sourceType: 'text', category: 'university_notice', extractedText: 'Real content' });
    const unrelatedDoc = await Document.create({ userId: a.user._id, title: 'Unrelated document', sourceType: 'text', category: 'other' });
    await Document.create({ userId: b.user._id, title: 'Private second-user document', sourceType: 'text', category: 'other' });
    const [overdue, today, override, completed, cancelled, noDate, linked] = await Task.create([
      { userId: a.user._id, documentId: doc._id, title: 'Overdue high', description: '', status: 'pending', dueDate: shift(-2), priorityOverride: 'high', source: 'manual' },
      { userId: a.user._id, title: 'Due today', description: '', status: 'in_progress', dueDate: shift(0), source: 'manual' },
      { userId: a.user._id, title: 'Override high', description: '', status: 'pending', dueDate: shift(20), priorityOverride: 'high', calculatedPriority: 'low', source: 'manual' },
      { userId: a.user._id, title: 'Completed private work', description: '', status: 'completed', dueDate: shift(3), priorityOverride: 'high', source: 'manual' },
      { userId: a.user._id, title: 'Cancelled private work', description: '', status: 'cancelled', dueDate: shift(4), priorityOverride: 'high', source: 'manual' },
      { userId: a.user._id, title: 'No date task', description: '', status: 'pending', dueDate: null, source: 'manual' },
      { userId: a.user._id, documentId: doc._id, title: 'Linked calendar task', description: '', status: 'pending', dueDate: shift(8), source: 'manual' },
    ]);
    const otherTask = await Task.create({ userId: b.user._id, title: 'Other user calendar task', description: '', status: 'pending', dueDate: shift(5), source: 'manual' });
    const activeReminder = await Reminder.create({ userId: a.user._id, taskId: linked._id, documentId: doc._id, title: 'Active linked reminder', remindAt: shift(6, 18), status: 'active', source: 'task' });
    const standalone = await Reminder.create({ userId: a.user._id, title: 'Standalone reminder', remindAt: shift(7, 9), status: 'active', source: 'manual' });
    await Reminder.create([{ userId: a.user._id, title: 'Dismissed reminder', remindAt: shift(5), status: 'dismissed' }, { userId: a.user._id, title: 'Cancelled reminder', remindAt: shift(5), status: 'cancelled' }, { userId: b.user._id, taskId: otherTask._id, title: 'Other user reminder', remindAt: shift(5), status: 'active' }]);

    let dashboard = await request('/api/dashboard', { token: a.token });
    check(dashboard.body.counts.documents === 2 && dashboard.body.counts.openTasks === 5 && dashboard.body.counts.upcomingReminders === 2, '2. Populated dashboard returns correct real counts');
    check(dashboard.body.counts.openTasks === 5, '3. Open task count excludes completed tasks');
    check(!dashboard.body.todaysFocus.some((task) => task.status === 'cancelled'), '4. Open task count excludes cancelled tasks');
    check(dashboard.body.counts.highPriority === 3, '5. High-priority count uses effective priority');
    check(dashboard.body.todaysFocus.some((task) => String(task._id) === String(override._id) && task.priority === 'high'), '6. Priority override affects high-priority dashboard count');
    check(!dashboard.body.upcomingReminders.some((item) => item.status === 'dismissed'), '7. Upcoming count excludes dismissed reminders');
    check(!dashboard.body.upcomingReminders.some((item) => item.status === 'cancelled'), '8. Upcoming count excludes cancelled reminders');
    check(dashboard.body.todaysFocus.some((task) => String(task._id) === String(overdue._id)), "9. Today's Focus includes overdue task");
    check(dashboard.body.todaysFocus.some((task) => String(task._id) === String(today._id)), "10. Today's Focus includes due-today task");
    check(!dashboard.body.todaysFocus.some((task) => String(task._id) === String(completed._id)), "11. Today's Focus excludes completed task");
    check(dashboard.body.todaysFocus[0].title === 'Overdue high' && dashboard.body.todaysFocus[1].title === 'Due today', "12. Today's Focus ordering is deterministic");
    check(dashboard.body.recentDocuments.length === 2 && dashboard.body.recentDocuments.every((item) => String(item.userId || a.user._id) !== String(b.user._id)), '13. Recent Documents returns only current user documents');

    const start = shift(-10, 0).toISOString(); const end = shift(40, 23).toISOString();
    const calendarPath = `/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    let calendar = await request(calendarPath, { token: a.token });
    check(calendar.body.events.some((event) => event.taskId === String(linked._id)), '14. Calendar includes task with valid dueDate');
    check(!calendar.body.events.some((event) => event.taskId === String(noDate._id)), '15. Calendar excludes task with no dueDate');
    check(calendar.body.events.some((event) => event.reminderId === String(activeReminder._id)), '16. Calendar includes active reminder');
    check(!calendar.body.events.some((event) => event.title === 'Cancelled reminder'), '17. Calendar excludes cancelled reminder');
    check(!calendar.body.events.some((event) => event.taskId === String(otherTask._id)), "18. Calendar excludes another user's task");
    check(!calendar.body.events.some((event) => event.title === 'Other user reminder'), "19. Calendar excludes another user's reminder");
    const narrow = await request(`/api/calendar?start=${encodeURIComponent(shift(5, 0).toISOString())}&end=${encodeURIComponent(shift(7, 0).toISOString())}`, { token: a.token });
    check(narrow.body.events.every((event) => new Date(event.date) >= shift(5, 0) && new Date(event.date) < shift(7, 0)), '20. Calendar range returns only requested items');
    check((await request('/api/calendar?start=bad&end=also-bad', { token: a.token })).status === 400, '21. Invalid calendar range is rejected safely');

    const updatedTask = await request(`/api/tasks/${linked._id}`, { token: a.token, method: 'PATCH', body: { dueDate: shift(9).toISOString() } });
    calendar = await request(calendarPath, { token: a.token });
    const updatedEvent = calendar.body.events.find((event) => event.type === 'task' && event.taskId === String(linked._id));
    check(updatedTask.status === 200 && new Date(updatedEvent?.date).getTime() === new Date(updatedTask.body.task.dueDate).getTime(), '22. Task update appears in dashboard/calendar response');
    await request(`/api/tasks/${today._id}`, { token: a.token, method: 'PATCH', body: { status: 'completed' } });
    dashboard = await request('/api/dashboard', { token: a.token });
    check(dashboard.body.counts.openTasks === 4 && !dashboard.body.todaysFocus.some((task) => String(task._id) === String(today._id)), '23. Task completion updates dashboard counts');
    await request(`/api/tasks/${cancelled._id}`, { token: a.token, method: 'DELETE' });
    calendar = await request(calendarPath, { token: a.token });
    check(!calendar.body.events.some((event) => event.taskId === String(cancelled._id)), '24. Task deletion removes calendar event');
    await request(`/api/reminders/${standalone._id}`, { token: a.token, method: 'DELETE' });
    calendar = await request(calendarPath, { token: a.token });
    check(!calendar.body.events.some((event) => event.reminderId === String(standalone._id)), '25. Reminder deletion removes calendar event');
    const surviving = await Reminder.create({ userId: a.user._id, title: 'Survives unrelated deletion', remindAt: shift(10), status: 'active' });
    await request(`/api/documents/${doc._id}`, { token: a.token, method: 'DELETE' });
    calendar = await request(calendarPath, { token: a.token });
    check(!calendar.body.events.some((event) => event.documentId === String(doc._id)), '26. Document cascade removes linked task/reminder events');
    check(calendar.body.events.some((event) => event.reminderId === String(surviving._id)), '27. Standalone reminder survives unrelated document deletion');
    const secondDashboard = await request('/api/dashboard', { token: b.token });
    check(secondDashboard.body.counts.documents === 1 && !secondDashboard.body.recentDocuments.some((item) => item.title === unrelatedDoc.title), "28. Second user cannot access first user's dashboard data");
    const secondCalendar = await request(calendarPath, { token: b.token });
    check(secondCalendar.body.events.every((event) => event.title.startsWith('Other user')), "29. Second user cannot access first user's calendar events");
    check(!JSON.stringify({ dashboard: secondDashboard.body, calendar: secondCalendar.body }).includes('task-1'), '30. Integration endpoints return no mock records');
    console.log('Feature 19 integration verification completed successfully.');
  } catch (error) { console.error(`Feature 19 integration verification failed: ${error.message}`); process.exitCode = 1; }
  finally { if (server) await new Promise((resolve) => server.close(resolve)); if (userIds.length) await Promise.all([Document.deleteMany({ userId: { $in: userIds } }), Task.deleteMany({ userId: { $in: userIds } }), Reminder.deleteMany({ userId: { $in: userIds } }), User.deleteMany({ _id: { $in: userIds } })]); if (mongoose.connection.readyState) await mongoose.connection.close(); }
}
run();
