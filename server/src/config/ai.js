const DEFAULT_PROVIDER = 'groq';
const DEFAULT_TIMEOUT_MS = 30000;

function parseTimeout(value) {
  if (value === undefined || value === '') return DEFAULT_TIMEOUT_MS;

  const timeout = Number(value);
  if (!Number.isInteger(timeout) || timeout <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return timeout;
}

export function getAiConfig() {
  return Object.freeze({
    provider: (process.env.AI_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase(),
    apiKey: process.env.AI_API_KEY?.trim() || '',
    model: process.env.AI_MODEL?.trim() || '',
    timeoutMs: parseTimeout(process.env.AI_TIMEOUT_MS),
    fallbackProvider: (process.env.AI_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
    geminiModel: process.env.GEMINI_MODEL?.trim() || '',
  });
}

export function isAiConfigured() {
  const config = getAiConfig();
  const primary = config.provider === 'groq' ? config.apiKey && config.model : config.provider === 'gemini' ? config.geminiApiKey && config.geminiModel : false;
  const fallback = config.fallbackProvider === 'gemini' && config.geminiApiKey && config.geminiModel;
  return Boolean(primary || fallback);
}

export function getAiMetadata() {
  const config = getAiConfig();
  return Object.freeze({
    configured: isAiConfigured(),
    provider: config.provider,
    model: config.model || null,
    fallbackProvider: config.fallbackProvider || null,
    fallbackConfigured: Boolean(config.fallbackProvider === 'gemini' && config.geminiApiKey && config.geminiModel),
  });
}

export { DEFAULT_TIMEOUT_MS };
