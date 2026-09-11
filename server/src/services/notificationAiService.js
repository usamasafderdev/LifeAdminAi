import { generateText } from './ai/aiService.js';

export const NOTIFICATION_ADVICE = Object.freeze([
  'Review the remaining work and choose one practical next step.',
  'Consider reserving an available work block on Calendar.',
  'Review the deadline and adjust your plan if needed.',
]);
// A provider selects from safe explanations. It never writes facts or changes urgency.
export async function explainNotification(type, { generate = generateText } = {}) {
  try {
    const result = await generate({
      systemPrompt:
        'Choose the most helpful advice for the backend alert category. Return only JSON {"adviceIndex":0}, with an integer index from the supplied options. Do not infer facts, deadlines or priorities.',
      userPrompt: JSON.stringify({ category: type, options: NOTIFICATION_ADVICE }),
      temperature: 0,
      maxTokens: 60,
    });
    const index = JSON.parse(result.text).adviceIndex;
    return Number.isInteger(index) && index >= 0 && index < NOTIFICATION_ADVICE.length
      ? NOTIFICATION_ADVICE[index]
      : '';
  } catch {
    return '';
  }
}
