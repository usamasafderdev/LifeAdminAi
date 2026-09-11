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
    directCharLimit: configuredInteger(
      'AI_DOCUMENT_DIRECT_CHAR_LIMIT',
      DEFAULTS.directCharLimit,
      2000,
    ),
    chunkSize,
    chunkOverlap,
    maxChunks: configuredInteger('AI_MAX_DOCUMENT_CHUNKS', DEFAULTS.maxChunks, 1),
    maxAnalysisChars: configuredInteger(
      'AI_MAX_ANALYSIS_CHARS',
      DEFAULTS.maxAnalysisChars,
      chunkSize,
    ),
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
  const headingPattern =
    /\n(?=(?:\d+(?:\.\d+)*[.)]?\s+|question\s+\d+|part\s+[a-z0-9]+|section\s+\d+|final\s+submission))/gi;
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

// Knowledge chunks have no analysis-call limit: every extracted character is indexed.
export function splitKnowledgeChunks(value, { chunkSize = 4200, overlap = 250 } = {}) {
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 100 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap >= chunkSize
  )
    throw new Error('Invalid chunk configuration');
  const text = String(value || '');
  if (!text.trim()) return [];
  const boundaries = [0];
  const pattern = /[.!?](?:["')\]]*)\s+|\n+/g;
  let match;
  while ((match = pattern.exec(text))) boundaries.push(match.index + match[0].length);
  boundaries.push(text.length);
  const chunks = [];
  let start = 0;
  let page = null;
  let pageCursor = 0;
  const pages = [...text.matchAll(/\[\[PAGE:(\d+)\]\]/g)];
  while (start < text.length) {
    const target = Math.min(start + chunkSize, text.length);
    const nextPage = pages.find((marker) => marker.index > start && marker.index <= target);
    let end = target;
    if (nextPage) end = nextPage.index;
    else if (target < text.length) {
      const boundary = boundaries.findLast((position) => position > start && position <= target);
      if (boundary !== undefined) end = boundary;
      else {
        const whitespace = text.lastIndexOf(' ', target - 1);
        if (whitespace > start) end = whitespace + 1;
      }
    }
    while (pageCursor < pages.length && pages[pageCursor].index <= start)
      page = Number(pages[pageCursor++][1]);
    const content = text.slice(start, end);
    const firstPage = content.match(/\[\[PAGE:(\d+)\]\]/);
    const label = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !/^\[\[PAGE:/.test(line));
    if (content.trim())
      chunks.push({
        chunkIndex: chunks.length,
        content,
        characterCount: content.length,
        startOffset: start,
        endOffset: end,
        page: page || (firstPage ? Number(firstPage[1]) : null),
        label: label?.length <= 100 ? label : `Section ${chunks.length + 1}`,
      });
    if (end === text.length) break;
    const next = boundaries.find(
      (position) => position > start && position >= end - overlap && position < end,
    );
    start = nextPage ? end : (next ?? end);
  }
  return chunks;
}

export { DEFAULTS as DOCUMENT_CHUNKING_DEFAULTS };
