import { generateText } from './ai/aiService.js';

const SYSTEM_PROMPT = `You are LifeAdmin AI, a personal document assistant.

Analyze only information provided in the document.

Never create fake facts.

Never guess deadlines.

If information is unavailable return empty values.

Return valid JSON only.`;

const MAX_ITEMS = 50;
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

export class DocumentAiError extends Error {
  constructor(message = 'The AI provider returned an invalid document analysis.') {
    super(message);
    this.name = 'DocumentAiError';
    this.code = 'AI_INVALID_RESPONSE';
    this.statusCode = 502;
  }
}

function cleanString(value, field, maxLength) {
  if (typeof value !== 'string') throw new DocumentAiError(`${field} must be a string.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new DocumentAiError(`${field} is too long.`);
  return cleaned;
}

function cleanArray(value, field, mapper) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new DocumentAiError(`${field} must be an array with no more than ${MAX_ITEMS} items.`);
  }
  return value.map(mapper);
}

export function parseDocumentAnalysis(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DocumentAiError('The AI provider did not return valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DocumentAiError();
  }

  return {
    summary: cleanString(parsed.summary, 'summary', 5000),
    category: cleanString(parsed.category, 'category', 200),
    importantDates: cleanArray(parsed.importantDates, 'importantDates', (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new DocumentAiError('Each important date must be an object.');
      return {
        date: cleanString(item.date, 'importantDates.date', 100),
        description: cleanString(item.description, 'importantDates.description', 500),
      };
    }),
    extractedActions: cleanArray(parsed.extractedActions, 'extractedActions', (item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new DocumentAiError('Each extracted action must be an object.');
      const title = cleanString(item.title, 'extractedActions.title', 300);
      if (!title) throw new DocumentAiError('Each extracted action requires a title.');
      return {
        title,
        description: cleanString(item.description, 'extractedActions.description', 1000),
        priority: cleanString(item.priority, 'extractedActions.priority', 50),
      };
    }),
    keyInformation: cleanArray(parsed.keyInformation, 'keyInformation', (item) => cleanString(item, 'keyInformation item', 1000)),
    risksOrConsequences: cleanArray(parsed.risksOrConsequences, 'risksOrConsequences', (item) => cleanString(item, 'risksOrConsequences item', 1000)),
  };
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
