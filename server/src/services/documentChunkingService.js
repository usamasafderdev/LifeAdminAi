const DEFAULTS = Object.freeze({
  directCharLimit: 10000,
  chunkSize: 8000,
  chunkOverlap: 400,
  maxChunks: 12,
  maxAnalysisChars: 90000,
});

function configuredInteger(name, fallback, minimum) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}

export function getDocumentChunkingConfig() {
  const chunkSize = configuredInteger('AI_DOCUMENT_CHUNK_SIZE', DEFAULTS.chunkSize, 2000);
  const chunkOverlap = Math.min(
    configuredInteger('AI_DOCUMENT_CHUNK_OVERLAP', DEFAULTS.chunkOverlap, 0),
    Math.floor(chunkSize / 4),
  );
  return Object.freeze({
    directCharLimit: configuredInteger('AI_DOCUMENT_DIRECT_CHAR_LIMIT', DEFAULTS.directCharLimit, 2000),
    chunkSize,
    chunkOverlap,
    maxChunks: configuredInteger('AI_MAX_DOCUMENT_CHUNKS', DEFAULTS.maxChunks, 1),
    maxAnalysisChars: configuredInteger('AI_MAX_ANALYSIS_CHARS', DEFAULTS.maxAnalysisChars, chunkSize),
  });
}

export class DocumentTooLargeError extends Error {
  constructor() {
    super('This document is too large to analyze safely.');
    this.name = 'DocumentTooLargeError';
    this.code = 'DOCUMENT_TOO_LARGE';
    this.statusCode = 413;
  }
}

function semanticBoundary(text, start, target, minimumEnd) {
  const candidates = [text.lastIndexOf('\f', target), text.lastIndexOf('\n\n', target) + 2];
  const headingRegion = text.slice(start, target);
  const headingPattern = /\n(?=(?:\d+(?:\.\d+)*[.)]?\s+|question\s+\d+|part\s+[a-z0-9]+|section\s+\d+|final\s+submission))/gi;
  let match;
  while ((match = headingPattern.exec(headingRegion))) candidates.push(start + match.index + 1);
  return Math.max(...candidates.filter((index) => index >= minimumEnd), -1);
}

export function splitDocumentIntoChunks(extractedText, suppliedConfig = {}) {
  const config = { ...getDocumentChunkingConfig(), ...suppliedConfig };
  const text = extractedText.replace(/\r\n?/g, '\n').trim();
  if (text.length > config.maxAnalysisChars) throw new DocumentTooLargeError();
  if (text.length <= config.directCharLimit) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const target = Math.min(text.length, start + config.chunkSize);
    const minimumEnd = Math.min(target, start + Math.floor(config.chunkSize * 0.55));
    const boundary = target < text.length ? semanticBoundary(text, start, target, minimumEnd) : -1;
    const end = boundary > start ? boundary : target;
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(start + 1, end - config.chunkOverlap);
    if (chunks.length >= config.maxChunks) throw new DocumentTooLargeError();
  }
  return chunks;
}

export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

export { DEFAULTS as DOCUMENT_CHUNKING_DEFAULTS };
