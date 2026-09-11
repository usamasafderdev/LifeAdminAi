import { generateText } from './ai/aiService.js';
import { AiAnalysisValidationError, validateAiAnalysis } from './aiAnalysisValidator.js';
import { getDocumentChunkingConfig, splitDocumentIntoChunks } from './documentChunkingService.js';
import { mergeDocumentAnalyses } from './documentAnalysisMergeService.js';
import { refineAnalysisQuality } from './documentDeadlineService.js';

const MAX_COMPLETION_TOKENS = 1500;
const CHUNK_COMPLETION_TOKENS = 850;

const SYSTEM_PROMPT = `You are LifeAdmin AI, a personal document assistant that identifies real obligations without inventing them.

Analyze only information provided in the document. Never create facts, obligations, or deadlines. If information is unavailable, return an empty value.

First determine the document's overall intent from its title, headings, tense, audience, and context. Useful intent concepts include informational, instructional, assignment, request, deadline notice, invoice, application, meeting, compliance, and other. Then ask: "Does this document require, request, instruct, expect, or oblige the user to perform something?"

Set actionRequired=true when the answer is yes and extract the supported actions. Assignment briefs and guides, application requirements, invoices requiring payment, renewal or compliance notices, meeting invitations requiring attendance, checklists, form instructions, project requirements, and submission instructions are actionable even when they also contain substantial explanatory material.

Strong contextual action signals include must, required, submit, answer, create, prepare, complete, upload, sign, calculate, insert, design, attach, provide, attend, pay, renew, apply, respond, due dates, numbered procedural steps, deliverables, checklists, and submission requirements. Do not keyword-match: interpret who is expected to act, tense, headings, and document purpose.

Distinguish descriptions from instructions:
- "Developed software for clients" describes past experience and is not a task.
- "Develop a software solution and submit it by Friday" instructs future work and is a task.
- "Calculate Total Revenue using Units Sold x Selling Price" is an instruction and is a task.
- "Total Revenue is calculated from selling price" is normally a fact unless its surrounding section instructs the user to perform that calculation.

Resume or CV experience, skills, education, achievements, employment history, historical project descriptions, reference articles, and general factual reports normally have actionRequired=false and extractedActions=[]. Never turn past-tense achievements into commands.

Extract only actions the user genuinely needs to perform. Use concise action-oriented titles such as Complete, Submit, Prepare, Review, Pay, Attend, Create, Upload, or Renew. Do not use vague titles such as "Assignment", "Information", "Document", or "Requirements".

For structured assignments and instruction documents, identify the meaningful pieces of work the user must complete, not every instruction present. Prefer roughly 3-7 goal-level actions for a typical complex brief, without forcing a count. Always group related sub-requirements and put implementation details in descriptions. Formatting, grammar, student details, references, export requirements, and final checks normally form one finalization task. A report's topic, length, and research requirements normally belong in one writing task. A schedule and its Gantt chart normally belong together. Preserve genuinely distinct deliverables or stages and never turn past experience into future work.

Rewrite source wording into concise standalone action titles. Do not copy long instruction sentences into titles. Keep keyInformation short and prioritized: include only useful non-action constraints, and never duplicate requirements already captured adequately in action titles or descriptions.

Extract every explicit supported deadline into importantDates. Use a parseable ISO-style value when possible, retaining an explicit time when present. Also place the relevant date in action.dueDate. When one clear overall submission/payment/meeting deadline governs a connected set of required work, all related actions may inherit it. When multiple unrelated deadlines exist, associate each action only with its matching deadline; never assign dates by mere proximity or guesswork.

Set priority to high only when urgency, a near deadline, serious consequence, or explicit importance supports it; otherwise use medium or low. Include a dueDate only when the document supports a concrete date. Never guess one. Include risks or consequences only when the source explicitly states them.

If the document is genuinely informational and contains no obligation for the user, or if no action can be supported from its context, return actionRequired=false and extractedActions=[].

Return valid JSON only. Do not reveal chain-of-thought or private reasoning.`;

const CHUNK_SYSTEM_PROMPT = `You extract compact evidence from one section of a larger LifeAdmin document.
Use only this section and never invent facts, actions, or dates. Determine meaningful work goals rather than listing instructions. Past CV experience and descriptive history are not actions. Assignment requirements, deliverables, payments, attendance, applications, renewals, and submission instructions are actions.
Group related sub-requirements into goal-level actions; put details in descriptions. Extract explicit dates and attach relevant dueDate values to actions. Keep key information selective and non-duplicative. Keep the summary brief because multiple section results will be merged. Return valid JSON only.`;

const DOCUMENT_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    actionRequired: { type: 'boolean' },
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
          dueDate: { type: 'string' },
        },
        required: ['title', 'description', 'priority'],
        additionalProperties: false,
      },
    },
    keyInformation: { type: 'array', items: { type: 'string' } },
    risksOrConsequences: { type: 'array', items: { type: 'string' } },
  },
  required: ['actionRequired', 'summary', 'category', 'importantDates', 'extractedActions', 'keyInformation', 'risksOrConsequences'],
  additionalProperties: false,
};

export function parseDocumentAnalysis(text) {
  let parsed;
  try {
    const normalized = text.trim();
    const json = normalized.startsWith('```')
      ? normalized.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      : normalized;
    parsed = JSON.parse(json);
  } catch {
    throw new AiAnalysisValidationError();
  }
  return validateAiAnalysis(parsed);
}

async function analyzeTextSection({ title, category, text, chunkIndex, chunkCount, request }) {
  const isChunk = chunkCount > 1;
  const userPrompt = `${isChunk ? `Analyze section ${chunkIndex + 1} of ${chunkCount} from this document.` : 'Analyze this document using the intent and action-granularity rules.'} Return exactly this JSON structure:
{"actionRequired":false,"summary":"","category":"","importantDates":[],"extractedActions":[],"keyInformation":[],"risksOrConsequences":[]}

The actionRequired value and extractedActions must be consistent. Consolidate related requirements into high-level actions and descriptions.

Document title: ${String(title || '').trim()}
Document category: ${String(category || '').trim()}

${isChunk ? 'Section' : 'Document'} text:
${text}`;

  let validationError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request({
      systemPrompt: isChunk ? CHUNK_SYSTEM_PROMPT : SYSTEM_PROMPT,
      userPrompt: attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nYour previous response was not valid for the required JSON contract. Return one complete JSON object only, with every required top-level field and no prose or markdown fences.`,
      temperature: attempt === 0 ? 0.1 : 0,
      maxTokens: isChunk ? CHUNK_COMPLETION_TOKENS : MAX_COMPLETION_TOKENS,
      jsonSchema: DOCUMENT_ANALYSIS_SCHEMA,
    });
    try {
      return { analysis: parseDocumentAnalysis(result.text), model: result.model };
    } catch (error) {
      if (!(error instanceof AiAnalysisValidationError) || attempt === 1) throw error;
      validationError = error;
    }
  }
  throw validationError;
}

export async function analyzeDocumentText({ title, category, extractedText }, options = {}) {
  if (typeof extractedText !== 'string' || !extractedText.trim()) {
    throw new TypeError('Document text is required for AI analysis.');
  }

  const request = options.generate || generateText;
  const config = options.chunkingConfig || getDocumentChunkingConfig();
  const chunks = splitDocumentIntoChunks(extractedText, config);
  const analyses = [];
  let model = '';
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await analyzeTextSection({ title, category, text: chunks[index], chunkIndex: index, chunkCount: chunks.length, request });
    analyses.push(result.analysis);
    model = result.model || model;
  }
  const merged = analyses.length === 1 ? analyses[0] : mergeDocumentAnalyses(analyses);
  return { ...refineAnalysisQuality(merged), model };
}

export { CHUNK_SYSTEM_PROMPT, DOCUMENT_ANALYSIS_SCHEMA, SYSTEM_PROMPT };
export { AiAnalysisValidationError as DocumentAiError };
