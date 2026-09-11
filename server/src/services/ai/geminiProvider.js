import { GoogleGenAI } from '@google/genai';
import { AI_ERROR_CODES, AiError } from './aiError.js';

export function normalizeGeminiError(error) {
  if (error instanceof AiError) return error;
  const status = Number(error?.status || error?.statusCode || error?.code);
  const text = `${error?.name || ''} ${error?.message || ''}`;
  if (status === 401 || status === 403) return new AiError(AI_ERROR_CODES.AUTHENTICATION_FAILED, { statusCode: 502, cause: error });
  if (status === 429 || /resource.?exhausted|rate.?limit/i.test(text)) return new AiError(AI_ERROR_CODES.RATE_LIMITED, { statusCode: 429, cause: error });
  if (status === 408 || /timeout|timed out|abort/i.test(text)) return new AiError(AI_ERROR_CODES.TIMEOUT, { statusCode: 504, cause: error });
  if (status >= 500 || /unavailable|connection/i.test(text)) return new AiError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, { statusCode: 503, cause: error });
  return new AiError(AI_ERROR_CODES.REQUEST_FAILED, { statusCode: 502, cause: error });
}

export async function generateWithGemini({ config, systemPrompt, userPrompt, temperature, maxTokens, client: suppliedClient }) {
  const client = suppliedClient || new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { timeout: config.timeoutMs } });
  try {
    const response = await client.models.generateContent({ model: config.geminiModel, contents: userPrompt, config: { ...(systemPrompt ? { systemInstruction: systemPrompt } : {}), temperature, maxOutputTokens: maxTokens } });
    const text = String(response?.text || '').trim();
    if (!text) throw new AiError(AI_ERROR_CODES.INVALID_RESPONSE, { statusCode: 502 });
    const usage = response?.usageMetadata;
    return { text, provider: 'gemini', model: response?.modelVersion || config.geminiModel, usage: usage ? { inputTokens: usage.promptTokenCount ?? null, outputTokens: usage.candidatesTokenCount ?? null, totalTokens: usage.totalTokenCount ?? null } : { inputTokens: null, outputTokens: null, totalTokens: null } };
  } catch (error) { throw normalizeGeminiError(error); }
}
