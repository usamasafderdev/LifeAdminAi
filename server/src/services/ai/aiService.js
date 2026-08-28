import { getAiConfig, getAiMetadata, isAiConfigured } from '../../config/ai.js';
import { AI_ERROR_CODES, AiError } from './aiError.js';
import { generateWithGroq } from './groqProvider.js';

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
  if (!config.apiKey || !config.model) {
    throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, { statusCode: 503 });
  }
  if (config.provider !== 'groq') {
    throw new AiError(AI_ERROR_CODES.NOT_CONFIGURED, { statusCode: 503 });
  }

  return generateWithGroq({
    config,
    systemPrompt: systemPrompt?.trim(),
    userPrompt: userPrompt.trim(),
    temperature,
    maxTokens,
    jsonSchema,
    client: providerOptions.client,
  });
}

export { AI_ERROR_CODES, AiError, getAiMetadata, isAiConfigured };
