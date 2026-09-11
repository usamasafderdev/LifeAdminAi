import { analyzeDocumentText, DOCUMENT_ANALYSIS_SCHEMA, SYSTEM_PROMPT } from '../services/documentAiService.js';
import { associateActionDueDates } from '../services/documentDeadlineService.js';

const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(62, '.')} PASS`); };
const base = { actionRequired: false, summary: '', category: 'other', importantDates: [], extractedActions: [], keyInformation: [], risksOrConsequences: [] };

async function run() {
  const deadline = '2026-09-08T23:59:00';
  const assignment = await analyzeDocumentText({ title: 'Assignment 2', category: 'university_notice', extractedText: 'Assignment 2 must be submitted by September 8, 2026 at 11:59 PM. Prepare a report, schedule, Gantt chart, risks, final PDF and upload it.' }, { generate: async () => ({ model: 'quality-test', text: JSON.stringify({ ...base, actionRequired: true, summary: 'Assignment requiring a report, supporting project artifacts, final review, and Moodle submission.', importantDates: [{ date: deadline, description: 'Assignment submission deadline' }], extractedActions: [
    { title: 'Write the Agile and Scrum report', description: 'Prepare the 1,500-word report with five Harvard references.', priority: 'medium' },
    { title: 'Create the project schedule and Gantt chart', description: 'Include tasks, durations and dependencies.', priority: 'medium' },
    { title: 'Complete project risk analysis', description: 'Document five risks and mitigation strategies.', priority: 'medium' },
    { title: 'Review and finalize the assignment', description: 'Check grammar, formatting and student details, then export PDF.', priority: 'medium' },
    { title: 'Submit the final assignment', description: 'Upload the PDF to Moodle.', priority: 'high' },
  ], keyInformation: ['Minimum five academic sources', 'Harvard referencing style', 'Final format is PDF', 'Submission platform is Moodle'], risksOrConsequences: [] }) }) });
  check(assignment.actionRequired && assignment.extractedActions.length === 5, '1. Assignment produces five meaningful grouped actions');
  check(assignment.importantDates[0].date === deadline, '2. Explicit date and time are preserved');
  check(assignment.extractedActions.every((action) => action.dueDate === deadline), '3. One overall deadline is inherited by related work');
  check(assignment.keyInformation.length === 4, '4. Key information remains selective');
  const multiple = associateActionDueDates({ ...base, actionRequired: true, importantDates: [{ date: '2026-09-05', description: 'Registration deadline' }, { date: '2026-09-10', description: 'Payment due date' }, { date: '2026-09-15T10:00:00', description: 'Interview meeting' }], extractedActions: [{ title: 'Complete registration', description: '', priority: 'medium' }, { title: 'Pay application fee', description: 'Complete payment.', priority: 'medium' }, { title: 'Attend interview', description: 'Join the interview meeting.', priority: 'medium' }] });
  check(multiple.extractedActions.map((action) => action.dueDate).join('|') === '2026-09-05|2026-09-10|2026-09-15T10:00:00', '5. Multiple deadlines associate by explicit context');
  check(DOCUMENT_ANALYSIS_SCHEMA.properties.extractedActions.items.properties.dueDate.type === 'string', '6. AI schema permits action dueDate');
  check(SYSTEM_PROMPT.includes('meaningful pieces of work') && SYSTEM_PROMPT.includes('overall submission'), '7. Prompt enforces consolidation and deadline inheritance');
  const cv = await analyzeDocumentText({ title: 'CV', category: 'information', extractedText: 'Developed applications and worked at XYZ.' }, { generate: async () => ({ model: 'quality-test', text: JSON.stringify({ ...base, summary: 'Professional experience.' }) }) });
  check(!cv.actionRequired && cv.extractedActions.length === 0, '8. CV remains non-actionable');
  const bill = associateActionDueDates({ ...base, actionRequired: true, importantDates: [{ date: '2026-09-10', description: 'Electricity payment due date' }], extractedActions: [{ title: 'Pay electricity bill', description: 'Pay the balance.', priority: 'high' }] });
  check(bill.extractedActions.length === 1 && bill.extractedActions[0].dueDate === '2026-09-10', '9. Bill payment receives its due date');
  const meeting = associateActionDueDates({ ...base, actionRequired: true, importantDates: [{ date: '2026-09-15T10:00:00', description: 'Review meeting date' }], extractedActions: [{ title: 'Prepare for review meeting', description: 'Review the agenda.', priority: 'medium' }, { title: 'Attend review meeting', description: 'Join the scheduled meeting.', priority: 'medium' }] });
  check(meeting.extractedActions.every((action) => action.dueDate), '10. Meeting preparation and attendance receive meeting date');
  let attempts = 0;
  const recovered = await analyzeDocumentText({ title: 'Retry malformed output', category: 'other', extractedText: 'Submit the form by September 10.' }, { generate: async ({ temperature, userPrompt }) => {
    attempts += 1;
    if (attempts === 1) return { model: 'quality-test', text: 'not valid json' };
    check(temperature === 0 && userPrompt.includes('previous response was not valid'), '11. Validation retry uses stricter correction request');
    return { model: 'quality-test', text: JSON.stringify({ ...base, actionRequired: true, extractedActions: [{ title: 'Submit the form', description: 'Submit the required form.', priority: 'medium' }] }) };
  } });
  check(attempts === 2 && recovered.extractedActions.length === 1, '12. Malformed AI output is retried once and recovered');
  console.log('Analysis quality verification completed successfully.');
}
run().catch((error) => { console.error(`Analysis quality verification failed: ${error.message}`); process.exitCode = 1; });
