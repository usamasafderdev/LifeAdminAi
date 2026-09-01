import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { setDocumentAnalyzerForTests } from '../controllers/documentController.js';
import { AiError } from '../services/ai/aiService.js';
import { DocumentAiError } from '../services/documentAiService.js';

const EMAILS = ['document-ai-a@lifeadmin.local', 'document-ai-b@lifeadmin.local'];
const PASSWORD = 'DocumentAiTest123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(43, '.')} PASS`);
}

const validAnalysis = {
  actionRequired: true,
  summary: 'The internship report is due on September 10.',
  category: 'university_notice',
  importantDates: [{ date: 'September 10', description: 'Internship report deadline' }],
  extractedActions: [{ title: 'Submit report', description: 'Submit the internship report.', priority: 'high' }],
  keyInformation: ['Submission is required.'],
  risksOrConsequences: ['Late submission may not be accepted.'],
  model: 'test-model',
};

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

    setDocumentAnalyzerForTests(async ({ title }) => {
      if (title === 'Invalid AI response') throw new DocumentAiError();
      if (title === 'Provider failure') throw new AiError('AI_PROVIDER_UNAVAILABLE', { statusCode: 503 });
      return validAnalysis;
    });

    httpServer = app.listen(0);
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const register = (name, email) => request('/api/auth/register', {
      method: 'POST', body: { fullName: name, email, password: PASSWORD },
    });
    const [userA, userB] = await Promise.all([
      register('Document AI User A', EMAILS[0]),
      register('Document AI User B', EMAILS[1]),
    ]);
    testUserIds = [userA.body.user._id, userB.body.user._id];
    const create = (token, title, extractedText = 'Submit the report by September 10.') => request('/api/documents', {
      method: 'POST', token, body: { title, sourceType: 'text', category: 'university_notice', extractedText },
    });

    const owned = await create(userA.body.token, 'Owned document');
    const other = await create(userB.body.token, 'Other user document');
    const empty = await create(userA.body.token, 'Empty document', '');
    const invalid = await create(userA.body.token, 'Invalid AI response');
    const unavailable = await create(userA.body.token, 'Provider failure');
    const previouslyConfirmed = await Document.create({
      userId: userA.body.user._id,
      title: 'Previously confirmed assignment',
      sourceType: 'text',
      category: 'university_notice',
      extractedText: 'Complete and submit the new assignment.',
      aiAnalysis: {
        ...validAnalysis,
        status: 'completed',
        reviewStatus: 'confirmed',
        reviewedAt: new Date(),
        confirmedBy: userA.body.user._id,
        confirmedAnalysis: {
          actionRequired: true,
          summary: 'Old confirmed analysis',
          category: 'university_notice',
          importantDates: [],
          extractedActions: [{ title: 'Old confirmed task', description: 'Old proposal.', priority: 'medium' }],
          keyInformation: [],
          risksOrConsequences: [],
        },
      },
    });

    check((await request(`/api/documents/${owned.body.document._id}/analyze`, { method: 'POST' })).status === 401, 'Authentication required');
    const analyzed = await request(`/api/documents/${owned.body.document._id}/analyze`, { method: 'POST', token: userA.body.token });
    check(analyzed.status === 200 && analyzed.body.analysis.status === 'completed', 'User can analyze own document');
    check((await request(`/api/documents/${other.body.document._id}/analyze`, { method: 'POST', token: userA.body.token })).status === 404, 'Cross-user analysis hidden');
    check((await request(`/api/documents/${empty.body.document._id}/analyze`, { method: 'POST', token: userA.body.token })).status === 400, 'Empty extracted text rejected');

    const stored = await Document.findById(owned.body.document._id);
    check(stored.aiAnalysis.summary === validAnalysis.summary && stored.aiAnalysis.model === 'test-model', 'AI response stored');
    const cached = await request(`/api/documents/${owned.body.document._id}/analyze`, { method: 'POST', token: userA.body.token });
    check(cached.status === 200 && cached.body.cached === true, 'Completed analysis reused');

    const regenerated = await request(`/api/documents/${previouslyConfirmed._id}/analyze`, { method: 'POST', token: userA.body.token, body: { regenerate: true } });
    check(regenerated.status === 200 && regenerated.body.cached === false && regenerated.body.analysis.reviewStatus === 'pending_review', 'Analyze Again regenerates with current analyzer');
    check(!regenerated.body.analysis.confirmedAnalysis && !regenerated.body.analysis.confirmedBy, 'Reanalysis invalidates old confirmation');
    const regeneratedStored = await Document.findById(previouslyConfirmed._id);
    check(regeneratedStored.aiAnalysis.extractedActions.length === validAnalysis.extractedActions.length && !regeneratedStored.aiAnalysis.confirmedAnalysis, 'New proposal replaces old confirmed state');

    const invalidResult = await request(`/api/documents/${invalid.body.document._id}/analyze`, { method: 'POST', token: userA.body.token });
    const invalidStored = await Document.findById(invalid.body.document._id);
    check(invalidResult.status === 502 && invalidStored.aiAnalysis.status === 'failed' && !invalidStored.aiAnalysis.summary, 'Invalid AI response handled');
    const unavailableResult = await request(`/api/documents/${unavailable.body.document._id}/analyze`, { method: 'POST', token: userA.body.token });
    check(unavailableResult.status === 503 && unavailableResult.body.message === 'The AI provider is temporarily unavailable.', 'AI failure handled safely');

    const legacy = await create(userA.body.token, 'Legacy-style document');
    const legacyResult = await request(`/api/documents/${legacy.body.document._id}`, { token: userA.body.token });
    check(legacyResult.status === 200 && legacyResult.body.document.aiAnalysis === undefined, 'Documents without AI data still work');
    console.log('Document AI verification completed successfully.');
  } catch (error) {
    console.error(`Document AI verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    setDocumentAnalyzerForTests();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    if (mongoose.connection.readyState) {
      if (testUserIds.length) await Document.deleteMany({ userId: { $in: testUserIds } });
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
