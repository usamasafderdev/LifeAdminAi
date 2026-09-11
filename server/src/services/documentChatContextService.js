import { splitKnowledgeChunks } from './documentChunkingService.js';
const STOP = new Set(
  'a an and are as at be by can could did do does for from had has have how i in is it me my of on or should that the this to was what when where which who why will with would you your'.split(
    ' ',
  ),
);
const ALIASES = {
  hand: ['submit', 'submission', 'upload', 'deliver'],
  submit: ['submission', 'upload', 'hand', 'deliver'],
  due: ['deadline', 'submit', 'submission'],
  deadline: ['due', 'submit', 'submission'],
  pay: ['payment', 'fee', 'amount', 'invoice'],
  payment: ['pay', 'fee', 'amount', 'invoice'],
  format: ['pdf', 'document', 'file'],
  teacher: ['lecturer', 'instructor'],
  instructor: ['lecturer', 'teacher'],
  required: ['requirement', 'must', 'need'],
  need: ['required', 'requirement', 'must'],
};
export const CHAT_DEFAULTS = Object.freeze({
  maxContextChars: 18000,
  maxChunks: 4,
  chunkSize: 4200,
  overlap: 250,
  maxQuestionLength: 3000,
  maxHistoryMessages: 8,
});
const integer = (name, fallback, min) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min ? value : fallback;
};
export function getDocumentChatConfig() {
  const maxContextChars = Math.min(
    64000,
    integer('AI_CHAT_MAX_CONTEXT_CHARS', CHAT_DEFAULTS.maxContextChars, 2000),
  );
  const chunkSize = Math.min(
    maxContextChars - 256,
    integer('AI_CHAT_CHUNK_SIZE', CHAT_DEFAULTS.chunkSize, 1000),
  );
  return Object.freeze({
    maxContextChars,
    chunkSize,
    maxChunks: Math.min(20, integer('AI_CHAT_MAX_CHUNKS', CHAT_DEFAULTS.maxChunks, 1)),
    overlap: Math.min(
      Math.floor(chunkSize / 4),
      integer('AI_CHAT_CHUNK_OVERLAP', CHAT_DEFAULTS.overlap, 0),
    ),
    maxQuestionLength: integer('AI_CHAT_MAX_QUESTION_LENGTH', CHAT_DEFAULTS.maxQuestionLength, 100),
    maxHistoryMessages: integer(
      'AI_CHAT_MAX_HISTORY_MESSAGES',
      CHAT_DEFAULTS.maxHistoryMessages,
      2,
    ),
  });
}
export function normalizeTerms(value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 1 && !STOP.has(term));
  const terms = new Set();
  for (const term of base) {
    const stem = term.replace(/(ing|ed|es|s)$/i, '');
    terms.add(term);
    if (stem.length > 2) terms.add(stem);
    for (const alias of ALIASES[term] || ALIASES[stem] || []) terms.add(alias);
  }
  return [...terms];
}
export function splitChatChunks(text, config = getDocumentChatConfig()) {
  return splitKnowledgeChunks(text, {
    chunkSize: config.chunkSize,
    overlap: Math.min(config.overlap, Math.floor(config.chunkSize / 4)),
  }).map((chunk) => ({ ...chunk, text: chunk.content }));
}
export function scoreChunk(chunk, question) {
  const terms = normalizeTerms(question);
  if (!terms.length) return 0;
  const body = chunk.text.toLowerCase();
  const heading = chunk.label.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = body.match(new RegExp(`\\b${escaped}`, 'g'))?.length || 0;
    score += Math.min(matches, 5);
    if (heading.includes(term)) score += 5;
  }
  const phrase = String(question)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
  if (phrase.length > 5 && body.includes(phrase)) score += 8;
  return score;
}
export function selectDocumentContext({
  extractedText,
  question,
  history = [],
  config = getDocumentChatConfig(),
}) {
  const chunks = splitChatChunks(extractedText, config);
  if (chunks.length === 1) return { chunks, context: chunks[0].text, totalChunks: 1 };
  const historyText = history
    .slice(-config.maxHistoryMessages)
    .map((message) => message.content)
    .join(' ');
  const ranked = chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, `${question} ${historyText}`) }))
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
  const selected = [];
  let used = 0;
  for (const chunk of ranked) {
    if (selected.length >= config.maxChunks) break;
    const framing = chunk.label.length + 3 + (selected.length ? 2 : 0);
    const remaining = config.maxContextChars - used - framing;
    if (remaining <= 0) break;
    const text = chunk.text.slice(0, remaining);
    if (text) {
      selected.push({ ...chunk, text });
      used += framing + text.length;
    }
  }
  selected.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const context = selected
    .map((chunk) => `[${chunk.label}]\n${chunk.text}`)
    .join('\n\n')
    .slice(0, config.maxContextChars);
  return { chunks: selected, context, totalChunks: chunks.length };
}
