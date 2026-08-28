import Groq from 'groq-sdk';
import { AI_ERROR_CODES, AiError } from './aiError.js';

function normalizeProviderError(error) {
  if (error instanceof AiError) return error;

  const status = error?.status;
  const errorName = error?.name;

  if (status === 401 || status === 403) {
    return new AiError(AI_ERROR_CODES.AUTHENTICATION_FAILED, { statusCode: 502, cause: error });
  }
  if (status === 429) {
    return new AiError(AI_ERROR_CODES.RATE_LIMITED, { statusCode: 503, cause: error });
  }
  if (errorName === 'APIConnectionTimeoutError' || error?.code === 'ETIMEDOUT') {
    return new AiError(AI_ERROR_CODES.TIMEOUT, { statusCode: 504, cause: error });
  }
  if (status >= 500 || errorName === 'APIConnectionError') {
    return new AiError(AI_ERROR_CODES.PROVIDER_UNAVAILABLE, { statusCode: 503, cause: error });
  }

  return new AiError(AI_ERROR_CODES.REQUEST_FAILED, { cause: error });
}

export async function generateWithGroq({
  config,
  systemPrompt,
  userPrompt,
  temperature,
  maxTokens,
  jsonSchema,
  client: suppliedClient,
}) {
  const client = suppliedClient || new Groq({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: 0,
  });

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_completion_tokens: maxTokens,
      ...(jsonSchema ? {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'lifeadmin_response',
            strict: true,
            schema: jsonSchema,
          },
        },
      } : {}),
    });
    const text = response?.choices?.[0]?.message?.content?.trim();

    if (!text) throw new AiError(AI_ERROR_CODES.INVALID_RESPONSE);

    const usage = response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined;

    return {
      text,
      provider: 'groq',
      model: response.model || config.model,
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

export { normalizeProviderError };
