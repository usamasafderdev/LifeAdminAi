import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import User from '../models/User.js';

const EMAILS = ['document-a-user@lifeadmin.local', 'document-b-user@lifeadmin.local'];
const PASSWORD = 'DocumentTest123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(38, '.')} PASS`);
}

async function run() {
  let httpServer;
  let testUserIds = [];
  try {
    await connectDB();
    await Promise.all([User.init(), Document.init()]);

    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Document.deleteMany({ userId: { $in: oldIds } });
    await User.deleteMany({ email: { $in: EMAILS } });

    httpServer = app.listen(0);
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const register = (fullName, email) => request('/api/auth/register', {
      method: 'POST',
      body: { fullName, email, password: PASSWORD },
    });

    const [registrationA, registrationB] = await Promise.all([
      register('Document User A', EMAILS[0]),
      register('Document User B', EMAILS[1]),
    ]);
    check(registrationA.status === 201 && registrationB.status === 201, 'Create dedicated test users');
    const userA = registrationA.body;
    const userB = registrationB.body;
    testUserIds = [userA.user._id, userB.user._id];
    const createBody = {
      title: 'Internship Submission Notice',
      sourceType: 'text',
      category: 'university_notice',
      extractedText: 'Submit the internship report before September 10.',
      userId: userB.user._id,
    };

    const unauthenticated = await request('/api/documents', { method: 'POST', body: createBody });
    check(unauthenticated.status === 401, 'Create requires authentication');
    check((await request('/api/documents', { method: 'POST', token: userA.token, body: { sourceType: 'text' } })).status === 400, 'Create missing title');
    check((await request('/api/documents', { method: 'POST', token: userA.token, body: { title: 'Bad source', sourceType: 'pdf' } })).status === 400, 'Create invalid source type');
    check((await request('/api/documents', { method: 'POST', token: userA.token, body: { title: 'Bad category', sourceType: 'text', category: 'secret' } })).status === 400, 'Create invalid category');

    const createdA1 = await request('/api/documents', { method: 'POST', token: userA.token, body: createBody });
    check(createdA1.status === 201 && createdA1.body.success, 'Create document');
    check(String(createdA1.body.document.userId) === String(userA.user._id), 'Create uses authenticated owner');
    const documentAId = createdA1.body.document._id;
    const createdA2 = await request('/api/documents', {
      method: 'POST', token: userA.token, body: { title: 'Second A document', sourceType: 'manual' },
    });
    const createdB = await request('/api/documents', {
      method: 'POST', token: userB.token, body: { title: 'User B document', sourceType: 'text' },
    });
    check(createdA2.status === 201 && createdB.status === 201, 'Create isolation fixtures');

    const listA = await request('/api/documents', { token: userA.token });
    const listB = await request('/api/documents', { token: userB.token });
    check(listA.status === 200 && listA.body.count === 2, 'List own documents');
    check(listB.status === 200 && listB.body.count === 1 && listB.body.documents.every((doc) => String(doc.userId) === String(userB.user._id)), 'List excludes other user docs');

    check((await request(`/api/documents/${documentAId}`, { token: userA.token })).status === 200, 'Get own document');
    check((await request(`/api/documents/${documentAId}`, { token: userB.token })).status === 404, "Get other user's document");
    check((await request('/api/documents/not-a-valid-object-id', { token: userA.token })).status === 400, 'Get invalid document ID');

    const updated = await request(`/api/documents/${documentAId}`, {
      method: 'PATCH', token: userA.token, body: { title: 'Updated internship notice', category: 'information' },
    });
    check(updated.status === 200 && updated.body.document.title === 'Updated internship notice', 'Update own document');
    check((await request(`/api/documents/${documentAId}`, { method: 'PATCH', token: userA.token, body: { userId: userB.user._id } })).status === 400, 'Update rejects userId change');
    check((await request(`/api/documents/${documentAId}`, { method: 'PATCH', token: userB.token, body: { title: 'Stolen' } })).status === 404, "Update other user's document");

    check((await request(`/api/documents/${documentAId}`, { method: 'DELETE', token: userB.token })).status === 404, "Delete other user's document");
    check((await request(`/api/documents/${documentAId}`, { method: 'DELETE', token: userA.token })).status === 200, 'Delete own document');
    check((await request(`/api/documents/${documentAId}`, { token: userA.token })).status === 404, 'Deleted document no longer exists');

    const storedB = await Document.findById(createdB.body.document._id);
    check(String(storedB.userId) === String(userB.user._id), 'MongoDB ownership field');
    console.log('Document API verification completed successfully.');
  } catch (error) {
    console.error(`Document API verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    if (mongoose.connection.readyState) {
      if (testUserIds.length) await Document.deleteMany({ userId: { $in: testUserIds } });
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
