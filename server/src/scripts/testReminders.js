import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import { derivedReminderState } from '../services/reminderService.js';

const EMAILS = ['reminder-a@lifeadmin.local', 'reminder-b@lifeadmin.local'];
const PASSWORD = 'ReminderTest123';
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(62, '.')} PASS`); };

async function run() {
  let server; let userIds = [];
  try {
    await connectDB(); await Reminder.init();
    const old = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = old.map((item) => item._id);
    if (oldIds.length) await Promise.all([Reminder.deleteMany({ userId: { $in: oldIds } }), Task.deleteMany({ userId: { $in: oldIds } }), Document.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => { const response = await fetch(`${base}${path}`, { ...options, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null }; };
    const register = (name, email) => request('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [a, b] = await Promise.all([register('Reminder A', EMAILS[0]), register('Reminder B', EMAILS[1])]); userIds = [a.body.user._id, b.body.user._id];
    const future = new Date(Date.now() + 86_400_000).toISOString();
    check((await request('/api/reminders')).status === 401, '2. Authentication required');
    const invalidModel = new Reminder({ userId: a.body.user._id, title: '', remindAt: future });
    check(Boolean(invalidModel.validateSync()), '1. Reminder model validation');
    const standalone = await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Call dentist', remindAt: future } });
    check(standalone.status === 201 && !standalone.body.reminder.taskId, '3. Create standalone reminder');
    const document = await Document.create({ userId: a.body.user._id, title: 'Assignment', sourceType: 'text', extractedText: '' });
    const task = await Task.create({ userId: a.body.user._id, documentId: document._id, title: 'Submit assignment', source: 'manual' });
    const otherTask = await Task.create({ userId: b.body.user._id, title: 'Private task', source: 'manual' });
    const linked = await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Submit assignment', remindAt: future, taskId: task._id } });
    check(linked.status === 201 && linked.body.reminder.linkedTask.title === task.title, '4. Create task-linked reminder');
    check((await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Bad', remindAt: 'not-a-date' } })).status === 400, '5. Invalid date rejected');
    check((await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Unsafe', remindAt: future, taskId: otherTask._id } })).status === 404, '6. Another user task cannot be linked');
    const list = await request('/api/reminders', { token: a.body.token });
    check(list.body.count === 2 && list.body.reminders.every((item) => String(item.userId) === String(a.body.user._id)), '7. GET returns only current user reminders');
    check((await request(`/api/reminders/${linked.body.reminder._id}`, { token: b.body.token })).status === 404, '8. GET single ownership protected');
    const updated = await request(`/api/reminders/${linked.body.reminder._id}`, { method: 'PATCH', token: a.body.token, body: { description: 'Bring final PDF' } });
    check(updated.body.reminder.description === 'Bring final PDF', '9. Update reminder');
    check((await request(`/api/reminders/${linked.body.reminder._id}`, { method: 'PATCH', token: b.body.token, body: { title: 'Hack' } })).status === 404, '11. Cross-user update blocked');
    check((await request(`/api/reminders/${linked.body.reminder._id}`, { method: 'DELETE', token: b.body.token })).status === 404, '12. Cross-user delete blocked');
    const dismissed = await request(`/api/reminders/${linked.body.reminder._id}`, { method: 'PATCH', token: a.body.token, body: { status: 'dismissed' } });
    check(dismissed.body.reminder.derivedState === 'dismissed', '13. Dismiss reminder');
    check(derivedReminderState({ status: 'completed', remindAt: future }) === 'completed', '14. Completed reminder behavior');
    const fixedNow = new Date('2026-09-02T12:00:00Z');
    check(derivedReminderState({ status: 'active', remindAt: '2026-09-03T12:00:00Z' }, fixedNow) === 'upcoming', '15. Upcoming state derived correctly');
    check(derivedReminderState({ status: 'active', remindAt: '2026-09-01T12:00:00Z' }, fixedNow) === 'due', '16. Past/due state derived correctly');
    const linked2 = await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Delete with task', remindAt: future, taskId: task._id } });
    await request(`/api/tasks/${task._id}`, { method: 'DELETE', token: a.body.token });
    check(!(await Reminder.findById(linked2.body.reminder._id)), '17. Task deletion removes linked reminder');
    check(Boolean(await Reminder.findById(standalone.body.reminder._id)), '18. Task deletion preserves standalone reminder');
    const document2 = await Document.create({ userId: a.body.user._id, title: 'Invoice', sourceType: 'text', extractedText: '' });
    const task2 = await Task.create({ userId: a.body.user._id, documentId: document2._id, title: 'Pay invoice', source: 'manual' });
    const documentReminder = await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Pay', remindAt: future, taskId: task2._id } });
    const otherReminder = await request('/api/reminders', { method: 'POST', token: b.body.token, body: { title: 'Other user', remindAt: future, taskId: otherTask._id } });
    await request(`/api/documents/${document2._id}`, { method: 'DELETE', token: a.body.token });
    check(!(await Reminder.findById(documentReminder.body.reminder._id)), '19. Document deletion removes reminders through tasks');
    check(Boolean(await Reminder.findById(otherReminder.body.reminder._id)), '20. Other user reminders remain untouched');
    const completionTask = await Task.create({ userId: a.body.user._id, title: 'Complete me', source: 'manual' });
    const completionReminder = await request('/api/reminders', { method: 'POST', token: a.body.token, body: { title: 'Complete me', remindAt: future, taskId: completionTask._id } });
    await request(`/api/tasks/${completionTask._id}`, { method: 'PATCH', token: a.body.token, body: { status: 'completed' } });
    check((await Reminder.findById(completionReminder.body.reminder._id)).status === 'completed', '21. Task completion completes active reminders');
    check((await request(`/api/reminders/${standalone.body.reminder._id}`, { method: 'PATCH', token: a.body.token, body: { status: 'invalid' } })).status === 400, '22. Invalid status rejected');
    check((await request(`/api/reminders/${standalone.body.reminder._id}`, { method: 'PATCH', token: a.body.token, body: { userId: b.body.user._id } })).status === 400, '23. userId cannot be overwritten');
    check((await request(`/api/reminders/${standalone.body.reminder._id}`, { method: 'PATCH', token: a.body.token, body: { taskId: otherTask._id } })).status === 404, '24. taskId cannot link another user task');
    check((await request(`/api/reminders/${standalone.body.reminder._id}`, { method: 'DELETE', token: a.body.token })).status === 200, '10. Delete reminder');
    console.log('Reminder API verification completed successfully.');
  } catch (error) { console.error(`Reminder API verification failed: ${error.message}`); process.exitCode = 1; }
  finally { if (server) await new Promise((resolve) => server.close(resolve)); if (mongoose.connection.readyState) { if (userIds.length) await Promise.all([Reminder.deleteMany({ userId: { $in: userIds } }), Task.deleteMany({ userId: { $in: userIds } }), Document.deleteMany({ userId: { $in: userIds } })]); await User.deleteMany({ email: { $in: EMAILS } }); await mongoose.connection.close(); } }
}
run();
