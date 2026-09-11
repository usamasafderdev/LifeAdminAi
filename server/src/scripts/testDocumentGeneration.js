import DocumentChunk from '../models/DocumentChunk.js';
import 'dotenv/config';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { setDocumentGeneratorForTests } from '../controllers/documentChatController.js';
import Document from '../models/Document.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import GeneratedDocument from '../models/GeneratedDocument.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import {
  createDocxBuffer,
  detectChatIntent,
  generateDocumentContent,
  normalizeGeneratedContent,
  resolveGeneratedFile,
} from '../services/documentGenerationService.js';

const EMAILS = ['generation-a@lifeadmin.local', 'generation-b@lifeadmin.local'];
const check = (condition, label) => {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(72, '.')} PASS`);
};
const structured = {
  title: 'Security Report',
  subtitle: '[Student Name] · [Student Number]',
  sections: [
    {
      heading: 'Introduction',
      level: 1,
      paragraphs: ['This assistant-generated draft explains defensive mobile security.'],
      bullets: [],
    },
    {
      heading: 'References to verify',
      level: 1,
      paragraphs: ['[Reference metadata to verify]'],
      bullets: ['Do not submit unverified citations.'],
    },
  ],
};

async function run() {
  let server;
  let ids = [];
  try {
    check(detectChatIntent('What is the deadline?') === 'FACTUAL_QA', '1. Factual intent detected');
    check(
      detectChatIntent('Can you help me complete this?') === 'DRAFT_OR_SOLUTION',
      '2. Help intent enables substantive drafting',
    );
    check(
      detectChatIntent('Write section 6') === 'DRAFT_OR_SOLUTION',
      '3. Section drafting intent detected',
    );
    check(
      detectChatIntent('Give me a downloadable DOCX') === 'GENERATE_FILE',
      '4. DOCX generation intent detected',
    );
    check(
      detectChatIntent('Generate the final report using what you have') === 'GENERATE_FILE',
      '5. Complete report generation detected',
    );
    check(
      detectChatIntent('Generate the best final version') === 'GENERATE_FILE',
      '5b. Best-final-version wording is supported',
    );
    const normalized = normalizeGeneratedContent(structured, 'Fallback');
    check(
      normalized.subtitle.includes('[Student Name]'),
      '6. Missing identity remains a placeholder',
    );
    check(
      JSON.stringify(normalized).includes('[Reference metadata to verify]'),
      '7. Missing references remain verification placeholders',
    );
    let request;
    const generated = await generateDocumentContent({
      document: {
        title: 'Assignment',
        extractedText: 'Times New Roman 12, 1.5 spacing. Section 1.',
        aiAnalysis: { summary: 'Assignment' },
      },
      question: 'Create document with what you have',
      generate: async (value) => {
        request = value;
        return { text: JSON.stringify(structured), model: 'test-model' };
      },
    });
    check(
      generated.content.sections.length === 2,
      '8. Structured generation succeeds for incomplete source',
    );
    check(
      request.maxTokens === 4096 && request.userPrompt.length < 40000,
      '9. Generation uses bounded broad context and adaptive budget',
    );
    let invalid = false;
    try {
      normalizeGeneratedContent({ title: '', sections: [] }, '');
    } catch {
      invalid = true;
    }
    check(invalid, '10. Invalid AI structure is rejected');
    const buffer = await createDocxBuffer(normalized, 'Use Times New Roman 12 and 1.5 spacing');
    check(buffer.length > 1000, '11. Real non-empty DOCX is produced');
    check(buffer.subarray(0, 2).toString() === 'PK', '12. DOCX has a valid ZIP package signature');
    check(
      buffer.includes(Buffer.from('word/document.xml')),
      '13. DOCX package contains Word document XML',
    );

    await connectDB();
    const old = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = old.map((item) => item._id);
    if (oldIds.length)
      await Promise.all([
        Promise.all([
          Document.deleteMany({ userId: { $in: oldIds } }),
          DocumentChunk.deleteMany({ userId: { $in: oldIds } }),
        ]),
        DocumentChatMessage.deleteMany({ userId: { $in: oldIds } }),
        GeneratedDocument.deleteMany({ userId: { $in: oldIds } }),
        Task.deleteMany({ userId: { $in: oldIds } }),
        Reminder.deleteMany({ userId: { $in: oldIds } }),
      ]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const requestApi = async (route, { token, method = 'GET', body, binary = false } = {}) => {
      const response = await fetch(`${base}${route}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return {
        status: response.status,
        body: binary ? Buffer.from(await response.arrayBuffer()) : await response.json(),
      };
    };
    const register = async (name, email) =>
      (
        await requestApi('/api/auth/register', {
          method: 'POST',
          body: { fullName: name, email, password: 'Generation123' },
        })
      ).body;
    const [a, b] = await Promise.all([
      register('Generation A', EMAILS[0]),
      register('Generation B', EMAILS[1]),
    ]);
    ids = [a.user._id, b.user._id];
    const generateInvalid = await requestApi('/api/documents/generate', {
      token: a.token,
      method: 'POST',
      body: { prompt: 'Create Agile and Scrum report', format: 'rtf' },
    });
    check(
      generateInvalid.status === 400 && generateInvalid.body.success === false,
      '14a. Unsupported document format is rejected by the new generator route',
    );
    const doc = await Document.create({
      userId: a.user._id,
      title: 'Security Assignment',
      sourceType: 'text',
      extractedText: 'Times New Roman 12 and 1.5 spacing. Student details are not supplied.',
    });
    await Promise.all([
      Task.create({ userId: a.user._id, documentId: doc._id, title: 'Keep task' }),
      Reminder.create({
        userId: a.user._id,
        documentId: doc._id,
        title: 'Keep reminder',
        remindAt: new Date(Date.now() + 86400000),
      }),
    ]);
    let generationCalls = 0;
    setDocumentGeneratorForTests(async () => {
      generationCalls += 1;
      return { content: structured, model: 'test-model' };
    });
    const response = await requestApi(`/api/documents/${doc._id}/chat`, {
      token: a.token,
      method: 'POST',
      body: { message: 'Give me a downloadable DOCX' },
    });
    check(
      response.status === 201 && response.body.attachment?.format === 'docx',
      '14. Conversational request returns generated-file metadata',
    );
    const generatedId = response.body.attachment.generatedDocumentId;
    const record = await GeneratedDocument.findById(generatedId);
    check(
      record && record.size > 0 && (await fs.stat(resolveGeneratedFile(record.filePath))),
      '15. Generated file and metadata persist',
    );
    const own = await requestApi(`/api/documents/${doc._id}/generated/${generatedId}/download`, {
      token: a.token,
      binary: true,
    });
    check(
      own.status === 200 && own.body.subarray(0, 2).toString() === 'PK',
      '16. Owner securely downloads valid DOCX',
    );
    check(
      (
        await requestApi(`/api/documents/${doc._id}/generated/${generatedId}/download`, {
          token: b.token,
        })
      ).status === 404,
      '17. Cross-user generated-file access is blocked',
    );
    check(
      (
        await requestApi(
          `/api/documents/${doc._id}/generated/${new mongoose.Types.ObjectId()}/download`,
          { token: a.token },
        )
      ).status === 404,
      '18. Unknown generated-file ID returns controlled 404',
    );
    const history = await requestApi(`/api/documents/${doc._id}/chat`, { token: a.token });
    check(
      history.body.messages.some((item) => item.attachment?.generatedDocumentId),
      '19. Generated-file event persists in chat history',
    );
    const reused = await requestApi(`/api/documents/${doc._id}/chat`, {
      token: a.token,
      method: 'POST',
      body: { message: 'Give me a downloadable DOCX' },
    });
    check(
      reused.status === 201 && reused.body.reused === true && generationCalls === 1,
      '19b. Existing document exports with zero additional AI calls',
    );
    check(
      (await Document.exists({ _id: doc._id })) &&
        (await Task.exists({ documentId: doc._id })) &&
        (await Reminder.exists({ documentId: doc._id })),
      '20. Generation leaves source, tasks, and reminders unchanged',
    );
    const storedPath = resolveGeneratedFile(record.filePath);
    await requestApi(`/api/documents/${doc._id}`, { token: a.token, method: 'DELETE' });
    let remains = true;
    try {
      await fs.stat(storedPath);
    } catch (error) {
      if (error.code === 'ENOENT') remains = false;
    }
    check(
      !(await GeneratedDocument.exists({ _id: generatedId })) && !remains,
      '21. Source deletion cleans derivative metadata and file',
    );
    console.log('Document generation verification completed successfully.');
  } finally {
    setDocumentGeneratorForTests();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (ids.length) {
      const records = await GeneratedDocument.find({ userId: { $in: ids } }).lean();
      await Promise.all(
        records.map(({ filePath }) => {
          const value = resolveGeneratedFile(filePath);
          return value ? fs.unlink(value).catch(() => {}) : null;
        }),
      );
      await Promise.all([
        Promise.all([
          Document.deleteMany({ userId: { $in: ids } }),
          DocumentChunk.deleteMany({ userId: { $in: ids } }),
        ]),
        DocumentChatMessage.deleteMany({ userId: { $in: ids } }),
        GeneratedDocument.deleteMany({ userId: { $in: ids } }),
        Task.deleteMany({ userId: { $in: ids } }),
        Reminder.deleteMany({ userId: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    }
    if (mongoose.connection.readyState) await mongoose.connection.close();
  }
}
run().catch((error) => {
  console.error(`Document generation verification failed: ${error.message}`);
  process.exitCode = 1;
});
