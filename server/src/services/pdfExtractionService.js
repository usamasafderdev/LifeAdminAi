import fs from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

export const MAX_EXTRACTED_TEXT_LENGTH = 200000;

export class PdfExtractionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PdfExtractionError';
    this.statusCode = statusCode;
  }
}

export function normalizePdfText(text) {
  return String(text ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^-- \d+ of \d+ --\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateExtractedTextLength(text) {
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new PdfExtractionError(
      'This PDF contains more text than the current extraction limit supports.',
      422,
    );
  }
  return text;
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function formatIntro(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    if (index === 0 && line.length <= 140) return `# ${line}`;
    const field = line.match(/^([^:]{2,40}):\s*(.+)$/);
    return field ? `**${field[1].trim()}:** ${field[2].trim()}` : line;
  }).join('\n\n');
}

function formatTables(tableResult) {
  const tables = tableResult?.pages?.flatMap((page) => page.tables ?? []) ?? [];
  return tables.map((table, index) => {
    if (!table.length) return '';
    const columnCount = Math.max(...table.map((row) => row.length));
    const rows = table.map((row) => Array.from({ length: columnCount }, (_, column) => escapeMarkdownCell(row[column])));
    const header = rows[0];
    const body = rows.slice(1);
    const headerText = header.join(' ').toLowerCase();
    const title = headerText.includes('transaction') || (headerText.includes('description') && headerText.includes('balance'))
      ? 'Transactions'
      : headerText.includes('account')
        ? 'Account details'
        : `Extracted table ${index + 1}`;
    return [
      `## ${title}`,
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
  }).filter(Boolean).join('\n\n');
}

export function formatExtractedPdfContent(rawText, tableResult) {
  const normalized = normalizePdfText(rawText);
  const firstTable = tableResult?.pages?.flatMap((page) => page.tables ?? [])?.[0];
  if (!firstTable?.length) return normalized;
  const firstHeader = firstTable[0].map((cell) => normalizePdfText(cell).replace(/\n/g, ' ')).join(' ');
  const tableStart = normalized.indexOf(firstHeader);
  const intro = tableStart >= 0 ? normalized.slice(0, tableStart).trim() : '';
  const formattedTables = formatTables(tableResult);
  return [intro ? formatIntro(intro) : '', formattedTables].filter(Boolean).join('\n\n');
}

export async function extractPdfText(trustedFilePath) {
  let parser;
  try {
    const data = await fs.readFile(trustedFilePath);
    if (data.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new PdfExtractionError('Unable to read this PDF');
    }
    parser = new PDFParse({ data });
    const result = await parser.getText();
    const tableResult = await parser.getTable().catch(() => null);
    const text = validateExtractedTextLength(result.pages.length > 1
      ? result.pages.map((page, index) => {
        const pageTables = tableResult?.pages?.[index]
          ? { pages: [tableResult.pages[index]] }
          : null;
        return `[[PAGE:${page.num}]]\n${formatExtractedPdfContent(page.text, pageTables)}`;
      }).join('\n\n')
      : formatExtractedPdfContent(result.text, tableResult));
    return { text, pageCount: result.total };
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    throw new PdfExtractionError('Unable to read this PDF');
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}
