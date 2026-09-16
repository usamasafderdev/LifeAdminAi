import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import Conversation from '../models/Conversation.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import Memory from '../models/Memory.js';

let server;
const check = (value, label) => {
  assert.ok(value, label);
  console.log(`PASS ${label}`);
};
try {
  await connectDB();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (path, token, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    return {
      status: response.status,
      headers: response.headers,
      body: contentType.includes('json') ? await response.json() : await response.text(),
    };
  };
  const register = async (label) =>
    request('/auth/register', null, 'POST', {
      fullName: `Privacy ${label}`,
      email: `${randomUUID()}@privacy-test.local`,
      password: 'PrivacyTest123',
    });
  const a = await register('A');
  const b = await register('B');
  const aId = new mongoose.Types.ObjectId(a.body.user._id);
  const bId = new mongoose.Types.ObjectId(b.body.user._id);
  const aTask = await Task.create({ userId: aId, title: 'A private task', source: 'manual' });
  await Reminder.create({
    userId: aId,
    taskId: aTask._id,
    title: 'A private reminder',
    remindAt: new Date(Date.now() + 86400000),
  });
  const aDocument = await Document.create({
    userId: aId,
    title: 'A private document',
    sourceType: 'text',
    extractedText: 'private document text',
  });
  const aConversation = await Conversation.create({
    userId: aId,
    type: 'global',
    title: 'A private chat',
  });
  const bConversation = await Conversation.create({
    userId: bId,
    type: 'global',
    title: 'B private chat',
  });
  await WorkspaceChatMessage.create([
    { userId: aId, conversationId: aConversation._id, role: 'user', content: 'A private message' },
    { userId: bId, conversationId: bConversation._id, role: 'user', content: 'B private message' },
  ]);
  await Memory.create({
    userId: aId,
    generation: 0,
    type: 'preference',
    content: 'A private preference',
    fingerprint: randomUUID(),
    importance: 'medium',
    source: 'user_edit',
    confidence: 1,
  });

  const unauthenticated = await request('/privacy/export');
  check(unauthenticated.status === 401, 'Privacy export requires authentication');
  const exported = await request('/privacy/export', a.body.token);
  const exportText =
    typeof exported.body === 'string' ? exported.body : JSON.stringify(exported.body);
  const exportData = JSON.parse(exportText);
  check(
    exported.status === 200 && exportData.profile.email === a.body.user.email,
    'Authenticated user can export own data',
  );
  check(
    exportText.includes('A private task') &&
      exportText.includes('A private document') &&
      !exportText.includes('B private message'),
    'Export is user-scoped',
  );
  check(
    !exportText.includes('password') &&
      !exportText.includes('apiKey') &&
      !exportText.includes('JWT_SECRET'),
    'Export excludes authentication and provider secrets',
  );

  const cleared = await request('/privacy/chat-history', a.body.token, 'DELETE');
  check(
    cleared.status === 200 && (await WorkspaceChatMessage.countDocuments({ userId: aId })) === 0,
    'User can clear own chat history',
  );
  check(
    (await WorkspaceChatMessage.countDocuments({ userId: bId })) === 1,
    'Clearing chat preserves other user history',
  );
  check(
    (await Task.countDocuments({ userId: aId })) === 1 &&
      (await Document.countDocuments({ userId: aId })) === 1,
    'Clearing chat preserves workspace data',
  );

  const missingConfirmation = await request('/privacy/account', a.body.token, 'DELETE', {
    confirmation: 'delete',
  });
  check(
    missingConfirmation.status === 400 && (await User.exists({ _id: aId })),
    'Account deletion requires exact confirmation',
  );
  const deleted = await request('/privacy/account', a.body.token, 'DELETE', {
    confirmation: 'DELETE',
  });
  check(
    deleted.status === 200 && !(await User.exists({ _id: aId })),
    'Account deletion removes the authenticated user',
  );
  check(
    !(await Task.exists({ userId: aId })) &&
      !(await Document.exists({ userId: aId })) &&
      !(await Conversation.exists({ userId: aId })),
    'Account deletion removes all owned data',
  );
  check(
    (await User.exists({ _id: bId })) && (await WorkspaceChatMessage.exists({ userId: bId })),
    'Account deletion preserves another user',
  );
  const deletedLogin = await request('/auth/login', null, 'POST', {
    email: a.body.user.email,
    password: 'PrivacyTest123',
  });
  check(deletedLogin.status === 401, 'Deleted account cannot log in');

  await request('/privacy/account', b.body.token, 'DELETE', { confirmation: 'DELETE' });
  console.log('Privacy verification completed successfully.');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}
