import assert from 'node:assert/strict';
import { generateText } from '../services/ai/aiService.js';

const config = {
  provider: 'groq',
  apiKey: 'test-key-not-sent',
  model: 'test-model',
  timeoutMs: 25,
};

async function expectAiError(expectedCode, client) {
  await assert.rejects(
    generateText({ userPrompt: 'test' }, { config, client }),
    (error) => error.code === expectedCode,
  );
}

async function run() {
  const originalKey = process.env.AI_API_KEY;
  const originalModel = process.env.AI_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  await assert.rejects(
    generateText({ userPrompt: 'test' }),
    (error) => error.code === 'AI_NOT_CONFIGURED',
  );
  if (originalKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.AI_MODEL;
  else process.env.AI_MODEL = originalModel;

  const response = await generateText(
    { systemPrompt: 'system', userPrompt: 'user', maxTokens: 20 },
    {
      config,
      client: {
        chat: { completions: { create: async () => ({
          model: 'resolved-model',
          choices: [{ message: { content: ' normalized result ' } }],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }) } },
      },
    },
  );
  assert.deepEqual(response, {
    text: 'normalized result',
    provider: 'groq',
    model: 'resolved-model',
    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
  });

  let structuredRequest;
  await generateText(
    { userPrompt: 'Return JSON', maxTokens: 20, jsonSchema: { type: 'object', properties: {}, additionalProperties: false } },
    {
      config,
      client: { chat: { completions: { create: async (request) => {
        structuredRequest = request;
        return { choices: [{ message: { content: '{}' } }] };
      } } } },
    },
  );
  assert.equal(structuredRequest.response_format, undefined);
  assert.equal(structuredRequest.reasoning_effort, undefined);

  let reasoningRequest;
  await generateText(
    { userPrompt: 'Return JSON', maxTokens: 20, jsonSchema: { type: 'object' } },
    {
      config: { ...config, model: 'openai/gpt-oss-20b' },
      client: { chat: { completions: { create: async (request) => {
        reasoningRequest = request;
        return { choices: [{ message: { content: '{}' } }] };
      } } } },
    },
  );
  assert.equal(reasoningRequest.reasoning_effort, 'low');
  assert.equal(reasoningRequest.include_reasoning, false);

  let recoveryAttempts = 0;
  const recovered = await generateText(
    { userPrompt: 'Return JSON', maxTokens: 20, jsonSchema: { type: 'object' } },
    {
      config,
      client: { chat: { completions: { create: async () => {
        recoveryAttempts += 1;
        if (recoveryAttempts === 1) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
        return { choices: [{ message: { content: '{"recovered":true}' } }] };
      } } } },
    },
  );
  assert.equal(recoveryAttempts, 2);
  assert.equal(recovered.text, '{"recovered":true}');

  await expectAiError('AI_INVALID_RESPONSE', {
    chat: { completions: { create: async () => ({ choices: [] }) } },
  });
  await expectAiError('AI_AUTHENTICATION_FAILED', {
    chat: { completions: { create: async () => { throw Object.assign(new Error(), { status: 401 }); } } },
  });
  await expectAiError('AI_RATE_LIMITED', {
    chat: { completions: { create: async () => { throw Object.assign(new Error(), { status: 429 }); } } },
  });
  await expectAiError('AI_TIMEOUT', {
    chat: { completions: { create: async () => { throw Object.assign(new Error(), { name: 'APIConnectionTimeoutError' }); } } },
  });
  await expectAiError('AI_PROVIDER_UNAVAILABLE', {
    chat: { completions: { create: async () => { throw Object.assign(new Error(), { status: 503 }); } } },
  });

  console.log('AI service tests.................... PASS');
  console.log('Missing configuration............... PASS');
  console.log('Response and error normalization.... PASS');
  console.log('Application-validated JSON mode..... PASS');
  console.log('GPT-OSS reasoning budget controlled. PASS');
  console.log('Transient generation recovered...... PASS');
}

run().catch((error) => {
  console.error(`AI service tests.................... FAIL (${error.message})`);
  process.exitCode = 1;
});
