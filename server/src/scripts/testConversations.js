import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Conversation from '../models/Conversation.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { setWorkspaceAnswererForTests } from '../controllers/assistantController.js';
import { setDocumentChatAnswererForTests } from '../controllers/documentChatController.js';
import { generateText, AiError, AI_ERROR_CODES } from '../services/ai/aiService.js';
let server;
const ids = [];
const check = (value, label) => {
  assert.ok(value, label);
  console.log(`PASS ${label}`);
};
try {
  await connectDB();
  await Promise.all([Conversation.init(), WorkspaceChatMessage.init(), DocumentChatMessage.init()]);
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
    return { status: response.status, ...(await response.json()) };
  };
  const users = [];
  for (const name of ['A', 'B']) {
    const result = await request('/auth/register', null, 'POST', {
      fullName: `Chat Test ${name}`,
      email: `${randomUUID()}@chat-test.local`,
      password: 'ConversationTest123',
    });
    assert.equal(result.status, 201);
    users.push(result);
    ids.push(result.user._id);
  }
  const [a, b] = users;
  const create = async (body = { type: 'global' }) =>
    (await request('/conversations', a.token, 'POST', body)).conversation;
  const conversation = await create();
  let calls = 0;
  setWorkspaceAnswererForTests(async ({ message, history }) => {
    calls++;
    if (message === 'Continue')
      assert.ok(history.some((item) => item.content === 'First question'));
    return { answer: `Answer: ${message}`, sources: [], actions: [] };
  });
  const send = (text, requestId = randomUUID(), token = a.token, id = conversation._id) =>
    request(`/conversations/${id}/messages`, token, 'POST', { message: text, requestId });
  const requestId = randomUUID();
  const first = await send('First question', requestId);
  check(first.status === 201, 'Conversation saves a user and assistant message');
  const replay = await send('First question', requestId);
  check(
    replay.status === 200 && replay.message._id === first.message._id && calls === 1,
    'Browser retry replays saved answer without another AI call',
  );
  check(
    (await send('Different question', requestId)).status === 409,
    'Request ID cannot be reused with changed content',
  );
  await send('Continue');
  await send('Third question');
  const history = await request(`/conversations/${conversation._id}/messages`, a.token);
  check(
    history.messages.length === 6 && history.messages[0].content === 'First question',
    'Reload restores three ordered turns and continuation context',
  );
  const loggedIn = await request('/auth/login', null, 'POST', {
    email: a.user.email,
    password: 'ConversationTest123',
  });
  check(
    (await request(`/conversations/${conversation._id}/messages`, loggedIn.token)).messages
      .length === 6,
    'New login session retains own history',
  );
  for (const path of [
    `/conversations/${conversation._id}`,
    `/conversations/${conversation._id}/messages`,
  ]) {
    check((await request(path, b.token)).status === 404, `Other user cannot read ${path}`);
  }
  check(
    (await send('Forbidden', randomUUID(), b.token)).status === 404,
    'Other user cannot append',
  );
  check(
    (await request(`/conversations/${conversation._id}`, b.token, 'DELETE')).status === 404,
    'Other user cannot delete',
  );
  check(
    (await request('/conversations')).status === 401,
    'Conversation APIs require authentication',
  );
  check(
    (await request('/conversations', b.token)).conversations.every(
      (item) => item.userId === b.user._id,
    ),
    'Conversation list is user-scoped',
  );
  const other = await create();
  check(
    (await request(`/conversations/${other._id}/messages`, a.token)).messages.length === 0,
    'New Chat starts separate history',
  );
  for (const [code, status] of [
    [AI_ERROR_CODES.TIMEOUT, 504],
    [AI_ERROR_CODES.RATE_LIMITED, 429],
    [AI_ERROR_CODES.INVALID_RESPONSE, 502],
    [AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 503],
  ]) {
    const id = randomUUID();
    setWorkspaceAnswererForTests(async () => {
      throw new AiError(code, { statusCode: status, cause: new Error('SECRET_PROVIDER_STACK') });
    });
    const failed = await send(`Failure ${code}`, id);
    check(
      failed.status === status && !JSON.stringify(failed).includes('SECRET_PROVIDER_STACK'),
      `${code} returns a safe error`,
    );
    check(
      (await WorkspaceChatMessage.countDocuments({
        conversationId: conversation._id,
        requestId: id,
        role: 'assistant',
      })) === 0,
      `${code} saves no empty assistant message`,
    );
    check(
      (
        await WorkspaceChatMessage.findOne({
          conversationId: conversation._id,
          requestId: id,
          role: 'user',
        })
      ).status === 'failed',
      `${code} preserves retryable user message`,
    );
    setWorkspaceAnswererForTests(async () => ({ answer: 'Recovered', sources: [], actions: [] }));
    assert.equal((await send(`Failure ${code}`, id)).status, 201);
    check(
      (await WorkspaceChatMessage.countDocuments({
        conversationId: conversation._id,
        requestId: id,
      })) === 2,
      `${code} retry does not duplicate user message`,
    );
  }
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  setWorkspaceAnswererForTests(async () => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return { answer: 'Slow answer', sources: [], actions: [] };
  });
  const slowId = randomUUID();
  const slow = send('Slow question', slowId);
  await entered;
  check(
    (await send('Slow question', slowId)).status === 409,
    'Concurrent send is rejected while first turn runs',
  );
  check(
    (await request(`/conversations/${conversation._id}`, a.token, 'DELETE')).status === 409,
    'Active conversation cannot be deleted',
  );
  release();
  assert.equal((await slow).status, 201);
  const docA = await Document.create({
    userId: a.user._id,
    title: 'Document A',
    sourceType: 'text',
    extractedText: 'Document A deadline is October 1.',
  });
  const docB = await Document.create({
    userId: a.user._id,
    title: 'Document B',
    sourceType: 'text',
    extractedText: 'Document B deadline is October 2.',
  });
  const docChat = await create({ type: 'document', documentId: docA._id });
  const bGlobal = (await request('/conversations', b.token, 'POST', { type: 'global' })).conversation;
  check((await request(`/conversations/${bGlobal._id}`, b.token, 'PATCH', { documentId: docA._id })).status === 404, 'Cannot select another user document');
  check((await request(`/conversations/${conversation._id}`, b.token, 'PATCH', { documentId: null })).status === 404, 'Cannot change another user conversation context');
  check((await request(`/conversations/${docChat._id}`, a.token, 'PATCH', { documentId: null })).status === 400, 'Fixed document-chat scope remains protected');
  setDocumentChatAnswererForTests(async ({ document, history }) => {
    assert.equal(String(document._id), String(docA._id));
    assert.ok(!JSON.stringify(history).includes('Document B'));
    return { answer: 'October 1', sources: [] };
  });
  const docRequestId = randomUUID();
  const docResult = await send('What is the deadline?', docRequestId, a.token, docChat._id);
  check(
    docResult.status === 201 && String(docResult.message.documentId) === String(docA._id),
    'Document conversation uses its owned document',
  );
  check(
    (await send('What is the deadline?', docRequestId, a.token, docChat._id)).replayed,
    'Document retries are idempotent',
  );
  check(
    (
      await request(`/documents/${docB._id}/chat`, a.token, 'POST', {
        message: 'Wrong scope',
        conversationId: docChat._id,
      })
    ).status === 404,
    'Document A chat cannot be sent through Document B',
  );
  check(
    (await request('/conversations', b.token, 'POST', { type: 'document', documentId: docA._id }))
      .status === 404,
    'Document ownership checked when creating conversation',
  );
  await Document.deleteOne({ _id: docA._id, userId: a.user._id });
  check(
    (await request(`/conversations/${docChat._id}/messages`, a.token)).status === 404,
    'Deleted document history cannot bypass ownership',
  );
  await request('/conversations', a.token);
  const beforeList = await Conversation.findOne({ userId: a.user._id, defaultKey: 'global' });
  await request('/conversations', a.token);
  const afterList = await Conversation.findOne({ userId: a.user._id, defaultKey: 'global' });
  check(
    beforeList.updatedAt.getTime() === afterList.updatedAt.getTime(),
    'Reading history does not change conversation recency',
  );
  const legacy = await WorkspaceChatMessage.create({
    userId: a.user._id,
    role: 'user',
    content: 'Legacy history',
  });
  await request('/conversations', a.token);
  const adopted = await WorkspaceChatMessage.findById(legacy._id);
  check(
    Boolean(adopted.conversationId) && adopted.createdAt.getTime() === legacy.createdAt.getTime(),
    'Legacy messages adopted without timestamp changes',
  );
  assert.equal(
    (await request(`/conversations/${conversation._id}`, a.token, 'DELETE')).status,
    200,
  );
  check(
    (await WorkspaceChatMessage.countDocuments({
      userId: a.user._id,
      conversationId: conversation._id,
    })) === 0,
    'Delete removes only selected conversation messages',
  );
  const config = { provider: 'groq', apiKey: 'test', model: 'test', timeoutMs: 20 };
  await assert.rejects(
    generateText(
      { userPrompt: 'Test timeout' },
      { config, providers: { groq: () => new Promise(() => {}) } },
    ),
    { code: AI_ERROR_CODES.TIMEOUT },
  );
  for (const text of ['', null, {}, []])
    await assert.rejects(
      generateText(
        { userPrompt: 'Test malformed' },
        { config, providers: { groq: async () => ({ text }) } },
      ),
      { code: AI_ERROR_CODES.INVALID_RESPONSE },
    );
  check(true, 'Central AI timeout and invalid output are enforced');
  console.log('Conversation persistence and reliability verification completed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  setWorkspaceAnswererForTests();
  setDocumentChatAnswererForTests();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (ids.length)
    for (const Model of [WorkspaceChatMessage, DocumentChatMessage, Conversation, Document, User])
      await Model.deleteMany(Model === User ? { _id: { $in: ids } } : { userId: { $in: ids } });
  await mongoose.disconnect();
}
