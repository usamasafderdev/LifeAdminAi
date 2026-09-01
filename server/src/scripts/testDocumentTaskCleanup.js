import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { uploadRoot } from '../config/upload.js';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import User from '../models/User.js';

const EMAILS = ['cleanup-a@lifeadmin.local', 'cleanup-b@lifeadmin.local'];
const PASSWORD = 'DocumentCleanup123';
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(58, '.')} PASS`); };

async function run() {
  let server;
  let userIds = [];
  let fixturePath;
  try {
    await connectDB();
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Promise.all([Task.deleteMany({ userId: { $in: oldIds } }), Document.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = async (pathName, { token, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${pathName}`, { ...options, headers: token ? { authorization: `Bearer ${token}` } : {} });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    const register = async (name, email) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fullName: name, email, password: PASSWORD }) });
      return response.json();
    };
    const [a, b] = await Promise.all([register('Cleanup User A', EMAILS[0]), register('Cleanup User B', EMAILS[1])]);
    userIds = [a.user._id, b.user._id];

    const fixtureName = `cascade-${Date.now()}.pdf`;
    fixturePath = path.join(uploadRoot, 'documents', fixtureName);
    await fs.writeFile(fixturePath, 'controlled cleanup fixture');
    const [targetDocument, otherDocument, emptyDocument] = await Document.create([
      { userId: a.user._id, title: 'Uploaded target', sourceType: 'pdf', extractedText: 'Target', originalFilename: 'target.pdf', mimeType: 'application/pdf', filePath: `uploads/documents/${fixtureName}` },
      { userId: a.user._id, title: 'Other document', sourceType: 'text', extractedText: 'Other' },
      { userId: a.user._id, title: 'Empty document', sourceType: 'text', extractedText: 'Empty' },
    ]);
    const linked = await Task.create([1, 2, 3].map((number) => ({ userId: a.user._id, documentId: targetDocument._id, title: `Linked task ${number}`, source: 'ai_confirmed' })));
    const manual = await Task.create({ userId: a.user._id, title: 'Standalone manual task', source: 'manual' });
    const otherDocumentTask = await Task.create({ userId: a.user._id, documentId: otherDocument._id, title: 'Other document task', source: 'ai_confirmed' });
    const otherUserTask = await Task.create({ userId: b.user._id, documentId: targetDocument._id, title: 'Other user task', source: 'ai_confirmed' });

    check((await request(`/api/documents/${targetDocument._id}`, { method: 'DELETE', token: b.token })).status === 404, '6. Cross-user document deletion remains blocked');
    check((await Task.countDocuments({ _id: { $in: linked.map((task) => task._id) } })) === 3, 'Cross-user attempt deletes no owner tasks');
    const deleted = await request(`/api/documents/${targetDocument._id}`, { method: 'DELETE', token: a.token });
    check((await Task.countDocuments({ userId: a.user._id, documentId: targetDocument._id })) === 0, '1. Three linked AI tasks are deleted');
    check(await Task.exists({ _id: manual._id }), '3. Manual standalone task remains');
    check(await Task.exists({ _id: otherDocumentTask._id }), '4. Task from another document remains');
    check(await Task.exists({ _id: otherUserTask._id }), '5. Another user task remains');
    await fs.access(fixturePath).then(() => check(false, '7. Physical uploaded file is deleted')).catch(() => check(true, '7. Physical uploaded file is deleted'));
    fixturePath = null;
    check(!(await Document.exists({ _id: targetDocument._id })), '8. Document itself is deleted');
    check(deleted.status === 200 && deleted.body.deletedDocument === true && deleted.body.deletedTasks === 3, '9. Response reports correct deleted task count');
    const emptyDeleted = await request(`/api/documents/${emptyDocument._id}`, { method: 'DELETE', token: a.token });
    check(emptyDeleted.status === 200 && emptyDeleted.body.deletedTasks === 0, '2. Document with zero tasks deletes successfully');
    console.log('Document linked-task cleanup verification completed successfully.');
  } catch (error) {
    console.error(`Document cleanup verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (fixturePath) await fs.rm(fixturePath, { force: true });
    if (mongoose.connection.readyState) {
      if (userIds.length) await Promise.all([Task.deleteMany({ userId: { $in: userIds } }), Document.deleteMany({ userId: { $in: userIds } })]);
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
