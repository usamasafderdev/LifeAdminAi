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
  });
}

export function isAiConfigured() {
  const config = getAiConfig();
  return Boolean(config.apiKey && config.model && config.provider === 'groq');
}

export function getAiMetadata() {
  const config = getAiConfig();
  return Object.freeze({
    configured: isAiConfigured(),
    provider: config.provider,
    model: config.model || null,
  });
}

export { DEFAULT_TIMEOUT_MS };
