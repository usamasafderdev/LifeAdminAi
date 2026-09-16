import { getAiMetadata, getAiConfig } from '../../config/ai.js';

const HEALTH_TIMEOUT_MS = 5000;

export async function checkAiConnection() {
  const metadata = getAiMetadata();
  if (!metadata.configured)
    return {
      ...metadata,
      status: 'not_configured',
      message: metadata.missing,
    };

  const config = getAiConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response =
      metadata.provider === 'gemini'
        ? await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.geminiApiKey)}`,
            { signal: controller.signal },
          )
        : await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${config.apiKey}` },
            signal: controller.signal,
          });
    if (!response.ok)
      return {
        ...metadata,
        status: 'error',
        message: 'The configured AI provider could not be reached.',
      };
    return {
      ...metadata,
      status: 'connected',
      message: `${metadata.provider === 'gemini' ? 'Gemini' : 'Groq'} is ready to answer questions.`,
    };
  } catch {
    return {
      ...metadata,
      status: 'error',
      message: 'The configured AI provider could not be reached.',
    };
  } finally {
    clearTimeout(timer);
  }
}
