import { GoogleGenerativeAI } from '@google/generative-ai';
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

export async function generateWithGemini({
  config,
  systemPrompt,
  userPrompt,
  temperature,
  maxTokens,
  client: suppliedClient,
}) {
  const client = suppliedClient || new GoogleGenerativeAI(config.geminiApiKey);
  try {
    const model = client.getGenerativeModel({
      model: config.geminiModel || 'gemini-2.5-flash',
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });

    const responseObject = await model.generateContent(userPrompt);
    const response = responseObject?.response || responseObject;
    const text = typeof response?.text === 'function'
      ? String(response.text() || '').trim()
      : String(response?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || response?.text || '').trim();

    if (!text) {
      throw new AiError(AI_ERROR_CODES.INVALID_RESPONSE, { statusCode: 502 });
    }

    const usage = responseObject?.usageMetadata || response?.usageMetadata;
    return {
      text,
      provider: 'gemini',
      model: responseObject?.modelVersion || response?.modelVersion || config.geminiModel || 'gemini-2.5-flash',
      usage: usage
        ? {
            inputTokens: usage.promptTokenCount ?? null,
            outputTokens: usage.candidatesTokenCount ?? null,
            totalTokens: usage.totalTokenCount ?? null,
          }
        : {
            inputTokens: null,
            outputTokens: null,
            totalTokens: null,
          },
    };
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}
