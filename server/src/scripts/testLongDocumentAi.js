import assert from 'node:assert/strict';
import { analyzeDocumentText } from '../services/documentAiService.js';
import { DocumentTooLargeError, splitDocumentIntoChunks } from '../services/documentChunkingService.js';
import { mergeDocumentAnalyses } from '../services/documentAnalysisMergeService.js';

const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(58, '.')} PASS`); };
const empty = { actionRequired: false, summary: '', category: 'other', importantDates: [], extractedActions: [], keyInformation: [], risksOrConsequences: [] };

async function run() {
  const config = { directCharLimit: 100, chunkSize: 80, chunkOverlap: 10, maxChunks: 10, maxAnalysisChars: 600 };
  const shortCalls = [];
  await analyzeDocumentText(
    { title: 'Short', category: 'other', extractedText: 'A short informational document.' },
    { chunkingConfig: config, generate: async (request) => { shortCalls.push(request); return { text: JSON.stringify(empty), model: 'test' }; } },
  );
  check(shortCalls.length === 1 && shortCalls[0].userPrompt.includes('Document text:'), '1. Small document uses direct analysis');

  const source = `SECTION 1\n${'A'.repeat(65)}\n\nSECTION 2\n${'B'.repeat(65)}\n\nFINAL SUBMISSION\n${'C'.repeat(65)}`;
  const chunks = splitDocumentIntoChunks(source, config);
  check(chunks.length > 1, '2. Long document uses multiple semantic chunks');
  for (let index = 0; index < source.length; index += 1) {
    const sample = source.slice(index, Math.min(source.length, index + 8));
    if (sample) assert.ok(chunks.some((chunk) => chunk.includes(sample)));
  }
  check(true, '3. Every source region is preserved by chunk coverage');
  check(chunks.some((chunk) => chunk.includes('SECTION 2')) && chunks.some((chunk) => chunk.includes('FINAL SUBMISSION')), '4. Section boundaries remain available');

  let active = 0;
  let maxActive = 0;
  const requests = [];
  const responses = [
    { ...empty, actionRequired: true, summary: 'Theory requirements.', extractedActions: [{ title: 'Complete theory section', description: 'Answer all questions.', priority: 'medium' }], keyInformation: ['Use citations'] },
    { ...empty, actionRequired: true, summary: 'Practical requirements.', extractedActions: [{ title: 'Complete practical work', description: 'Create the deliverable.', priority: 'medium' }, { title: 'Complete theory section', description: 'Duplicate overlap action.', priority: 'medium' }] },
    { ...empty, actionRequired: true, summary: 'Submission requirements.', extractedActions: [{ title: 'Submit final assignment', description: 'Upload the PDF.', priority: 'high' }], risksOrConsequences: ['Late work may be rejected'] },
  ];
  const analyzed = await analyzeDocumentText(
    { title: 'Long assignment', category: 'other', extractedText: source },
    { chunkingConfig: config, generate: async (request) => {
      const call = requests.length;
      requests.push(request);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { text: JSON.stringify(responses[Math.min(call, responses.length - 1)]), model: 'test' };
    } },
  );
  check(requests.length === chunks.length && requests.every((request) => request.userPrompt.includes('Analyze section')), '5. Every chunk is analyzed without truncation');
  check(maxActive === 1, '6. Chunk provider calls are sequential');
  check(analyzed.actionRequired && analyzed.extractedActions.length === 3, '7. Merged assignment remains actionable and deduplicated');
  check(analyzed.keyInformation.includes('Use citations') && analyzed.risksOrConsequences.length === 1, '8. Chunk facts and risks merge correctly');

  const mergedCv = mergeDocumentAnalyses([{ ...empty, summary: 'Employment history.' }, { ...empty, summary: 'Education history.' }]);
  check(!mergedCv.actionRequired && mergedCv.extractedActions.length === 0, '9. Multi-chunk CV remains non-actionable');
  assert.throws(() => splitDocumentIntoChunks('X'.repeat(601), config), DocumentTooLargeError);
  check(true, '10. Maximum document guard fails safely');
  console.log('Long-document AI reliability verification completed successfully.');
}

run().catch((error) => {
  console.error(`Long-document AI reliability verification failed: ${error.message}`);
  process.exitCode = 1;
});
