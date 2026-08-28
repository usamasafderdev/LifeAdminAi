import 'dotenv/config';
import { generateText, getAiMetadata } from '../services/ai/aiService.js';

async function run() {
  const metadata = getAiMetadata();
  if (!metadata.configured) {
    console.error('AI provider configuration........... FAIL (AI_NOT_CONFIGURED)');
    console.error('Set AI_PROVIDER, AI_API_KEY, and AI_MODEL in server/.env.');
    process.exitCode = 1;
    return;
  }

  console.log('AI provider configuration........... PASS');
  const result = await generateText({
    systemPrompt: 'You are a test assistant.',
    userPrompt: 'Reply with exactly: LIFEADMIN_AI_OK',
    temperature: 0,
    maxTokens: 200,
  });
  console.log('Provider connection................. PASS');
  console.log('Model request....................... PASS');
  console.log('Response received................... PASS');
  console.log('Normalized response................. PASS');

  if (!result.text.includes('LIFEADMIN_AI_OK')) {
    throw new Error('AI_INVALID_RESPONSE: expected marker was not returned');
  }
  console.log('Expected LifeAdmin marker........... PASS');
}

run().catch((error) => {
  console.error(`Provider connection................. FAIL (${error.code || 'AI_REQUEST_FAILED'})`);
  process.exitCode = 1;
});
