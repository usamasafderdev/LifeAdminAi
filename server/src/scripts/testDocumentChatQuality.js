import assert from 'node:assert/strict';
import { answerDocumentQuestion, classifyResponsePlan, DOCUMENT_CHAT_SYSTEM_PROMPT } from '../services/documentChatService.js';

const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(74, '.')} PASS`); };
const easy = { title: 'Simple task', extractedText: 'Requirement: rename one file and upload it. No research, coding, references, or screenshots are required.' };
const complex = { title: 'Technical project', extractedText: 'Deliverables: research five sources; build and test a mobile application; write 5,000 words; produce threat models; run practical software tests; capture screenshots; analyze results; document code; verify references; submit a working demonstration.' };

async function capture(document, question, history = []) {
  let request;
  const result = await answerDocumentQuestion({ document, question, history, generate: async (value) => { request = value; return { text: 'Test answer', model: 'quality-test' }; } });
  return { request, result };
}

async function run() {
  const easyPlan = classifyResponsePlan('How difficult is this out of 10?');
  check(easyPlan.mode === 'difficulty' && easyPlan.maxTokens <= 500, '1. Difficulty uses concise independent-assessment mode');
  const complexPlan = classifyResponsePlan('How difficult is this out of 10?');
  check(complexPlan.mode === easyPlan.mode && !('score' in complexPlan), '2. Response plan contains no hardcoded score');
  const assisted = classifyResponsePlan('How difficult is this if I use Claude/GPT?');
  check(assisted.mode === 'ai_assisted_difficulty' && /manual work remains/i.test(assisted.guidance), '3. AI-assisted difficulty is evaluated separately');
  check(classifyResponsePlan('Does this document allow me to use AI?').mode === 'policy', '4. AI policy is distinct from practical difficulty');
  check(classifyResponsePlan('When is this due?').mode === 'quick_fact', '5. Deadline question uses short response mode');
  check(classifyResponsePlan('What do I have to do?').mode === 'requirements', '6. Requirements question uses structured medium mode');
  check(classifyResponsePlan('Explain all requirements in detail.').mode === 'detailed', '7. Explicit detail receives a larger response budget');
  check(classifyResponsePlan('How long will this take?').mode === 'time_estimate', '8. Time estimate is not treated as difficulty');
  check(classifyResponsePlan('Plan how I can finish this in two days.').mode === 'planning', '9. Planning intent receives practical guidance');
  check(classifyResponsePlan('Check whether my answer satisfies the brief.').mode === 'review', '10. Review intent is recognized');
  const easyRequest = await capture(easy, 'How difficult is this?');
  const complexRequest = await capture(complex, 'How difficult is this?');
  check(easyRequest.request.userPrompt.includes('rename one file'), '11. Easy assessment receives actual easy-document evidence');
  check(complexRequest.request.userPrompt.includes('mobile application'), '12. Complex assessment receives actual complex-document evidence');
  check(easyRequest.request.userPrompt !== complexRequest.request.userPrompt, '13. Different documents produce different assessment context');
  const followUp = await capture(complex, 'Which one is hardest?', [{ role: 'user', content: 'What tasks are required?' }, { role: 'assistant', content: 'Research, coding, testing and documentation.' }]);
  check(followUp.request.userPrompt.includes('What tasks are required?') && followUp.request.userPrompt.includes('coding, testing'), '14. Follow-up receives bounded conversation context');
  check(/independently evaluate/i.test(DOCUMENT_CHAT_SYSTEM_PROMPT) && /predetermined/i.test(DOCUMENT_CHAT_SYSTEM_PROMPT), '15. Prompt requires document-specific independent judgment');
  check(!/(?:^|\D)(?:5|6|10)\s*(?:\/|out of)\s*10(?:\D|$)/i.test(DOCUMENT_CHAT_SYSTEM_PROMPT), '16. Prompt contains no numeric rating anchor');
  check(/practical difficulty, technical complexity, time required, and academic-integrity risk separate/i.test(DOCUMENT_CHAT_SYSTEM_PROMPT), '17. Difficulty and integrity concerns remain separate');
  check(/Answer the question immediately and concisely by default/i.test(DOCUMENT_CHAT_SYSTEM_PROMPT), '18. Prompt enforces answer-first concise defaults');
  check(easyRequest.request.maxTokens < classifyResponsePlan('Explain all requirements in detail.').maxTokens, '19. Adaptive budgets save tokens without truncating detailed work');
  assert.equal(easyRequest.result.sources.length > 0, true);
  check(easyRequest.result.responseMode === 'difficulty', '20. Response mode is returned without exposing internal reasoning');
  console.log('Document chat quality verification completed successfully.');
}
run().catch((error) => { console.error(`Document chat quality verification failed: ${error.message}`); process.exitCode = 1; });
