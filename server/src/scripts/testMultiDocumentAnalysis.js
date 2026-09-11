import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import DocumentRelationship from '../models/DocumentRelationship.js';
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
  await Promise.all([User.init(), Document.init(), DocumentRelationship.init()]);

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

  const base = `http://127.0.0.1:${server.address().port}/api/documents`;
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

  const docA = await Document.create({
    userId: owner._id,
    title: 'Assignment one',
    sourceType: 'text',
    category: 'university_notice',
    extractedText: 'Submit report by 2026-09-20. Deadline is 2026-09-20.',
  });
  const docB = await Document.create({
    userId: owner._id,
    title: 'Assignment two',
    sourceType: 'text',
    category: 'university_notice',
    extractedText: 'Submit report by 2026-09-20. Deadline is 2026-09-20.',
  });
  const docC = await Document.create({
    userId: owner._id,
    title: 'Assignment conflict',
    sourceType: 'text',
    category: 'university_notice',
    extractedText: 'Submit report by 2026-09-25. Deadline is 2026-09-25.',
  });
  const foreign = await Document.create({
    userId: other._id,
    title: 'Foreign document',
    sourceType: 'text',
    category: 'other',
    extractedText: 'Unrelated data.',
  });

  const analyzed = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docA._id), String(docB._id)],
  });
  check(analyzed.connections.length >= 1, 'Two related documents produce a relationship');
  const rows = await DocumentRelationship.find({
    userId: owner._id,
    documentA: docA._id,
    documentB: docB._id,
  });
  check(
    rows.some((row) => row.relationshipType === 'related' || row.relationshipType === 'supporting'),
    'Persisted relationship row is stored',
  );

  const conflictAnalyzed = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docA._id), String(docC._id)],
  });
  check(conflictAnalyzed.conflicts.length >= 1, 'Two conflicting deadlines detect a conflict');

  const access = await req('/analyze-together', {
    method: 'POST',
    body: { documentIds: [String(docA._id), String(foreign._id)] },
  });
  check(access.status === 404 || access.status === 403, 'Different user document access is denied');

  const large = await Document.create({
    userId: owner._id,
    title: 'Large document',
    sourceType: 'text',
    category: 'other',
    extractedText: 'word '.repeat(20000),
  });
  const largeResult = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docA._id), String(large._id)],
  });
  check(
    largeResult.summary && largeResult.summary.length > 0,
    'Large document is processed safely with bounded context',
  );

  const doc = await Document.create({
    userId: owner._id,
    title: 'Action doc',
    sourceType: 'text',
    category: 'other',
    extractedText: 'Submit the final report by 2026-09-20.',
  });
  const suggestion = await generateMultiDocumentAnalysis({
    userId: owner._id,
    documentIds: [String(docA._id), String(doc._id)],
  });
  check(
    suggestion.suggestedActions.length >= 1,
    'Suggested actions are returned in structured output',
  );

  check(checks.length >= 6, 'Multi-document checks ran');
  console.log('FEATURE8_TESTS_OK');
} finally {
  if (mongoose.connection.readyState) await mongoose.disconnect();
}
