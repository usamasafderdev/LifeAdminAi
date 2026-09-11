import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import app from '../app.js';
import Memory from '../models/Memory.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import {
  extractMemory,
  validateMemory,
  containsSensitiveInformation,
  rankImportance,
} from '../services/memoryExtractionService.js';
import {
  retrieveMemories,
  suggestMemories,
  setMemoryExtractorForTests,
} from '../services/memoryService.js';
import { answerWorkspaceQuestion } from '../services/assistantService.js';
import { answerDocumentQuestion } from '../services/documentChatService.js';
import { setWorkspaceAnswererForTests } from '../controllers/assistantController.js';
import { setDocumentChatAnswererForTests } from '../controllers/documentChatController.js';

const fallback = (message) =>
  extractMemory(message, {
    generate: async () => {
      throw new Error('private provider details');
    },
  });
let count = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  console.log(`PASS ${++count}: ${message}`);
};
let server;
let base;
const ids = [];
let captured;
let extractionCalls = 0;
async function request(path, token, method = 'GET', body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json()) };
}
async function run() {
  try {
    check(
      (await fallback('I prefer PDF reports.'))[0]?.type === 'preference',
      'Provider failure safely falls back to exact preference declaration',
    );
    check(
      (await fallback('My final year project is called LifeAdmin AI.'))[0]?.type ===
        'working_context',
      'Project declaration is detected',
    );
    check(
      (await fallback('I always use React and Node.'))[0]?.type === 'working_context',
      'Frequently used tools are detected',
    );
    check(
      (await fallback('I decided to use MongoDB instead of PostgreSQL.'))[0]?.type === 'decision',
      'Long-term decision is detected',
    );
    check(
      (await fallback('I am a Software Engineering student.'))[0]?.type === 'personal',
      'Education context is detected',
    );
    for (const message of [
      'What is the weather?',
      'I prefer PDF reports just today.',
      'He said I prefer short answers.',
      'My password is xyz',
      'I prefer short answers, but do not save this.',
    ])
      check(
        (await fallback(message)).length === 0,
        `Excluded statement: ${message === 'My password is xyz' ? 'credential disclosure' : message}`,
      );
    check(
      containsSensitiveInformation('I prefer reports with my API key: sk-examplekey123456789'),
      'Credential filtering runs before extraction',
    );
    check(
      validateMemory({
        type: 'preference',
        content: 'I prefer secret passwords.',
        confidence: 1,
      }) === null,
      'Sensitive content cannot pass save validation',
    );
    check(
      validateMemory(
        { type: 'preference', content: 'I prefer PDF reports.', confidence: 0.9 },
        'I prefer short answers.',
      ) === null,
      'Hallucinated provider memory is rejected',
    );
    check(
      rankImportance({ type: 'working_context', useCount: 5 }) === 'high',
      'Repeatedly used memories receive high priority',
    );
    let aiRequest;
    const ai = await extractMemory('I prefer PDF reports.', {
      generate: async (req) => {
        aiRequest = req;
        return {
          text: JSON.stringify({
            memories: [{ type: 'preference', content: 'I prefer PDF reports.', confidence: 0.92 }],
          }),
        };
      },
    });
    check(
      ai.length === 1 && aiRequest.maxTokens === 500,
      'AI extraction uses the existing provider contract and bounded output',
    );

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await Memory.init();
    setMemoryExtractorForTests(async (message) => {
      extractionCalls++;
      return fallback(message);
    });
    setWorkspaceAnswererForTests((args) =>
      answerWorkspaceQuestion({
        ...args,
        generate: async (req) => {
          captured = req;
          return { text: 'I can help prepare your preferred report.', model: 'memory-test' };
        },
      }),
    );
    setDocumentChatAnswererForTests((args) =>
      answerDocumentQuestion({
        ...args,
        generate: async (req) => {
          captured = req;
          return { text: 'The report is due Friday.', model: 'memory-test' };
        },
      }),
    );
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const users = [];
    for (const name of ['A', 'B']) {
      const result = await request('/api/auth/register', null, 'POST', {
        fullName: `Memory ${name}`,
        email: `memory-${randomUUID()}@lifeadmin.local`,
        password: 'MemoryTest123!',
      });
      assert.equal(result.status, 201);
      users.push(result);
      ids.push(result.user._id);
    }
    const [a, b] = users;
    check((await request('/api/memories')).status === 401, 'Memory API requires authentication');
    const chat = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'I prefer PDF reports.',
    });
    const proposal = chat.memory.suggestions[0];
    check(
      chat.status === 201 && proposal.content === 'I prefer PDF reports.',
      'Conversation returns a Save/Ignore suggestion',
    );
    check(
      (await Memory.countDocuments({ userId: a.user._id })) === 0,
      'Unaccepted suggestions are not stored as memories',
    );
    check(
      !(await retrieveMemories(a.user._id, 'Create a report.')).ids.length,
      'Unaccepted preferences cannot enter memory context',
    );
    check(
      (await request('/api/memories', proposal.token)).status === 401,
      'Suggestion token cannot authenticate to the application',
    );
    check(
      (await request('/api/memories/confirm', a.token, 'POST', { token: a.token })).status === 400,
      'Authentication token cannot act as memory consent',
    );
    check(
      (await request('/api/memories/confirm', b.token, 'POST', { token: proposal.token }))
        .status === 404,
      'Another user cannot accept a suggestion',
    );
    const saved = await request('/api/memories/confirm', a.token, 'POST', {
      token: proposal.token,
      userId: b.user._id,
      content: 'Injected',
    });
    check(
      saved.status === 201 && saved.memory.source === 'conversation_confirmed',
      'Accepting saves validated memory under authenticated ownership',
    );
    await request('/api/memories/confirm', a.token, 'POST', { token: proposal.token });
    check(
      (await Memory.countDocuments({ userId: a.user._id })) === 1,
      'Repeated consent is idempotent',
    );
    await request('/api/assistant/chat', a.token, 'DELETE');
    captured = null;
    const fresh = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'Create a report.',
    });
    check(
      fresh.status === 201 && captured.userPrompt.includes('I prefer PDF reports.'),
      'New conversation receives saved PDF preference',
    );
    check(
      (await Memory.findById(saved.memory._id)).lastUsedAt !== null,
      'Successful AI use updates last-used timestamp',
    );
    check(
      !(await retrieveMemories(b.user._id, 'Create a report.')).ids.length &&
        (await request('/api/memories', b.token)).count === 0,
      'Retrieval and listing never share memories between users',
    );
    check(
      (
        await request(`/api/memories/${saved.memory._id}`, b.token, 'PATCH', {
          content: 'I prefer DOCX reports.',
        })
      ).status === 404 &&
        (await request(`/api/memories/${saved.memory._id}`, b.token, 'DELETE')).status === 404,
      'Other users cannot edit or delete memories',
    );
    check(
      (await request('/api/memories?q=PDF', a.token)).total === 1 &&
        (await request('/api/memories?q=Banana', a.token)).total === 0,
      'Memory search is user-scoped and filtered',
    );
    const edited = await request(`/api/memories/${saved.memory._id}`, a.token, 'PATCH', {
      content: 'I prefer DOCX reports.',
    });
    check(
      edited.status === 200 &&
        (await retrieveMemories(a.user._id, 'Create a report.')).context.includes('DOCX'),
      'Editing immediately changes future memory context',
    );
    check(
      (
        await request(`/api/memories/${saved.memory._id}`, a.token, 'PATCH', {
          content: 'My password is xyz',
          type: 'personal',
        })
      ).status === 400,
      'Sensitive edits are rejected',
    );
    await request('/api/memories/settings', a.token, 'PATCH', { enabled: false });
    const beforeExtraction = extractionCalls;
    const disabled = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'I prefer concise explanations.',
    });
    check(
      !disabled.memory.suggestions.length &&
        extractionCalls === beforeExtraction &&
        !(await retrieveMemories(a.user._id, 'Create a report.')).ids.length,
      'Disabling stops extraction and retrieval',
    );
    check(
      (await request('/api/memories', a.token)).count === 1,
      'Disabling retains manageable saved memories',
    );
    await request('/api/memories/settings', a.token, 'PATCH', {
      enabled: true,
      autoSavePreferences: true,
    });
    const auto = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'I prefer short answers.',
    });
    check(
      auto.memory.saved.length === 1 && auto.memory.saved[0].source === 'preference_automatic',
      'Opt-in allows narrowly defined low-risk automatic saving',
    );
    const personal = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'I am a Software Engineering student.',
    });
    check(
      personal.memory.suggestions.length === 1 && personal.memory.saved.length === 0,
      'Personal information always requires confirmation',
    );
    const random = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'What is the weather?',
    });
    check(
      !random.memory.suggestions.length && !random.memory.saved.length,
      'Random conversation creates no unnecessary memories',
    );
    const secret = await request('/api/assistant/chat', a.token, 'POST', {
      message: 'My password is xyz',
    });
    check(
      secret.status === 400 &&
        !(await WorkspaceChatMessage.exists({ userId: a.user._id, content: 'My password is xyz' })),
      'Credential disclosure is rejected before provider or chat persistence',
    );
    const document = await Document.create({
      userId: a.user._id,
      title: 'Report',
      sourceType: 'text',
      extractedText: 'The report is due Friday.',
    });
    const documentChat = await request(`/api/documents/${document._id}/chat`, a.token, 'POST', {
      message: 'When is the report due?',
    });
    check(
      documentChat.status === 201 &&
        captured.userPrompt.includes('I prefer short answers.') &&
        captured.userPrompt.includes('The report is due Friday.'),
      'Document answers use memory without replacing retrieved evidence',
    );
    check(
      (
        await request(`/api/documents/${document._id}/chat`, a.token, 'POST', {
          message: 'My password is xyz',
        })
      ).status === 400,
      'Document chat also blocks credential persistence',
    );
    await request(`/api/memories/${saved.memory._id}`, a.token, 'DELETE');
    check(
      !(await Memory.exists({ _id: saved.memory._id })) &&
        !(await retrieveMemories(a.user._id, 'Create a report.')).context.includes('DOCX'),
      'Forgetting deletes the memory and removes future retrieval',
    );
    check(
      (await request('/api/memories/confirm', a.token, 'POST', { token: proposal.token }))
        .status === 409,
      'Deleted memory cannot be restored by replaying an old suggestion',
    );
    await request('/api/memories', a.token, 'DELETE');
    check(
      (await request('/api/memories', a.token)).count === 0 &&
        !(await Memory.exists({ userId: a.user._id })),
      'Delete all removes all saved memories',
    );
    check(
      (
        await request('/api/memories/confirm', a.token, 'POST', {
          token: personal.memory.suggestions[0].token,
        })
      ).status === 409,
      'Delete all invalidates outstanding suggestions',
    );
    let release;
    let entered;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const pending = suggestMemories(a.user._id, 'I prefer concise answers.', {
      extract: async (message) => {
        entered();
        await blocked;
        return fallback(message);
      },
    });
    await started;
    await request('/api/memories', a.token, 'DELETE');
    release();
    const stale = await pending;
    check(
      !stale.saved.length &&
        !stale.suggestions.length &&
        !(await Memory.exists({ userId: a.user._id })),
      'In-flight extraction cannot undo delete-all consent',
    );
    await request('/api/assistant/chat', a.token, 'POST', { message: 'I prefer short answers.' });
    await request('/api/assistant/chat', a.token, 'POST', {
      message: 'I prefer detailed answers.',
    });
    const latest = await retrieveMemories(a.user._id, 'Explain an algorithm.');
    check(
      latest.context.includes('detailed answers') && !latest.context.includes('short answers'),
      'Newest answer-length preference supersedes older contradictory context',
    );
    await request('/api/memories/settings', a.token, 'PATCH', { autoSavePreferences: false });
    for (let i = 0; i < 10; i++) {
      const result = await suggestMemories(
        a.user._id,
        `My current project is called Project${i} ${'research '.repeat(30)}.`,
        { extract: fallback },
      );
      await request('/api/memories/confirm', a.token, 'POST', {
        token: result.suggestions[0].token,
      });
    }
    const bounded = await retrieveMemories(a.user._id, 'Explain my research project.');
    check(
      bounded.context.length <= 2000 && bounded.ids.length <= 6,
      'Large memory collections cannot exceed six memories or 2,000 context characters',
    );
    const pdf = await suggestMemories(a.user._id, 'I prefer PDF reports.', { extract: fallback });
    check(
      pdf.suggestions.length === 1 && pdf.saved.length === 0,
      'PDF format remains a confirmation suggestion',
    );
    console.log(`Personal memory: ${count} checks passed.`);
  } finally {
    setMemoryExtractorForTests();
    setWorkspaceAnswererForTests();
    setDocumentChatAnswererForTests();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState && ids.length)
      await Promise.all([
        Memory.deleteMany({ userId: { $in: ids } }),
        WorkspaceChatMessage.deleteMany({ userId: { $in: ids } }),
        DocumentChatMessage.deleteMany({ userId: { $in: ids } }),
        DocumentChunk.deleteMany({ userId: { $in: ids } }),
        Document.deleteMany({ userId: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    await mongoose.disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
