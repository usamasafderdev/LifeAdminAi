export const AI_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  AUTHENTICATION_FAILED: 'AI_AUTHENTICATION_FAILED',
  RATE_LIMITED: 'AI_RATE_LIMITED',
  TIMEOUT: 'AI_TIMEOUT',
  PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  INVALID_RESPONSE: 'AI_INVALID_RESPONSE',
  REQUEST_FAILED: 'AI_REQUEST_FAILED',
});

const SAFE_MESSAGES = Object.freeze({
  [AI_ERROR_CODES.NOT_CONFIGURED]: 'The AI provider is not configured.',
  [AI_ERROR_CODES.AUTHENTICATION_FAILED]: 'The AI provider rejected the configured credentials.',
  [AI_ERROR_CODES.RATE_LIMITED]: 'The AI provider rate limit was reached. Please try again later.',
  [AI_ERROR_CODES.TIMEOUT]: 'The AI provider request timed out.',
  [AI_ERROR_CODES.PROVIDER_UNAVAILABLE]: 'The AI provider is temporarily unavailable.',
  [AI_ERROR_CODES.INVALID_RESPONSE]: 'The AI provider returned an invalid response.',
  [AI_ERROR_CODES.REQUEST_FAILED]: 'The AI provider request failed.',
});

export class AiError extends Error {
  constructor(code, options = {}) {
    super(SAFE_MESSAGES[code] || SAFE_MESSAGES[AI_ERROR_CODES.REQUEST_FAILED], {
      cause: options.cause,
    });
    this.name = 'AiError';
    this.code = code;
    this.statusCode = options.statusCode || 502;
  }
}
