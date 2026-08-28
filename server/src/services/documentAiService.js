import { generateText } from './ai/aiService.js';
import { AiAnalysisValidationError, validateAiAnalysis } from './aiAnalysisValidator.js';

const SYSTEM_PROMPT = `You are LifeAdmin AI, a personal document assistant.

Analyze only information provided in the document.

Never create fake facts.

Never guess deadlines.

If information is unavailable return empty values.

Return valid JSON only.`;

const DOCUMENT_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    category: { type: 'string' },
    importantDates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { date: { type: 'string' }, description: { type: 'string' } },
        required: ['date', 'description'],
        additionalProperties: false,
      },
    },
    extractedActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string' },
        },
        required: ['title', 'description', 'priority'],
        additionalProperties: false,
      },
    },
    keyInformation: { type: 'array', items: { type: 'string' } },
    risksOrConsequences: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'category', 'importantDates', 'extractedActions', 'keyInformation', 'risksOrConsequences'],
  additionalProperties: false,
};

export function parseDocumentAnalysis(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiAnalysisValidationError();
  }
  return validateAiAnalysis(parsed);
}

export async function analyzeDocumentText({ title, category, extractedText }, options = {}) {
  if (typeof extractedText !== 'string' || !extractedText.trim()) {
    throw new TypeError('Document text is required for AI analysis.');
  }

  const request = options.generate || generateText;
  const result = await request({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Analyze this document and return exactly this JSON structure:
{"summary":"","category":"","importantDates":[],"extractedActions":[],"keyInformation":[],"risksOrConsequences":[]}

Document title: ${String(title || '').trim()}
Document category: ${String(category || '').trim()}

Document text:
${extractedText.trim()}`,
    temperature: 0.1,
    maxTokens: 2000,
    jsonSchema: DOCUMENT_ANALYSIS_SCHEMA,
  });

  return {
    ...parseDocumentAnalysis(result.text),
    model: result.model,
  };
}

export { DOCUMENT_ANALYSIS_SCHEMA, SYSTEM_PROMPT };
export { AiAnalysisValidationError as DocumentAiError };
