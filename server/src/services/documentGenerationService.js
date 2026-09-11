import { retrieveMemories, markMemoriesUsed, MEMORY_PROMPT } from './memoryService.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document as WordDocument,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import { generateText } from './ai/aiService.js';
import GeneratedDocument from '../models/GeneratedDocument.js';
import { splitChatChunks } from './documentChatContextService.js';

export const generatedRoot = fileURLToPath(new URL('../../generated/', import.meta.url));
const MAX_SECTIONS = 30;
const clean = (value, max) =>
  String(value || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, max);
const safeName = (value) =>
  clean(value, 100)
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'LifeAdmin_Document';

export function detectChatIntent(question) {
  const text = String(question || '').toLowerCase();
  const file =
    /\b(docx|word file|downloadable|download|export|create (?:a |the )?(?:final )?document|generate (?:a |the )?(?:final )?(?:document|report))\b/.test(
      text,
    ) ||
    /\bgenerate\b.*\b(?:final|complete)\b.*\b(?:version|document|report|assignment)\b/.test(text);
  const complete =
    file || /\b(complete|final|full|entire)\s+(document|report|assignment|version)\b/.test(text);
  const draft = /\b(write|draft|solve|complete|help me (?:do|complete)|develop)\b/.test(text);
  return file
    ? 'GENERATE_FILE'
    : complete
      ? 'COMPLETE_DOCUMENT'
      : draft
        ? 'DRAFT_OR_SOLUTION'
        : 'FACTUAL_QA';
}
export function isExportOnlyIntent(question) {
  const text = String(question || '').toLowerCase();
  return (
    /\b(download|downloadable|export|give|provide)\b/.test(text) &&
    /\b(docx|word|file)\b/.test(text) &&
    !/\b(generate|create|rewrite|new)\b/.test(text)
  );
}

function broadContext(document, limit = 36000) {
  const analysis = document.aiAnalysis || {};
  const structured = JSON.stringify({
    summary: analysis.summary,
    importantDates: analysis.importantDates,
    requirements: analysis.keyInformation,
    actions: analysis.extractedActions,
    risks: analysis.risksOrConsequences,
  }).slice(0, 8000);
  const chunks = splitChatChunks(document.extractedText, {
    maxContextChars: limit,
    maxChunks: 12,
    chunkSize: 4000,
    overlap: 150,
    maxHistoryMessages: 8,
  });
  const representative =
    chunks.length <= 10
      ? chunks
      : [
          chunks[0],
          ...chunks
            .slice(1, -1)
            .filter((_, index) => index % Math.ceil(chunks.length / 8) === 0)
            .slice(0, 8),
          chunks.at(-1),
        ];
  return `STRUCTURED ANALYSIS:\n${structured}\n\nSOURCE EXCERPTS:\n${representative.map((item) => `[${item.label}]\n${item.text}`).join('\n\n')}`.slice(
    0,
    limit,
  );
}

export function normalizeGeneratedContent(raw, fallbackTitle) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '') : raw;
  } catch {
    throw Object.assign(new Error('The AI returned an invalid document structure'), {
      statusCode: 502,
      code: 'INVALID_GENERATED_DOCUMENT',
    });
  }
  const title = clean(parsed?.title || fallbackTitle, 200);
  const sections = Array.isArray(parsed?.sections)
    ? parsed.sections
        .slice(0, MAX_SECTIONS)
        .map((section) => ({
          heading: clean(section?.heading, 200),
          level: Math.min(3, Math.max(1, Number(section?.level) || 1)),
          paragraphs: (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
            .slice(0, 30)
            .map((item) => clean(item, 5000))
            .filter(Boolean),
          bullets: (Array.isArray(section?.bullets) ? section.bullets : [])
            .slice(0, 30)
            .map((item) => clean(item, 1000))
            .filter(Boolean),
        }))
        .filter(
          (section) => section.heading && (section.paragraphs.length || section.bullets.length),
        )
    : [];
  if (!title || !sections.length)
    throw Object.assign(new Error('The generated document did not contain valid sections'), {
      statusCode: 502,
      code: 'INVALID_GENERATED_DOCUMENT',
    });
  return { title, subtitle: clean(parsed?.subtitle, 300), sections };
}

export async function generateDocumentContent({ document, question, generate = generateText }) {
  const context = broadContext(document);
  const memories = document.userId
    ? await retrieveMemories(document.userId, question)
    : { context: '', ids: [] };
  const result = await generate({
    systemPrompt: `${MEMORY_PROMPT} Output files are DOCX; do not claim to generate another file format. You are LifeAdmin's professional document author. Use source content as the authority for document-specific facts and requirements, but create substantive original draft content using general knowledge when requested. Never invent identity details, deadlines, marks, names, citation metadata, URLs, authors, or publication details. Use bracketed placeholders such as [Student Name] and [Reference to verify] for missing facts. Do not refuse merely because the source is incomplete. Return JSON only: {"title":"...","subtitle":"...","sections":[{"heading":"...","level":1,"paragraphs":["..."],"bullets":["..."]}]}. Clearly label unresolved assumptions or generated-draft notes where appropriate.`,
    userPrompt: `<saved_memories>\n${memories.context || 'None'}\n</saved_memories>\nSource title: ${document.title}\nUser request: ${question}\n\n${context}`,
    temperature: 0.25,
    maxTokens: 4096,
    jsonSchema: { type: 'object' },
  });
  const content = normalizeGeneratedContent(result.text, document.title);
  await markMemoriesUsed(document.userId, memories);
  return { content, model: result.model || '', contextLength: context.length };
}

export async function createDocxBuffer(content, sourceText = '') {
  const times = /times new roman/i.test(sourceText);
  const spacing15 = /1(?:\.5|\.50)\s*(?:line|spacing)|one and a half/i.test(sourceText);
  const font = times ? 'Times New Roman' : 'Aptos';
  const size = times ? 24 : 22;
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [new TextRun({ text: content.title, bold: true, font, size: 34 })],
    }),
    ...(content.subtitle
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
            children: [new TextRun({ text: content.subtitle, italics: true, font, size })],
          }),
        ]
      : []),
  ];
  for (const section of content.sections) {
    children.push(
      new Paragraph({
        heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][
          section.level - 1
        ],
        spacing: { before: 260, after: 120 },
        children: [new TextRun({ text: section.heading, bold: true, font })],
      }),
    );
    for (const text of section.paragraphs)
      children.push(
        new Paragraph({
          spacing: { after: 140, line: spacing15 ? 360 : 276 },
          children: [new TextRun({ text, font, size })],
        }),
      );
    for (const text of section.bullets)
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80, line: spacing15 ? 360 : 276 },
          children: [new TextRun({ text, font, size })],
        }),
      );
  }
  const doc = new WordDocument({
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing: { line: spacing15 ? 360 : 276 } } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun('LifeAdmin AI · '),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function createPdfBuffer(content) {
  const lines = [`LifeAdmin AI Document`, ``, content.title, ``];
  for (const section of content.sections) {
    lines.push(section.heading);
    for (const paragraph of section.paragraphs) lines.push(paragraph);
    for (const bullet of section.bullets) lines.push(`• ${bullet}`);
    lines.push('');
  }
  const text = lines.join('\n');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length ${text.length + 100} >>\nstream\nBT /F1 12 Tf 50 760 Td (${text.replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) Tj ET\nendstream\nendobj\n`,
    'binary',
  );
}

export async function createMarkdownBuffer(content) {
  const lines = [`# ${content.title}`];
  if (content.subtitle) lines.push(`> ${content.subtitle}`);
  for (const section of content.sections) {
    lines.push(`\n## ${section.heading}`);
    for (const paragraph of section.paragraphs) lines.push(`\n${paragraph}`);
    if (section.bullets.length) lines.push(`\n- ${section.bullets.join('\n- ')}`);
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

export async function writeGeneratedDocx(content, sourceText = '') {
  await fs.mkdir(generatedRoot, { recursive: true });
  const fileName = `${safeName(content.title)}.docx`;
  const storedName = `${Date.now()}-${crypto.randomUUID()}.docx`;
  const absolutePath = path.join(generatedRoot, storedName);
  const buffer = await createDocxBuffer(content, sourceText);
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
  return { fileName, filePath: storedName, size: buffer.length, absolutePath };
}

export async function writeGeneratedFile({
  content,
  userId,
  format = 'docx',
  sourceDocumentId = null,
  generationType = 'standalone_document',
}) {
  await fs.mkdir(generatedRoot, { recursive: true });
  const fileName = `${safeName(content.title)}.${format}`;
  const storedName = `${Date.now()}-${crypto.randomUUID()}.${format}`;
  const absolutePath = path.join(generatedRoot, storedName);
  let buffer;
  if (format === 'docx') buffer = await createDocxBuffer(content);
  else if (format === 'pdf') buffer = await createPdfBuffer(content);
  else buffer = await createMarkdownBuffer(content);
  await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
  const generated = await GeneratedDocument.create({
    userId,
    sourceDocumentId,
    fileName,
    filePath: storedName,
    format,
    generationType,
    size: buffer.length,
    structuredContent: content,
  });
  return {
    generatedDocument: generated,
    absolutePath,
    fileName,
    filePath: storedName,
    size: buffer.length,
  };
}

export async function generatePromptDocument({
  userId,
  prompt,
  documentType = 'report',
  format = 'docx',
  sourceDocumentId = null,
  generate = generateText,
}) {
  const systemPrompt = `${MEMORY_PROMPT} Create a ${documentType} document for the user. Return JSON only: {"title":"...","subtitle":"...","sections":[{"heading":"...","level":1,"paragraphs":["..."],"bullets":["..."]}]}. Use a professional report structure with title page, headings, paragraphs, tables, references, and notations if appropriate. When facts are not supplied, use bracketed placeholders like [Reference needed].`;
  const result = await generate({
    systemPrompt,
    userPrompt: `Create a ${documentType} from this request:\n${prompt}`,
    temperature: 0.25,
    maxTokens: 4096,
    jsonSchema: { type: 'object' },
  });
  const content = normalizeGeneratedContent(
    result.text,
    documentType
      ? `${documentType[0].toUpperCase()}${documentType.slice(1)}`
      : 'LifeAdmin Document',
  );
  const file = await writeGeneratedFile({
    content,
    userId,
    format,
    sourceDocumentId,
    generationType: 'standalone_document',
  });
  return file;
}

export function resolveGeneratedFile(filePath) {
  const resolved = path.resolve(generatedRoot, String(filePath || ''));
  const root = `${path.resolve(generatedRoot)}${path.sep}`;
  return resolved.startsWith(root) ? resolved : null;
}
