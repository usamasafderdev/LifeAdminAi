import { getAiConfig, getAiMetadata, isAiConfigured } from '../../config/ai.js';
import { AI_ERROR_CODES, AiError } from './aiError.js';
import { generateWithGroq } from './groqProvider.js';
import { generateWithGemini } from './geminiProvider.js';

const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_MAX_TOKENS = 500;
const MAX_OUTPUT_TOKENS = 4096;

function validateRequest({ systemPrompt, userPrompt, temperature, maxTokens, jsonSchema }) {
  if (typeof userPrompt !== 'string' || !userPrompt.trim()) {
    throw new TypeError('userPrompt must be a non-empty string');
  }
  if (systemPrompt !== undefined && typeof systemPrompt !== 'string') {
    throw new TypeError('systemPrompt must be a string when provided');
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new TypeError('temperature must be between 0 and 2');
  }
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > MAX_OUTPUT_TOKENS) {
    throw new TypeError(`maxTokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS}`);
  }
  if (jsonSchema !== undefined && (!jsonSchema || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema))) {
    throw new TypeError('jsonSchema must be an object when provided');
  }
}

export async function generateText({
  systemPrompt,
  userPrompt,
  temperature = DEFAULT_TEMPERATURE,
  maxTokens = DEFAULT_MAX_TOKENS,
  jsonSchema,
} = {}, providerOptions = {}) {
  validateRequest({ systemPrompt, userPrompt, temperature, maxTokens, jsonSchema });

  const config = providerOptions.config || getAiConfig();
  const providers = providerOptions.providers || { groq: generateWithGroq, gemini: generateWithGemini };
  const configured = (name) => name === 'groq' ? Boolean(config.apiKey && config.model) : name === 'gemini' ? Boolean(config.geminiApiKey && config.geminiModel) : false;
  const primary = configured(config.provider) ? config.provider : configured(config.fallbackProvider) ? config.fallbackProvider : null;
  if (!primary) throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, { statusCode: 503 });
  const fallback = config.fallbackProvider && config.fallbackProvider !== primary && configured(config.fallbackProvider) ? config.fallbackProvider : null;
  const request = { config, systemPrompt: systemPrompt?.trim(), userPrompt: userPrompt.trim(), temperature, maxTokens, jsonSchema };
  const call = (name) => providers[name]({ ...request, client: name === 'groq' ? providerOptions.client : providerOptions.geminiClient });
  const eligible = new Set([AI_ERROR_CODES.RATE_LIMITED, AI_ERROR_CODES.PROVIDER_UNAVAILABLE, AI_ERROR_CODES.TIMEOUT, AI_ERROR_CODES.INVALID_RESPONSE]);
  const started = Date.now();
  try { return await call(primary); }
  catch (primaryError) {
    if (!fallback || !eligible.has(primaryError?.code)) throw primaryError;
    try {
      const result = await call(fallback);
      if (process.env.NODE_ENV === 'development') console.info('[AI]', { provider: result.provider, fallbackUsed: true, inputCharacters: request.userPrompt.length, durationMs: Date.now() - started });
      return result;
    } catch (fallbackError) {
      if (primaryError.code === AI_ERROR_CODES.RATE_LIMITED && fallbackError.code === AI_ERROR_CODES.RATE_LIMITED) throw new AiError(AI_ERROR_CODES.RATE_LIMITED, { statusCode: 429 });
      if (primaryError.code === AI_ERROR_CODES.TIMEOUT && fallbackError.code === AI_ERROR_CODES.TIMEOUT) throw new AiError(AI_ERROR_CODES.TIMEOUT, { statusCode: 504 });
      if (fallbackError.code === AI_ERROR_CODES.INVALID_RESPONSE) throw new AiError(AI_ERROR_CODES.INVALID_RESPONSE, { statusCode: 502 });
      throw new AiError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, { statusCode: 503 });
    }
  }
}

export { AI_ERROR_CODES, AiError, getAiMetadata, isAiConfigured };
