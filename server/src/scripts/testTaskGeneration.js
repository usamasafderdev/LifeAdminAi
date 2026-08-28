import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { generateTasksFromAnalysis } from '../services/taskGenerationService.js';

const EMAILS = ['generation-a@lifeadmin.local', 'generation-b@lifeadmin.local'];
const PASSWORD = 'TaskGeneration123';
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(48, '.')} PASS`); };

async function run() {
  let server;
  let userIds = [];
  try {
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
    const [a, b] = await Promise.all([register('Generation User A', EMAILS[0]), register('Generation User B', EMAILS[1])]);
    userIds = [a.body.user._id, b.body.user._id];

    const analysis = (reviewStatus) => ({
      status: 'completed', summary: 'Raw', category: 'information', model: 'test', analyzedAt: new Date(), reviewStatus,
      ...(reviewStatus === 'confirmed' ? { reviewedAt: new Date(), confirmedBy: a.body.user._id, confirmedAnalysis: { summary: 'Confirmed', category: 'information', importantDates: [], keyInformation: [], risksOrConsequences: [], extractedActions: [{ title: ' Submit final form ', description: 'Use the approved form.', priority: 'high', dueDate: '2026-09-20' }, { title: 'Keep a copy', description: '', priority: 'medium' }] } } : {}),
    });
    const [confirmed, pending, rejected] = await Document.create([
      { userId: a.body.user._id, title: 'Confirmed assignment', sourceType: 'text', extractedText: 'Text', aiAnalysis: analysis('confirmed') },
      { userId: a.body.user._id, title: 'Pending assignment', sourceType: 'text', extractedText: 'Text', aiAnalysis: analysis('pending_review') },
      { userId: a.body.user._id, title: 'Rejected assignment', sourceType: 'text', extractedText: 'Text', aiAnalysis: analysis('rejected') },
    ]);

    check((await request(`/api/documents/${confirmed._id}/create-tasks`, { method: 'POST' })).status === 401, 'Authentication required');
    const created = await request(`/api/documents/${confirmed._id}/create-tasks`, { method: 'POST', token: a.body.token, body: { actionIndexes: [0] } });
    check(created.status === 201 && created.body.created === 1 && created.body.tasks[0].title === 'Submit final form', 'Confirmed analysis creates selected tasks');
    check((await request(`/api/documents/${pending._id}/create-tasks`, { method: 'POST', token: a.body.token })).status === 400, 'Pending AI analysis cannot create tasks');
    check((await request(`/api/documents/${rejected._id}/create-tasks`, { method: 'POST', token: a.body.token })).status === 400, 'Rejected analysis cannot create tasks');
    const duplicate = await request(`/api/documents/${confirmed._id}/create-tasks`, { method: 'POST', token: a.body.token, body: { actionIndexes: [0] } });
    check(duplicate.body.created === 0 && duplicate.body.skipped === 1, 'Duplicate tasks skipped');

    const serviceDocument = { _id: new mongoose.Types.ObjectId(), aiAnalysis: { reviewStatus: 'confirmed', confirmedAnalysis: { extractedActions: [{ title: 'Normalized action', priority: 'HIGH', dueDate: 'not-a-date' }] } } };
    const prepared = await generateTasksFromAnalysis(serviceDocument, a.body.user._id);
    check(prepared.tasks[0].priority === 'high', 'Invalid priority casing normalized');
    check(prepared.tasks[0].dueDate === null, 'Invalid dates rejected safely');
    check((await request(`/api/documents/${confirmed._id}/create-tasks`, { method: 'POST', token: b.body.token })).status === 404, 'User isolation works');

    const manual = await request('/api/tasks', { method: 'POST', token: a.body.token, body: { title: 'Manual task', priority: 'low' } });
    check(manual.status === 201 && manual.body.task.source === 'manual', 'Existing manual task creation works');
    const updated = await request(`/api/tasks/${manual.body.task._id}`, { method: 'PATCH', token: a.body.token, body: { status: 'completed' } });
    const removed = await request(`/api/tasks/${manual.body.task._id}`, { method: 'DELETE', token: a.body.token });
    check(updated.status === 200 && removed.status === 200, 'Task update and delete still work');
    console.log('Smart task generation verification completed successfully.');
  } catch (error) {
    console.error(`Smart task generation verification failed: ${error.message}`);
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
