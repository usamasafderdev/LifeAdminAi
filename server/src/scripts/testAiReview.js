import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import User from '../models/User.js';

const EMAILS = ['ai-review-a@lifeadmin.local', 'ai-review-b@lifeadmin.local'];
const PASSWORD = 'AiReviewTest123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(47, '.')} PASS`);
}

const aiSuggestion = {
  status: 'completed',
  summary: 'AI original summary',
  category: 'university_notice',
  importantDates: [{ date: '2026-09-10', description: 'Original deadline' }],
  extractedActions: [{ title: 'Submit report', description: 'Original action', priority: 'high' }],
  keyInformation: ['Original information'],
  risksOrConsequences: ['Original risk'],
  model: 'test-model',
  analyzedAt: new Date(),
  reviewStatus: 'pending_review',
};

const confirmedEdit = {
  summary: 'User corrected summary',
  category: 'information',
  importantDates: [{ date: '2026-09-11', description: 'User-confirmed deadline' }],
  extractedActions: [{ title: 'Submit corrected report', description: 'User-confirmed action', priority: 'medium' }],
  keyInformation: ['User-confirmed information'],
  risksOrConsequences: ['User-confirmed risk'],
};

async function run() {
  let server;
  let userIds = [];
  try {
    await connectDB();
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Document.deleteMany({ userId: { $in: oldIds } });
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
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
    const [a, b] = await Promise.all([register('AI Review A', EMAILS[0]), register('AI Review B', EMAILS[1])]);
    userIds = [a.body.user._id, b.body.user._id];
    const [owned, rejected, legacy] = await Promise.all([
      Document.create({ userId: a.body.user._id, title: 'Review document', sourceType: 'text', extractedText: 'Review text', aiAnalysis: aiSuggestion }),
      Document.create({ userId: a.body.user._id, title: 'Reject document', sourceType: 'text', extractedText: 'Reject text', aiAnalysis: aiSuggestion }),
      Document.create({ userId: a.body.user._id, title: 'Legacy document', sourceType: 'manual', extractedText: 'Legacy text' }),
    ]);

    check((await request(`/api/documents/${owned._id}/analysis`)).status === 401, 'Authentication required');
    const review = await request(`/api/documents/${owned._id}/analysis`, { token: a.body.token });
    check(review.status === 200 && review.body.reviewStatus === 'pending_review' && review.body.aiAnalysis.summary === aiSuggestion.summary, 'Owner can fetch review data');
    check((await request(`/api/documents/${owned._id}/analysis`, { token: b.body.token })).status === 404, 'Cross-user review access hidden');

    const confirmed = await request(`/api/documents/${owned._id}/analysis/confirm`, {
      method: 'POST', token: a.body.token, body: { analysis: confirmedEdit },
    });
    check(confirmed.status === 200 && confirmed.body.reviewStatus === 'confirmed', 'Owner can confirm analysis');
    check(confirmed.body.confirmedAnalysis.summary === confirmedEdit.summary && confirmed.body.confirmedAnalysis.extractedActions[0].priority === 'medium', 'Confirmation data validated');

    const invalid = await request(`/api/documents/${owned._id}/analysis/confirm`, {
      method: 'POST', token: a.body.token, body: { analysis: { ...confirmedEdit, extractedActions: [{ title: 'Unsafe', description: '', priority: 'urgent' }] } },
    });
    check(invalid.status === 400 && invalid.body.message === 'Invalid confirmed analysis data', 'Invalid user input rejected');

    const rejection = await request(`/api/documents/${rejected._id}/analysis/reject`, { method: 'POST', token: a.body.token });
    check(rejection.status === 200 && rejection.body.reviewStatus === 'rejected', 'Reject workflow works');

    const stored = await Document.findById(owned._id);
    check(stored.aiAnalysis.summary === aiSuggestion.summary && stored.aiAnalysis.extractedActions[0].description === 'Original action', 'Original AI analysis remains unchanged');
    check(stored.aiAnalysis.confirmedAnalysis.summary === confirmedEdit.summary && String(stored.aiAnalysis.confirmedBy) === String(a.body.user._id), 'Confirmed analysis persists');
    const refreshed = await request(`/api/documents/${owned._id}/analysis`, { token: a.body.token });
    check(refreshed.body.reviewStatus === 'confirmed' && refreshed.body.confirmedAnalysis.summary === confirmedEdit.summary, 'Confirmed analysis survives refresh');

    const legacyResult = await request(`/api/documents/${legacy._id}/analysis`, { token: a.body.token });
    check(legacyResult.status === 200 && legacyResult.body.aiAnalysis === null && legacyResult.body.reviewStatus === null, 'Legacy documents still work');
    console.log('AI review verification completed successfully.');
  } catch (error) {
    console.error(`AI review verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      if (userIds.length) await Document.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
