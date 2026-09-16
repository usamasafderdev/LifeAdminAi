const DEFAULT_PROVIDER = 'groq';
const DEFAULT_TIMEOUT_MS = 30000;

function providerModel(config, provider) {
  return provider === 'gemini' ? config.geminiModel : provider === 'groq' ? config.model : '';
}

function providerConfigured(config, provider) {
  return provider === 'gemini'
    ? Boolean(config.geminiApiKey && config.geminiModel)
    : provider === 'groq'
      ? Boolean(config.apiKey && config.model)
      : false;
}

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
  return Boolean(
    providerConfigured(config, config.provider) ||
    providerConfigured(config, config.fallbackProvider),
  );
}

export function getAiMetadata() {
  const config = getAiConfig();
  const provider = providerConfigured(config, config.provider)
    ? config.provider
    : providerConfigured(config, config.fallbackProvider)
      ? config.fallbackProvider
      : null;
  return Object.freeze({
    configured: Boolean(provider),
    provider,
    model: provider ? providerModel(config, provider) || null : null,
    fallbackProvider: config.fallbackProvider || null,
    fallbackConfigured: providerConfigured(config, config.fallbackProvider),
    missing: provider
      ? null
      : config.provider === 'gemini'
        ? 'Configure GEMINI_API_KEY and GEMINI_MODEL.'
        : config.provider === 'groq'
          ? 'Configure AI_API_KEY and AI_MODEL.'
          : 'Configure AI_PROVIDER and the credentials and model for that provider.',
  });
}

export { DEFAULT_TIMEOUT_MS };
