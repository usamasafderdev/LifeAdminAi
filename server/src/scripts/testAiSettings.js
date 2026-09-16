import assert from 'node:assert/strict';
import { getAiMetadata, isAiConfigured } from '../config/ai.js';
import { checkAiConnection } from '../services/ai/aiHealthService.js';

const names = [
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_MODEL',
  'AI_FALLBACK_PROVIDER',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
];
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const setEnv = (values) => {
  for (const name of names) {
    if (Object.hasOwn(values, name)) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
  }
};
const check = (condition, label) => {
  assert.equal(condition, true, label);
  console.log(`${label.padEnd(64, '.')} PASS`);
};

try {
  setEnv({
    AI_PROVIDER: 'groq',
    AI_API_KEY: 'groq-secret',
    AI_MODEL: 'llama-test',
    AI_FALLBACK_PROVIDER: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
  });
  let metadata = getAiMetadata();
  check(
    metadata.provider === 'groq' && metadata.model === 'llama-test',
    'Groq metadata uses configured provider/model',
  );
  check(!JSON.stringify(metadata).includes('groq-secret'), 'Groq metadata excludes API key');

  setEnv({
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'gemini-secret',
    GEMINI_MODEL: 'gemini-test',
    AI_API_KEY: '',
    AI_MODEL: '',
  });
  metadata = getAiMetadata();
  check(
    metadata.provider === 'gemini' && metadata.model === 'gemini-test',
    'Gemini metadata uses configured provider/model',
  );
  check(!JSON.stringify(metadata).includes('gemini-secret'), 'Gemini metadata excludes API key');

  setEnv({
    AI_PROVIDER: 'groq',
    AI_API_KEY: '',
    AI_MODEL: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
  });
  metadata = getAiMetadata();
  check(
    !isAiConfigured() && metadata.provider === null && metadata.model === null,
    'Missing configuration is reported safely',
  );
  let health = await checkAiConnection();
  check(health.status === 'not_configured', 'Missing configuration reports not configured status');

  setEnv({ AI_PROVIDER: 'groq', AI_API_KEY: 'groq-secret', AI_MODEL: 'llama-test' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer groq-secret');
    return { ok: true };
  };
  health = await checkAiConnection();
  globalThis.fetch = originalFetch;
  check(
    health.status === 'connected' && health.provider === 'groq',
    'Configured provider reports connected status',
  );
  check(!JSON.stringify(health).includes('groq-secret'), 'Health metadata excludes API key');

  globalThis.fetch = async () => ({ ok: false, status: 503 });
  health = await checkAiConnection();
  globalThis.fetch = originalFetch;
  check(health.status === 'error', 'Provider failure reports error status');

  console.log('AI settings verification completed successfully.');
} finally {
  setEnv(original);
}
