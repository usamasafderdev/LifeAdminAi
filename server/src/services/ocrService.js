import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { MAX_EXTRACTED_TEXT_LENGTH, PdfExtractionError } from './pdfExtractionService.js';

const ocrCachePath = fileURLToPath(new URL('../../.cache/tesseract/', import.meta.url));

export class OcrError extends Error {
  constructor(message = 'Unable to read this image', statusCode = 400) {
    super(message);
    this.name = 'OcrError';
    this.statusCode = statusCode;
  }
}

export function normalizeOcrText(text) {
  return String(text ?? '')
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateOcrTextLength(text) {
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new OcrError('This image contains more text than the current extraction limit supports.', 422);
  }
  return text;
}

export async function extractTextFromImage(trustedFilePath) {
  let worker;
  try {
    const image = await fs.readFile(trustedFilePath);
    const metadata = await sharp(image, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
      throw new OcrError();
    }
    await fs.mkdir(ocrCachePath, { recursive: true });
    worker = await createWorker('eng', undefined, { cachePath: ocrCachePath });
    const result = await worker.recognize(image);
    const text = validateOcrTextLength(normalizeOcrText(result.data.text));
    return { text, confidence: Number(result.data.confidence) || 0 };
  } catch (error) {
    if (error instanceof OcrError) throw error;
    if (error instanceof PdfExtractionError) throw new OcrError(error.message, error.statusCode);
    throw new OcrError();
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}
