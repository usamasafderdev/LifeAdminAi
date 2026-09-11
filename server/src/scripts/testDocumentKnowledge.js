import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { splitKnowledgeChunks } from '../services/documentChunkingService.js';
import {
  retrieveDocumentKnowledge,
  selectKnowledgeContext,
  NOT_FOUND,
} from '../services/documentKnowledgeService.js';
import { answerDocumentQuestion } from '../services/documentChatService.js';
import { setDocumentAnalyzerForTests } from '../controllers/documentController.js';
import { setDocumentChatAnswererForTests } from '../controllers/documentChatController.js';
import { createEmbeddingService, embeddingService } from '../services/embeddingService.js';
import { createVectorStoreService, vectorStoreService } from '../services/vectorStoreService.js';
import { retrieveWorkspace } from '../services/workspaceRetrievalService.js';
import { archivePages } from './createKnowledgeFixtures.js';
import { createMultiPageTextPdf, createTextPdf } from './pdfTestFixture.js';

let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  console.log(`PASS ${++checks}: ${label}`);
}
const config = { chunkSize: 300, overlap: 90, maxChunks: 3, maxContextChars: 1100 };
const small =
  'Submission Requirements\nSubmit the assignment as a PDF by September 18, 2026. The upload portal is CampusBox.';
const large = Array.from(
  { length: 130 },
  (_, i) =>
    `[[PAGE:${i + 1}]]\nSection ${i + 1}\n${i === 112 ? 'The submarine access code is COBALT-731.\n' : ''}${'The archive describes routine historical observations. '.repeat(70)}`,
).join('\n\n');
let server;
const userIds = [];
let base;
let calls = 0;
let captured;
const originalEmbedding = embeddingService.generateEmbedding;
const originalSearch = vectorStoreService.searchSimilarChunks;
const originalStore = vectorStoreService.storeEmbeddings;
async function request(path, token, method = 'GET', body) {
  const form = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(!form && body ? { 'content-type': 'application/json' } : {}),
    },
    body: form ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
}
async function run() {
  try {
    check(
      splitKnowledgeChunks('').length === 0 && splitKnowledgeChunks(null).length === 0,
      'Empty input is safe',
    );
    const sentences = Array.from(
      { length: 60 },
      (_, i) => `Sentence ${i} preserves the complete requirement.`,
    ).join(' ');
    const chunks = splitKnowledgeChunks(sentences, config);
    check(
      chunks.every(
        (chunk) =>
          chunk.characterCount <= config.chunkSize &&
          chunk.content === sentences.slice(chunk.startOffset, chunk.endOffset),
      ),
      'Bounded chunks preserve exact offsets',
    );
    check(
      chunks.slice(1).every((chunk, i) => chunk.startOffset < chunks[i].endOffset),
      'Sentence-aligned overlap exists',
    );
    check(
      Array.from(
        { length: 60 },
        (_, i) => `Sentence ${i} preserves the complete requirement.`,
      ).every((sentence) => chunks.some((chunk) => chunk.content.includes(sentence))),
      'Every normal sentence remains intact',
    );
    check(
      splitKnowledgeChunks('z'.repeat(10000), config).every((chunk) => chunk.characterCount <= 300),
      'Oversized tokens cannot exceed hard chunk bounds',
    );
    const largeChunks = splitKnowledgeChunks(large);
    check(
      largeChunks.length > 100 && largeChunks.at(-1).endOffset === large.length,
      '130-page text over 200,000 characters has complete coverage',
    );
    const selected = selectKnowledgeContext(largeChunks, 'submarine access code');
    check(
      selected.context.includes('COBALT-731') && selected.context.length <= 18000,
      'Late-page evidence selected within prompt budget',
    );
    check(
      selectKnowledgeContext(largeChunks, 'zebra birthday').chunks.length === 0,
      'Unrelated query does not select zero-score chunks',
    );
    await assert.rejects(
      createEmbeddingService({
        generateEmbedding: async () => {
          throw new Error('private key');
        },
      }).generateEmbedding('hello'),
      (error) => !error.message.includes('private'),
    );
    check(
      (await createEmbeddingService().generateEmbedding('hello')) === null,
      'No embedding provider is required; errors are sanitized',
    );
    await assert.rejects(
      createVectorStoreService().searchSimilarChunks({}, { values: [1], model: 'test' }),
    );
    check(true, 'Vector adapter rejects missing ownership scope');

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await DocumentChunk.init();
    setDocumentAnalyzerForTests(async () => ({
      actionRequired: true,
      summary: 'Submit the assignment.',
      category: 'university_notice',
      importantDates: [],
      extractedActions: [
        {
          title: 'Submit assignment',
          description: 'Upload a PDF to CampusBox.',
          priority: 'medium',
          dueDate: '',
        },
      ],
      keyInformation: [],
      risksOrConsequences: [],
      model: 'rag-test',
    }));
    setDocumentChatAnswererForTests((args) =>
      answerDocumentQuestion({
        ...args,
        generate: async (req) => {
          calls++;
          captured = req;
          return {
            text: req.userPrompt.includes('COBALT-731')
              ? 'The submarine access code is COBALT-731. [Chunk 1]'
              : 'Submit the PDF by September 18, 2026 using CampusBox.',
            model: 'rag-test',
          };
        },
      }),
    );
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const users = [];
    for (const name of ['A', 'B']) {
      const result = await request('/api/auth/register', null, 'POST', {
        fullName: `RAG ${name}`,
        email: `rag-${randomUUID()}@lifeadmin.local`,
        password: 'RagTest12345!',
      });
      assert.equal(result.status, 201);
      users.push(result);
      userIds.push(result.user._id);
    }
    const [a, b] = users;
    const form = new FormData();
    form.append(
      'file',
      new Blob([createTextPdf(small)], { type: 'application/pdf' }),
      'Assignment.pdf',
    );
    const uploaded = await request('/api/documents/upload', a.token, 'POST', form);
    check(
      uploaded.status === 201 &&
        (await DocumentChunk.countDocuments({
          documentId: uploaded.document._id,
          userId: a.user._id,
        })) > 0,
      'PDF upload creates stored chunks',
    );
    check(
      uploaded.document.aiAnalysis.status === 'completed' && uploaded.taskGeneration.created > 0,
      'Existing analysis and automatic task generation work',
    );
    const bigForm = new FormData();
    bigForm.append(
      'file',
      new Blob([createMultiPageTextPdf(archivePages)], { type: 'application/pdf' }),
      'Archive-130-pages.pdf',
    );
    const big = await request('/api/documents/upload', a.token, 'POST', bigForm);
    check(
      big.status === 201 &&
        (await DocumentChunk.countDocuments({ documentId: big.document._id })) > 50,
      '130-page PDF upload extracts and persists all chunks',
    );
    const answer = await request(`/api/documents/${big.document._id}/chat`, a.token, 'POST', {
      message: 'What is the submarine access code?',
    });
    check(
      answer.status === 201 &&
        answer.answer.includes('COBALT-731') &&
        captured.userPrompt.length < 22000 &&
        !captured.userPrompt.includes('[[PAGE:130]]'),
      'Chat sends only relevant context to mocked AI',
    );
    check(
      answer.sources.some((source) => source.page === 113) &&
        answer.sources.every((source) => source.revision),
      'Citations contain persisted revision and page information',
    );
    const ref = answer.sources[0];
    const path = `/api/documents/${big.document._id}/chunks/${ref.chunkIndex}?revision=${ref.revision}`;
    check(
      (await request(path, a.token)).chunk.content.includes('COBALT-731'),
      'Source endpoint opens exact retrieved text',
    );
    const before = calls;
    const absent = await request(`/api/documents/${big.document._id}/chat`, a.token, 'POST', {
      message: 'What is the zebra birthday?',
    });
    check(
      absent.answer === NOT_FOUND && absent.sources.length === 0 && before === calls,
      'Unrelated query abstains without provider call',
    );
    check(
      (await request(path, b.token)).status === 404 &&
        (
          await request(`/api/documents/${big.document._id}/chat`, b.token, 'POST', {
            message: 'submarine access code',
          })
        ).status === 404,
      'Cross-user chat and chunk access denied',
    );
    await assert.rejects(
      retrieveDocumentKnowledge({
        documentId: big.document._id,
        userId: b.user._id,
        question: 'submarine',
      }),
      { statusCode: 404 },
    );
    const again = await retrieveDocumentKnowledge({
      documentId: big.document._id,
      userId: a.user._id,
      question: 'submarine',
    });
    check(
      again.chunks.length === answer.sources.length &&
        (await DocumentChunk.countDocuments({ documentId: big.document._id })) === 130,
      'Repeated retrieval is idempotent and keeps one chunk per fixture page',
    );
    const workspace = await retrieveWorkspace({
      userId: a.user._id,
      message: 'Which documents discuss submarine access code?',
    });
    check(
      workspace.context.includes('COBALT-731') &&
        workspace.sources.some((source) => /Chunk/.test(source.detail)),
      'Ask LifeAdmin uses stored chunk evidence and references',
    );
    const cachedWorkspace = await retrieveWorkspace({
      userId: a.user._id,
      message: 'Which documents discuss submarine access code?',
    });
    check(
      cachedWorkspace.context.includes('COBALT-731'),
      'Indexed collection search finds current chunks after backfill',
    );
    const isolated = await retrieveWorkspace({
      userId: b.user._id,
      message: 'Which documents discuss submarine access code?',
    });
    check(!JSON.stringify(isolated).includes('COBALT-731'), 'Workspace retrieval is user-isolated');
    embeddingService.generateEmbedding = async () => {
      throw new Error('secret');
    };
    check(
      (
        await retrieveDocumentKnowledge({
          documentId: big.document._id,
          userId: a.user._id,
          question: 'submarine',
        })
      ).context.includes('COBALT-731'),
      'Embedding failure falls back to text retrieval',
    );
    embeddingService.generateEmbedding = async () => ({ values: [1, 0], model: 'test' });
    vectorStoreService.searchSimilarChunks = async () => {
      throw new Error('secret');
    };
    check(
      (
        await retrieveDocumentKnowledge({
          documentId: big.document._id,
          userId: a.user._id,
          question: 'submarine',
        })
      ).context.includes('COBALT-731'),
      'Vector search failure falls back to text retrieval',
    );
    embeddingService.generateEmbedding = originalEmbedding;
    vectorStoreService.searchSimilarChunks = originalSearch;
    const changed = await request(`/api/documents/${big.document._id}`, a.token, 'PATCH', {
      extractedText: 'The submarine access code is AMBER-992.',
    });
    check(
      changed.status === 200 && (await request(path, a.token)).status === 409,
      'Editing reindexes text and rejects stale source links',
    );
    check(
      (await DocumentChunk.countDocuments({
        documentId: big.document._id,
        revision: ref.revision,
      })) === 0,
      'Superseded chunks are removed',
    );
    const empty = await request('/api/documents', a.token, 'POST', {
      title: 'Empty',
      sourceType: 'text',
      extractedText: '',
    });
    check(
      empty.status === 201 &&
        (await DocumentChunk.countDocuments({ documentId: empty.document._id })) === 0 &&
        (
          await request(`/api/documents/${empty.document._id}/chat`, a.token, 'POST', {
            message: 'What is here?',
          })
        ).status === 400,
      'Empty document persists safely and chat reports no readable text',
    );
    await request(`/api/documents/${big.document._id}`, a.token, 'DELETE');
    check(
      (await DocumentChunk.countDocuments({ documentId: big.document._id })) === 0 &&
        (await request(path, a.token)).status === 404,
      'Deletion removes all document chunks and source access',
    );
    check((await request('/api/tasks', a.token)).status === 200, 'Task API remains operational');
    console.log(`Document knowledge: ${checks} checks passed.`);
  } finally {
    embeddingService.generateEmbedding = originalEmbedding;
    vectorStoreService.searchSimilarChunks = originalSearch;
    vectorStoreService.storeEmbeddings = originalStore;
    setDocumentAnalyzerForTests();
    setDocumentChatAnswererForTests();
    if (base && userIds.length) {
      // Delete only this run's UUID-owned fixtures, including uploaded files.
      const { deleteDocumentAndLinkedTasks } =
        await import('../services/documentDeletionService.js');
      for (const document of await Document.find({ userId: { $in: userIds } }))
        await deleteDocumentAndLinkedTasks({ document, userId: document.userId });
      await DocumentChunk.deleteMany({ userId: { $in: userIds } });
      await DocumentChatMessage.deleteMany({ userId: { $in: userIds } });
      await Task.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
