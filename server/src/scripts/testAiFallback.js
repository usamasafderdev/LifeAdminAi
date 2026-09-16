import { generateText } from '../services/ai/aiService.js';
import { AI_ERROR_CODES, AiError } from '../services/ai/aiError.js';
import { generateWithGemini, normalizeGeminiError } from '../services/ai/geminiProvider.js';

const base = { provider: 'groq', apiKey: 'groq-key', model: 'groq-model', timeoutMs: 1000, fallbackProvider: 'gemini', geminiApiKey: 'gemini-key', geminiModel: 'gemini-model' };
const request = { userPrompt: 'Safe test prompt', maxTokens: 50 };
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(72, '.')} PASS`); };
const failure = (code, statusCode) => async () => { throw new AiError(code, { statusCode, cause: new Error('private provider body') }); };
const success = (provider, calls) => async () => { calls[provider] += 1; return { text: `${provider} answer`, provider, model: `${provider}-model`, usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }; };

async function invoke(primaryProvider, fallbackProvider, config = base) {
  const calls = { groq: 0, gemini: 0 };
  const wrapped = { groq: async (value) => { calls.groq += 1; return primaryProvider(value); }, gemini: async (value) => { calls.gemini += 1; return fallbackProvider(value); } };
  try { return { result: await generateText(request, { config, providers: wrapped }), calls }; } catch (error) { return { error, calls }; }
}

async function run() {
  let out = await invoke(async () => ({ text: 'primary', provider: 'groq', model: 'g', usage: {} }), success('gemini', { gemini: 0 }));
  check(out.result?.provider === 'groq' && out.calls.groq === 1 && out.calls.gemini === 0, '1. Groq success skips Gemini');
  for (const [index, code, status] of [[2, AI_ERROR_CODES.RATE_LIMITED, 429], [3, AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 502], [4, AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 503], [5, AI_ERROR_CODES.TIMEOUT, 504], [9, AI_ERROR_CODES.INVALID_RESPONSE, 502]]) {
    out = await invoke(failure(code, status), async () => ({ text: 'fallback', provider: 'gemini', model: 'gemini-model', usage: { inputTokens: null, outputTokens: null, totalTokens: null } }));
    check(out.result?.provider === 'gemini' && out.calls.groq === 1 && out.calls.gemini === 1, `${index}. Eligible Groq ${code} falls back once`);
  }
  out = await invoke(failure(AI_ERROR_CODES.REQUEST_FAILED, 400), success('gemini', { gemini: 0 }));
  check(out.error?.code === AI_ERROR_CODES.REQUEST_FAILED && out.calls.gemini === 0, '6. Invalid request does not invoke fallback');
  out = await invoke(failure(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 503), failure(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 503));
  check(out.error?.statusCode === 503 && out.calls.groq === 1 && out.calls.gemini === 1, '7. Both unavailable produce one final 503');
  out = await invoke(failure(AI_ERROR_CODES.RATE_LIMITED, 429), failure(AI_ERROR_CODES.RATE_LIMITED, 429));
  check(out.error?.statusCode === 429, '8. Both rate limited produce normalized 429');
  const gemini = await generateWithGemini({ config: base, userPrompt: 'test', temperature: 0, maxTokens: 20, client: { getGenerativeModel: () => ({ generateContent: async (_prompt, options) => { check(options.timeout === base.timeoutMs, 'Gemini receives configured request timeout'); return { response: { text: () => 'normalized', modelVersion: 'gemini-test', usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 } } }; } }) } });
  check(gemini.text === 'normalized' && gemini.provider === 'gemini' && gemini.usage.totalTokens === 5, '10. Gemini success uses normalized result shape');
  const normalized = normalizeGeminiError({ status: 429, message: 'private quota body' });
  check(normalized.code === AI_ERROR_CODES.RATE_LIMITED && !normalized.message.includes('private'), '11. Gemini rate limit is safely normalized');
  check(normalizeGeminiError({ status: 503 }).code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE, '12. Gemini unavailability is normalized');
  out = await invoke(success('groq', { groq: 0 }), success('gemini', { gemini: 0 }), { ...base, apiKey: '', geminiApiKey: '' });
  check(out.error?.code === AI_ERROR_CODES.NOT_CONFIGURED && out.calls.groq === 0 && out.calls.gemini === 0, '13. No configured keys returns controlled error');
  out = await invoke(async () => ({ text: 'groq', provider: 'groq' }), failure(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 503), { ...base, fallbackProvider: '', geminiApiKey: '' });
  check(out.result?.provider === 'groq' && out.calls.groq === 1, '13. Groq-only configuration works');
  out = await invoke(failure(AI_ERROR_CODES.NOT_CONFIGURED, 503), async () => ({ text: 'gemini', provider: 'gemini', model: 'm', usage: { inputTokens: null, outputTokens: null, totalTokens: null } }), { ...base, apiKey: '', provider: 'groq' });
  check(out.result?.provider === 'gemini' && out.calls.groq === 0 && out.calls.gemini === 1, '14. Gemini-only configured route works');
  check(!JSON.stringify([out.error, normalized]).includes('private quota body'), '15. Raw provider errors are not exposed');
  console.log('AI fallback verification completed successfully.');
}
run().catch((error) => { console.error(`AI fallback verification failed: ${error.message}`); process.exitCode = 1; });
