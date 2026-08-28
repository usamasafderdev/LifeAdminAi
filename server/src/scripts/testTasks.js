import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import User from '../models/User.js';

const EMAILS = ['task-a@lifeadmin.local', 'task-b@lifeadmin.local'];
const PASSWORD = 'TaskFeatureTest123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(45, '.')} PASS`);
}

async function run() {
  let server;
  let userIds = [];
  try {
    await connectDB();
    await Task.init();
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Promise.all([Task.deleteMany({ userId: { $in: oldIds } }), Document.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    const register = (name, email) => request('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [a, b] = await Promise.all([register('Task User A', EMAILS[0]), register('Task User B', EMAILS[1])]);
    userIds = [a.body.user._id, b.body.user._id];
    const manualPayload = { title: 'Pay electricity bill', description: 'Pay before the due date', priority: 'high', status: 'pending', dueDate: '2026-09-10' };

    check((await request('/api/tasks')).status === 401 && (await request('/api/tasks', { method: 'POST', body: manualPayload })).status === 401, 'Authentication required');
    const created = await request('/api/tasks', { method: 'POST', token: a.body.token, body: { ...manualPayload, userId: b.body.user._id } });
    check(created.status === 400, 'Frontend userId rejected');
    const manual = await request('/api/tasks', { method: 'POST', token: a.body.token, body: manualPayload });
    check(manual.status === 201 && manual.body.task.source === 'manual' && String(manual.body.task.userId) === String(a.body.user._id), 'User can create task');
    const taskId = manual.body.task._id;

    check((await request(`/api/tasks/${taskId}`, { token: b.body.token })).status === 404, 'Other user cannot access task');
    const updated = await request(`/api/tasks/${taskId}`, { method: 'PATCH', token: a.body.token, body: { status: 'in_progress', title: 'Pay updated bill' } });
    check(updated.status === 200 && updated.body.task.status === 'in_progress' && updated.body.task.title === 'Pay updated bill', 'Task update works');
    check((await request('/api/tasks', { method: 'POST', token: a.body.token, body: { ...manualPayload, priority: 'urgent' } })).status === 400, 'Invalid priority rejected');
    check((await request(`/api/tasks/${taskId}`, { method: 'PATCH', token: a.body.token, body: { status: 'done' } })).status === 400, 'Invalid status rejected');

    const confirmedDocument = await Document.create({
      userId: a.body.user._id, title: 'Confirmed document', sourceType: 'text', extractedText: 'Confirmed text',
      aiAnalysis: {
        status: 'completed', summary: 'Raw summary', category: 'information', model: 'test', analyzedAt: new Date(), reviewStatus: 'confirmed', reviewedAt: new Date(), confirmedBy: a.body.user._id,
        confirmedAnalysis: {
          summary: 'Confirmed summary', category: 'information', importantDates: [], keyInformation: [], risksOrConsequences: [],
          extractedActions: [
            { title: 'Submit confirmed form', description: 'Use confirmed information only.', priority: 'high' },
            { title: 'Keep receipt', description: 'Store proof.', priority: 'low' },
          ],
        },
      },
    });
    const rawDocument = await Document.create({
      userId: a.body.user._id, title: 'Raw document', sourceType: 'text', extractedText: 'Raw text',
      aiAnalysis: { status: 'completed', summary: 'Raw only', category: 'information', extractedActions: [{ title: 'Unsafe raw action', description: '', priority: 'high' }], model: 'test', analyzedAt: new Date(), reviewStatus: 'pending_review' },
    });

    const generated = await request(`/api/documents/${confirmedDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(generated.status === 201 && generated.body.createdCount === 2 && generated.body.tasks.every((task) => task.source === 'ai_confirmed' && String(task.documentId) === String(confirmedDocument._id)), 'Confirmed analysis creates tasks');
    const rawResult = await request(`/api/documents/${rawDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(rawResult.status === 400 && rawResult.body.message === 'Document has no confirmed analysis', 'Raw AI analysis cannot create tasks');
    const duplicate = await request(`/api/documents/${confirmedDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(duplicate.status === 201 && duplicate.body.createdCount === 0 && duplicate.body.skippedCount === 2, 'Duplicate task creation prevented');

    const list = await request('/api/tasks?priority=high', { token: a.body.token });
    check(list.status === 200 && list.body.tasks.every((task) => task.priority === 'high' && String(task.userId) === String(a.body.user._id)), 'Task list filters and isolation work');
    check((await request(`/api/tasks/${taskId}`, { method: 'DELETE', token: a.body.token })).status === 200 && (await Task.findById(taskId)) === null, 'Task deletion works');
    console.log('Task API verification completed successfully.');
  } catch (error) {
    console.error(`Task API verification failed: ${error.message}`);
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
