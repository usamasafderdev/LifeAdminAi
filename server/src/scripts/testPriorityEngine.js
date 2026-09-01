import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { applyTaskPriority, calculateTaskPriority } from '../services/taskPriorityService.js';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const EMAILS = ['priority-a@lifeadmin.local', 'priority-b@lifeadmin.local'];
const PASSWORD = 'PriorityEngine123';
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(55, '.')} PASS`); };

async function run() {
  let server;
  let userIds = [];
  try {
    const noDate = calculateTaskPriority({ confirmedPriority: 'low', now: NOW });
    check(noDate.score === 0 && noDate.priority === 'low', '1. No due date and low importance is low');
    const sevenDays = calculateTaskPriority({ dueDate: '2026-09-08', confirmedPriority: 'low', now: NOW });
    check(sevenDays.score === 30 && sevenDays.priority === 'medium', '2. Due within 7 days has deterministic result');
    const threeDays = calculateTaskPriority({ dueDate: '2026-09-04', confirmedPriority: 'low', now: NOW });
    check(threeDays.score === 45 && threeDays.priority === 'medium', '3. Due within 3 days has deterministic result');
    const tomorrow = calculateTaskPriority({ dueDate: '2026-09-02', confirmedPriority: 'medium', now: NOW });
    check(tomorrow.score === 67 && tomorrow.priority === 'high', '4. Due tomorrow with medium importance is high');
    const today = calculateTaskPriority({ dueDate: '2026-09-01', now: NOW });
    check(today.score === 65 && today.priority === 'high', '5. Due today is high');
    const overdue = calculateTaskPriority({ dueDate: '2026-08-31', now: NOW });
    check(overdue.score === 70 && overdue.priority === 'high', '6. Overdue task is high');
    const highImportance = calculateTaskPriority({ confirmedPriority: 'high', now: NOW });
    check(highImportance.score === 25, '7. High confirmed importance adds 25');
    const mediumImportance = calculateTaskPriority({ confirmedPriority: 'medium', now: NOW });
    check(mediumImportance.score === 12, '8. Medium confirmed importance adds 12');
    const maximum = calculateTaskPriority({ dueDate: '2020-01-01', confirmedPriority: 'high', now: NOW });
    check(maximum.score <= 100, '9. Score never exceeds 100');
    check(noDate.score >= 0, '10. Score never drops below 0');
    const invalidDate = calculateTaskPriority({ dueDate: 'not-a-date', confirmedPriority: 'low', now: NOW });
    check(invalidDate.score === 0 && invalidDate.priority === 'low', '11. Invalid date handled safely');
    check(JSON.stringify(calculateTaskPriority({ dueDate: '2026-09-04', confirmedPriority: 'high', now: NOW })) === JSON.stringify(calculateTaskPriority({ dueDate: '2026-09-04', confirmedPriority: 'high', now: NOW })), '12. Identical inputs produce identical output');
    check(calculateTaskPriority({ dueDate: '2020-01-01', status: 'completed', now: NOW }).score === 0, '13. Completed task is not urgent');
    check(calculateTaskPriority({ dueDate: '2020-01-01', status: 'cancelled', now: NOW }).score === 0, '14. Cancelled task is not urgent');
    const overridden = applyTaskPriority({ dueDate: '2026-09-01', status: 'pending', priorityOverride: 'low' }, { now: NOW });
    check(overridden.calculatedPriority === 'high' && overridden.priority === 'low', '15. User override wins');
    const cleared = applyTaskPriority({ ...overridden, priorityOverride: null }, { now: NOW });
    check(cleared.priority === cleared.calculatedPriority && cleared.priority === 'high', '16. Clearing override restores automatic priority');

    await connectDB();
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Promise.all([Task.deleteMany({ userId: { $in: oldIds } }), Document.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    const register = (name, email) => request('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [a, b] = await Promise.all([register('Priority User A', EMAILS[0]), register('Priority User B', EMAILS[1])]);
    userIds = [a.body.user._id, b.body.user._id];
    const future = new Date(); future.setUTCDate(future.getUTCDate() + 14);
    const manual = await request('/api/tasks', { method: 'POST', token: a.body.token, body: { title: 'Automatic priority task', dueDate: future.toISOString().slice(0, 10) } });
    const tomorrowDate = new Date(); tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const recalculated = await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { dueDate: tomorrowDate.toISOString().slice(0, 10) } });
    check(recalculated.body.task.priorityScore > manual.body.task.priorityScore, '17. Updating due date recalculates priority');
    const withOverride = await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { priorityOverride: 'low' } });
    const changedAgain = await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { dueDate: new Date().toISOString().slice(0, 10) } });
    check(withOverride.body.task.priority === 'low' && changedAgain.body.task.priority === 'low' && changedAgain.body.task.calculatedPriority === 'high', '18. Recalculation preserves user override');
    check((await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { priorityScore: 100 } })).status === 400, '19. API cannot set priorityScore');
    check((await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { calculatedPriority: 'high' } })).status === 400, '20. API cannot set calculatedPriority');
    check((await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { priorityReasons: ['Injected'] } })).status === 400, '21. API cannot set priorityReasons');
    check((await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: b.body.token, body: { status: 'completed' } })).status === 404, '22. Cross-user update remains blocked');
    check(manual.status === 201 && typeof manual.body.task.priorityScore === 'number' && manual.body.task.calculatedPriority, '23. Manual task creation uses engine');

    const confirmed = await Document.create({ userId: a.body.user._id, title: 'Priority document', sourceType: 'text', extractedText: 'Text', aiAnalysis: { status: 'completed', summary: 'Raw', category: 'information', model: 'test', analyzedAt: new Date(), reviewStatus: 'confirmed', reviewedAt: new Date(), confirmedBy: a.body.user._id, confirmedAnalysis: { summary: 'Confirmed', category: 'information', importantDates: [], keyInformation: [], risksOrConsequences: [], extractedActions: [{ title: 'Generated priority task', description: '', priority: 'high' }] } } });
    const generated = await request(`/api/documents/${confirmed._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(generated.status === 201 && generated.body.tasks[0].confirmedPriority === 'high' && generated.body.tasks[0].priorityScore === 25 && generated.body.tasks[0].calculatedPriority === 'low', '24. Confirmed task generation uses engine');
    console.log('Deterministic priority engine verification completed successfully.');
  } catch (error) {
    console.error(`Priority engine verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      if (userIds.length) await Promise.all([Task.deleteMany({ userId: { $in: userIds } }), Document.deleteMany({ userId: { $in: userIds } })]);
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
