import assert from 'node:assert/strict';
import { analyzeDocumentText } from '../services/documentAiService.js';
import {
  AiAnalysisValidationError,
  validateAiAnalysis,
} from '../services/aiAnalysisValidator.js';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(40, '.')} PASS`);
}

const validResponse = {
  summary: 'Submit the internship report by September 10.',
  category: 'university_notice',
  importantDates: [{ date: 'September 10, 2026', description: 'Submission deadline' }],
  extractedActions: [{ title: 'Submit report', description: 'Upload the final report.', priority: 'high' }],
  keyInformation: ['Submission is through the student portal.'],
  risksOrConsequences: ['Late reports may not be accepted.'],
};

async function run() {
  const valid = validateAiAnalysis(validResponse);
  check(valid.summary === validResponse.summary && valid.extractedActions.length === 1, 'Valid AI response');

  const missingSummary = validateAiAnalysis({ ...validResponse, summary: undefined });
  check(missingSummary.summary === '', 'Missing summary becomes safe empty value');

  const wrongTypes = validateAiAnalysis({
    summary: [], category: null, importantDates: 'tomorrow', extractedActions: null,
    keyInformation: {}, risksOrConsequences: 12,
  });
  check(wrongTypes.summary === '' && wrongTypes.category === '' && Object.values(wrongTypes).filter(Array.isArray).every((items) => items.length === 0), 'Wrong data types removed');

  const invalidActions = validateAiAnalysis({
    ...validResponse,
    extractedActions: [null, {}, { title: '', priority: 'low' }, { title: 'Keep this', description: 7 }],
  });
  check(invalidActions.extractedActions.length === 1 && invalidActions.extractedActions[0].title === 'Keep this', 'Invalid actions removed');

  const priorities = validateAiAnalysis({
    ...validResponse,
    extractedActions: [
      { title: 'Urgent action', description: '', priority: 'urgent' },
      { title: 'Missing priority', description: '' },
      { title: 'Unsupported priority', description: '', priority: 'critical' },
      { title: 'Uppercase priority', description: '', priority: 'LOW' },
    ],
  }).extractedActions.map((action) => action.priority);
  check(JSON.stringify(priorities) === JSON.stringify(['high', 'medium', 'medium', 'low']), 'Invalid priorities normalized');

  const dates = validateAiAnalysis({
    ...validResponse,
    importantDates: [
      { date: '2026-02-30', description: 'Impossible date' },
      { date: 'tomorrow', description: 'Ambiguous date' },
      { date: '2026-09-10', description: '' },
      { date: '2026-09-10', description: 'Valid deadline' },
    ],
  });
  check(dates.importantDates.length === 1 && dates.importantDates[0].description === 'Valid deadline', 'Invalid dates removed');

  assert.throws(() => validateAiAnalysis({}), AiAnalysisValidationError);
  assert.throws(() => validateAiAnalysis(null), AiAnalysisValidationError);
  check(true, 'Empty AI response fails safely');

  const extraFields = validateAiAnalysis({ ...validResponse, apiKey: 'must-not-pass', prompt: 'must-not-pass' });
  check(!Object.hasOwn(extraFields, 'apiKey') && !Object.hasOwn(extraFields, 'prompt'), 'Unknown fields ignored');

  const integrated = await analyzeDocumentText(
    { title: 'Validation test', category: 'other', extractedText: 'A safe test document.' },
    { generate: async () => ({ text: JSON.stringify({ ...validResponse, extra: true }), model: 'test-model' }) },
  );
  check(integrated.model === 'test-model' && integrated.summary === validResponse.summary && !Object.hasOwn(integrated, 'extra'), 'Existing document analysis still works');

  const unsafeStrings = validateAiAnalysis({
    ...validResponse,
    keyInformation: ['', {}, '  valid\0 value  ', 5],
    risksOrConsequences: [null, '  safe risk  '],
    category: 'invented_category',
  });
  check(unsafeStrings.keyInformation.length === 1 && unsafeStrings.keyInformation[0] === 'valid value' && unsafeStrings.risksOrConsequences.length === 1 && unsafeStrings.category === '', 'Strings and category sanitized');

  console.log('AI validation verification completed successfully.');
}

run().catch((error) => {
  console.error(`AI validation verification failed: ${error.message}`);
  process.exitCode = 1;
});
