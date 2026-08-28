import { DOCUMENT_CATEGORIES } from '../models/Document.js';

const LIMITS = Object.freeze({
  summary: 5000,
  category: 200,
  date: 100,
  dateDescription: 500,
  actionTitle: 300,
  actionDescription: 1000,
  listItem: 1000,
  items: 50,
});

const ANALYSIS_FIELDS = [
  'summary',
  'category',
  'importantDates',
  'extractedActions',
  'keyInformation',
  'risksOrConsequences',
];

const RELATIVE_OR_UNKNOWN_DATE = /^(today|tomorrow|yesterday|unknown|unspecified|not specified|n\/?a|none|null)$/i;

export class AiAnalysisValidationError extends Error {
  constructor() {
    super('AI response validation failed');
    this.name = 'AiAnalysisValidationError';
    this.code = 'AI_RESPONSE_VALIDATION_FAILED';
    this.statusCode = 502;
  }
}

export class AnalysisConfirmationValidationError extends Error {
  constructor() {
    super('Invalid confirmed analysis data');
    this.name = 'AnalysisConfirmationValidationError';
    this.code = 'INVALID_CONFIRMED_ANALYSIS';
    this.statusCode = 400;
  }
}

function normalizeString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, LIMITS.items)
    .map((item) => normalizeString(item, LIMITS.listItem))
    .filter(Boolean);
}

function isPossibleDate(value) {
  if (!value || RELATIVE_OR_UNKNOWN_DATE.test(value)) return false;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const [, year, month, day] = iso.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    return first >= 1 && first <= 31 && second >= 1 && second <= 12;
  }

  return /\d/.test(value) && Number.isFinite(Date.parse(value));
}

function normalizePriority(value) {
  const priority = normalizeString(value, 50).toLowerCase();
  if (priority === 'urgent') return 'high';
  if (['low', 'medium', 'high'].includes(priority)) return priority;
  return 'medium';
}

function normalizeImportantDates(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LIMITS.items).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const date = normalizeString(item.date, LIMITS.date);
    const description = normalizeString(item.description, LIMITS.dateDescription);
    return isPossibleDate(date) && description ? [{ date, description }] : [];
  });
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LIMITS.items).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const title = normalizeString(item.title, LIMITS.actionTitle);
    if (!title) return [];
    const action = {
      title,
      description: normalizeString(item.description, LIMITS.actionDescription),
      priority: normalizePriority(item.priority),
    };
    const dueDate = normalizeString(item.dueDate, LIMITS.date);
    if (dueDate && isPossibleDate(dueDate)) action.dueDate = dueDate;
    return [action];
  });
}

export function validateAiAnalysis(rawAnalysis) {
  if (!rawAnalysis || typeof rawAnalysis !== 'object' || Array.isArray(rawAnalysis)) {
    throw new AiAnalysisValidationError();
  }
  if (!ANALYSIS_FIELDS.some((field) => Object.hasOwn(rawAnalysis, field))) {
    throw new AiAnalysisValidationError();
  }

  const category = normalizeString(rawAnalysis.category, LIMITS.category).toLowerCase();
  return {
    summary: normalizeString(rawAnalysis.summary, LIMITS.summary),
    category: DOCUMENT_CATEGORIES.includes(category) ? category : '',
    importantDates: normalizeImportantDates(rawAnalysis.importantDates),
    extractedActions: normalizeActions(rawAnalysis.extractedActions),
    keyInformation: normalizeStringList(rawAnalysis.keyInformation),
    risksOrConsequences: normalizeStringList(rawAnalysis.risksOrConsequences),
  };
}

function hasOnlyFields(value, fields) {
  return Object.keys(value).every((field) => fields.includes(field));
}

export function validateConfirmedAnalysis(rawAnalysis) {
  const invalid = () => { throw new AnalysisConfirmationValidationError(); };
  if (!rawAnalysis || typeof rawAnalysis !== 'object' || Array.isArray(rawAnalysis)) invalid();
  if (!hasOnlyFields(rawAnalysis, ANALYSIS_FIELDS) || !ANALYSIS_FIELDS.every((field) => Object.hasOwn(rawAnalysis, field))) invalid();
  if (typeof rawAnalysis.summary !== 'string' || rawAnalysis.summary.length > LIMITS.summary) invalid();
  if (typeof rawAnalysis.category !== 'string' || (rawAnalysis.category && !DOCUMENT_CATEGORIES.includes(rawAnalysis.category.toLowerCase()))) invalid();
  for (const field of ['importantDates', 'extractedActions', 'keyInformation', 'risksOrConsequences']) {
    if (!Array.isArray(rawAnalysis[field]) || rawAnalysis[field].length > LIMITS.items) invalid();
  }
  if (rawAnalysis.importantDates.some((item) => !item || typeof item !== 'object' || Array.isArray(item)
    || !hasOnlyFields(item, ['date', 'description']) || typeof item.date !== 'string'
    || typeof item.description !== 'string' || !isPossibleDate(normalizeString(item.date, LIMITS.date))
    || !normalizeString(item.description, LIMITS.dateDescription))) invalid();
  if (rawAnalysis.extractedActions.some((item) => !item || typeof item !== 'object' || Array.isArray(item)
    || !hasOnlyFields(item, ['title', 'description', 'priority', 'dueDate']) || typeof item.title !== 'string'
    || typeof item.description !== 'string' || typeof item.priority !== 'string'
    || !normalizeString(item.title, LIMITS.actionTitle)
    || !['low', 'medium', 'high'].includes(item.priority.toLowerCase())
    || (item.dueDate !== undefined && (typeof item.dueDate !== 'string' || (item.dueDate && !isPossibleDate(normalizeString(item.dueDate, LIMITS.date))))))) invalid();
  if ([...rawAnalysis.keyInformation, ...rawAnalysis.risksOrConsequences]
    .some((item) => typeof item !== 'string' || !normalizeString(item, LIMITS.listItem))) invalid();

  return validateAiAnalysis(rawAnalysis);
}

export { LIMITS };
