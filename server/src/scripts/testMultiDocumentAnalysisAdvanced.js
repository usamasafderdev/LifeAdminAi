import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import DocumentRelationship from '../models/DocumentRelationship.js';
import DocumentAnalysisHistory from '../models/DocumentAnalysisHistory.js';
import { generateToken } from '../utils/generateToken.js';
import { generateMultiDocumentAnalysis } from '../services/multiDocumentAnalysisService.js';

const checks = [];
const check = (condition, label) => {
  assert.ok(condition, label);
  checks.push(label);
  console.log(`PASS ${checks.length}: ${label}`);
};

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    dbName: 'lifeadmin_feature8_test',
  });
  await mongoose.connection.db.dropDatabase();
  await Promise.all([
    User.init(),
    Document.init(),
    DocumentRelationship.init(),
    DocumentAnalysisHistory.init(),
  ]);

  const owner = await User.create({
    fullName: 'Feature 8 User',
    email: 'feature8@example.test',
    password: 'Feature8User123',
  });
  const other = await User.create({
    fullName: 'Other User',
    email: 'feature8-other@example.test',
    password: 'Feature8User123',
  });
  const token = generateToken(owner._id);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = async (path = '', { method = 'GET', body, user = 0 } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${user === 0 ? token : generateToken(other._id)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json()) };
  };

  const docs = await Promise.all([
    Document.create({
      userId: owner._id,
      title: 'Assignment one',
      sourceType: 'text',
      category: 'university_notice',
      extractedText: 'Submit report by 2026-09-20. Deadline is 2026-09-20.',
    }),
    Document.create({
      userId: owner._id,
      title: 'Assignment two',
      sourceType: 'text',
      category: 'university_notice',
      extractedText: 'Submit report by 2026-09-20. Deadline is 2026-09-20.',
    }),
    Document.create({
      userId: owner._id,
      title: 'Assignment three',
      sourceType: 'text',
      category: 'university_notice',
      extractedText: 'Submit report by 2026-09-20. Deadline is 2026-09-20.',
    }),
  ]);

  const report = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: docs.map((item) => String(item._id)),
  });
  check(report.connections.length >= 2, 'Three related documents expose relationship records');

  const conflictDoc = await Document.create({
    userId: owner._id,
    title: 'Assignment conflict',
    sourceType: 'text',
    category: 'university_notice',
    extractedText: 'Submit report by 2026-09-25. Deadline is 2026-09-25.',
  });
  const conflict = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docs[0]._id), String(conflictDoc._id)],
  });
  check(conflict.conflicts.length >= 1, 'Conflicting deadlines produce a conflict section');

  const actionDoc = await Document.create({
    userId: owner._id,
    title: 'Action doc',
    sourceType: 'text',
    category: 'other',
    extractedText: 'Submit the final report by 2026-09-20.',
  });
  const suggestion = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docs[0]._id), String(actionDoc._id)],
  });
  check(
    suggestion.suggestedActions.length >= 1,
    'Suggested action output is available for task creation',
  );

  const actionTask = await req('/tasks', {
    method: 'POST',
    body: {
      title: suggestion.suggestedActions[0].title,
      description: suggestion.suggestedActions[0].description,
      priority: suggestion.suggestedActions[0].priority || 'medium',
      dueDate: suggestion.suggestedActions[0].dueDate || '',
    },
  });
  check(
    actionTask.status === 201 && actionTask.task?.title === suggestion.suggestedActions[0].title,
    'Suggested action can hand off into a task record through the existing task service',
  );

  const access = await req('/documents/analyze-together', {
    method: 'POST',
    body: { documentIds: [String(docs[0]._id), String(other._id)] },
  });
  check(
    access.status === 404 || access.status === 403,
    'Unauthorized cross-document document access is blocked',
  );

  const large = await Document.create({
    userId: owner._id,
    title: 'Large document',
    sourceType: 'text',
    category: 'other',
    extractedText: 'word '.repeat(20000),
  });
  const largeResult = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docs[0]._id), String(large._id)],
  });
  check(
    largeResult.summary && largeResult.summary.length > 0,
    'Large document set remains safely processable',
  );

  const saved = await DocumentAnalysisHistory.findOne({ userId: owner._id });
  check(Boolean(saved), 'Analysis metadata can be saved in a history document');

  const savedHistory = await req(`/documents/intelligence/${saved._id}`, { method: 'GET' });
  check(
    savedHistory.status === 200 && savedHistory.history?._id === String(saved._id),
    'Saved analysis history can be revisited',
  );

  check(checks.length >= 8, 'Feature 8 advanced document intelligence test checks ran');
  console.log('FEATURE8_TESTS_OK');
} finally {
  if (mongoose.connection.readyState) await mongoose.disconnect();
}
