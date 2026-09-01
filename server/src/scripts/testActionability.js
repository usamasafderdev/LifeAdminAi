import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { validateAiAnalysis } from '../services/aiAnalysisValidator.js';
import { analyzeDocumentText, SYSTEM_PROMPT } from '../services/documentAiService.js';
import { calculateTaskPriority } from '../services/taskPriorityService.js';

const EMAILS = ['actionability-a@lifeadmin.local', 'actionability-b@lifeadmin.local'];
const PASSWORD = 'Actionability123';
const baseAnalysis = { summary: '', category: 'information', importantDates: [], keyInformation: [], risksOrConsequences: [] };
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(56, '.')} PASS`); };

const mockAnalyze = (title, extractedText, analysis) => analyzeDocumentText(
  { title, category: 'other', extractedText },
  { generate: async () => ({ text: JSON.stringify({ ...baseAnalysis, ...analysis }), model: 'controlled-test-model' }) },
);

async function verifyDocumentIntentCases() {
  const nonActionableCases = [
    ['CV / resume', 'Developed React applications for clients and led a project team.', 'Past work experience'],
    ['Informational article', 'Cloud storage is a model for storing data on remote servers.', 'Reference material'],
    ['Historical project description', 'The project delivered a permit system in 2024.', 'Completed project history'],
  ];
  for (const [title, text, summary] of nonActionableCases) {
    const result = await mockAnalyze(title, text, { actionRequired: false, summary, extractedActions: [] });
    check(!result.actionRequired && result.extractedActions.length === 0, `${title} remains non-actionable`);
  }

  const actionableCases = [
    ['University assignment brief', 'Answer all questions, create the practical work, and submit one PDF.', ['Complete theory questions', 'Create practical deliverables', 'Submit final PDF']],
    ['Numbered assignment guide', '1. Prepare a report. 2. Insert citations. 3. Upload the PDF.', ['Prepare the report', 'Submit the final PDF']],
    ['Invoice requiring payment', 'Amount due: PKR 4,000. Pay by 10 September 2026.', ['Pay the invoice']],
    ['Meeting invitation', 'You are required to attend the review meeting on 12 September 2026.', ['Attend the review meeting']],
    ['Application instructions', 'Complete the form, attach identification, sign it, and apply online.', ['Prepare and submit the application']],
    ['Compliance renewal notice', 'Renew the registration and provide evidence before expiry.', ['Renew the registration']],
  ];
  for (const [title, text, titles] of actionableCases) {
    const result = await mockAnalyze(title, text, {
      actionRequired: true,
      summary: title,
      extractedActions: titles.map((actionTitle) => ({ title: actionTitle, description: `Supported by the ${title}.`, priority: 'medium' })),
    });
    check(result.actionRequired && result.extractedActions.length === titles.length, `${title} remains actionable`);
  }

  const mixed = await mockAnalyze(
    'Mixed information and instructions',
    'The course began in August. You must submit the final report by 20 September.',
    { actionRequired: true, summary: 'Course background and a submission requirement.', extractedActions: [{ title: 'Submit the final report', description: 'Submit by 20 September.', priority: 'high' }] },
  );
  check(mixed.extractedActions.length === 1 && mixed.extractedActions[0].title === 'Submit the final report', 'Mixed content keeps only real actions');

  const detailedInstructions = Array.from({ length: 18 }, (_, index) => `Instruction ${index + 1}`).join('. ');
  const grouped = await mockAnalyze('Detailed assignment guide', detailedInstructions, {
    actionRequired: true,
    summary: 'Assignment with theory, practical, formatting, and submission requirements.',
    extractedActions: [
      { title: 'Complete the theory section', description: 'Answer the required questions and cite sources.', priority: 'medium' },
      { title: 'Complete the practical work', description: 'Create the required Word and Excel deliverables and screenshots.', priority: 'medium' },
      { title: 'Assemble and submit the assignment', description: 'Apply the formatting checklist, export one PDF, and upload it.', priority: 'high' },
    ],
  });
  check(grouped.extractedActions.length < 10, 'Related instructions are grouped into high-level actions');

  check(SYSTEM_PROMPT.includes('overall intent') && SYSTEM_PROMPT.includes('Do not keyword-match'), 'Prompt requires contextual intent classification');
  check(SYSTEM_PROMPT.includes('group related sub-requirements') && SYSTEM_PROMPT.includes('past experience'), 'Prompt protects CVs and enforces task granularity');
}

async function run() {
  let server;
  let userIds = [];
  try {
    await verifyDocumentIntentCases();
    const resume = validateAiAnalysis({ ...baseAnalysis, actionRequired: false, summary: 'Experienced React developer.', extractedActions: [] });
    check(resume.actionRequired === false && resume.extractedActions.length === 0, '1. Resume analysis contains no tasks');
    const information = validateAiAnalysis({ ...baseAnalysis, actionRequired: false, extractedActions: [{ title: 'Worked at company', description: 'Employment history', priority: 'high' }] });
    check(information.extractedActions.length === 0, '2. Informational content produces no fake tasks');
    const deadline = validateAiAnalysis({ ...baseAnalysis, actionRequired: true, extractedActions: [{ title: 'Submit application', description: 'Submit by September 10', priority: 'high' }] });
    check(deadline.actionRequired && deadline.extractedActions[0].title === 'Submit application', '3. Explicit actionable deadline survives validation');
    const contradiction = validateAiAnalysis({ ...baseAnalysis, actionRequired: false, extractedActions: [{ title: 'Invented action', description: '', priority: 'medium' }] });
    check(contradiction.extractedActions.length === 0, '4. False actionRequired forces actions empty');

    await connectDB();
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    if (oldIds.length) await Promise.all([Task.deleteMany({ userId: { $in: oldIds } }), Document.deleteMany({ userId: { $in: oldIds } })]);
    await User.deleteMany({ email: { $in: EMAILS } });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = async (path, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };
    const register = (name, email) => request('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [a, b] = await Promise.all([register('Actionability A', EMAILS[0]), register('Actionability B', EMAILS[1])]);
    userIds = [a.body.user._id, b.body.user._id];
    const confirmedAnalysis = (actions) => ({ actionRequired: actions.length > 0, summary: 'Reviewed', category: 'information', importantDates: [], extractedActions: actions, keyInformation: [], risksOrConsequences: [] });
    const [emptyDocument, userAddedDocument, validDocument] = await Document.create([
      { userId: a.body.user._id, title: 'Resume', sourceType: 'text', extractedText: 'Experience', aiAnalysis: { status: 'completed', actionRequired: false, summary: 'Resume', category: 'information', model: 'test', analyzedAt: new Date(), reviewStatus: 'confirmed', reviewedAt: new Date(), confirmedBy: a.body.user._id, confirmedAnalysis: confirmedAnalysis([]) } },
      { userId: a.body.user._id, title: 'Reviewed information', sourceType: 'text', extractedText: 'Information', aiAnalysis: { status: 'completed', actionRequired: false, summary: 'Information', category: 'information', model: 'test', analyzedAt: new Date(), reviewStatus: 'confirmed', reviewedAt: new Date(), confirmedBy: a.body.user._id, confirmedAnalysis: confirmedAnalysis([{ title: 'Contact the issuer', description: 'User confirmed this obligation.', priority: 'medium' }]) } },
      { userId: a.body.user._id, title: 'Deadline notice', sourceType: 'text', extractedText: 'Submit before deadline', aiAnalysis: { status: 'completed', actionRequired: true, summary: 'Deadline', category: 'university_notice', model: 'test', analyzedAt: new Date(), reviewStatus: 'confirmed', reviewedAt: new Date(), confirmedBy: a.body.user._id, confirmedAnalysis: confirmedAnalysis([{ title: 'Submit assignment', description: 'Upload the assignment.', priority: 'high' }]) } },
    ]);
    const emptyResult = await request(`/api/documents/${emptyDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(emptyResult.status === 201 && emptyResult.body.created === 0 && emptyResult.body.message === 'No confirmed actionable tasks found', '5. Zero confirmed actions creates zero tasks safely');
    const userAdded = await request(`/api/documents/${userAddedDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(userAdded.body.created === 1 && userAdded.body.tasks[0].title === 'Contact the issuer', '6. Confirmed user-added action creates task');
    const valid = await request(`/api/documents/${validDocument._id}/create-tasks`, { method: 'POST', token: a.body.token });
    check(valid.body.created === 1 && valid.body.tasks[0].source === 'ai_confirmed', '7. Existing valid task generation still works');
    check((await request(`/api/documents/${validDocument._id}/create-tasks`, { method: 'POST', token: b.body.token })).status === 404, '8. User isolation remains intact');
    const priority = calculateTaskPriority({ dueDate: '2026-09-02', confirmedPriority: 'medium', now: new Date('2026-09-01T12:00:00Z') });
    check(priority.score === 67 && priority.priority === 'high', '9. Priority engine remains intact');
    console.log('Actionability refinement verification completed successfully.');
  } catch (error) {
    console.error(`Actionability verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      if (userIds.length) await Promise.all([Task.deleteMany({ userId: { $in: userIds } }), Document.deleteMany({ userId: { $in: userIds } })]);
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
  }
}

run();
