import mongoose from 'mongoose';
import Document, { DOCUMENT_CATEGORIES } from '../models/Document.js';
import { storedFilePath } from '../config/upload.js';
import { deleteFileIfExists, resolveStoredFile } from '../utils/fileUtils.js';
import { extractPdfText } from '../services/pdfExtractionService.js';
import { extractTextFromImage } from '../services/ocrService.js';
import { analyzeDocumentText } from '../services/documentAiService.js';
import { AiError } from '../services/ai/aiService.js';
import { validateConfirmedAnalysis } from '../services/aiAnalysisValidator.js';
import Task from '../models/Task.js';
import { generateTasksFromAnalysis } from '../services/taskGenerationService.js';

const JSON_SOURCE_TYPES = ['text', 'manual'];
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 200000;
const EDITABLE_FIELDS = ['title', 'sourceType', 'category', 'extractedText'];
const FORBIDDEN_UPDATE_FIELDS = ['userId', '_id', 'createdAt', 'originalFilename', 'mimeType', 'filePath'];
let documentAnalyzer = analyzeDocumentText;

function invalid(message) {
  return { success: false, message };
}

function validateFields(input, { partial = false } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = {};

  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim()) return { error: 'Title is required' };
    if (body.title.trim().length > MAX_TITLE_LENGTH) return { error: `Title cannot exceed ${MAX_TITLE_LENGTH} characters` };
    values.title = body.title.trim();
  }

  if (!partial || Object.hasOwn(body, 'sourceType')) {
    if (typeof body.sourceType !== 'string' || !JSON_SOURCE_TYPES.includes(body.sourceType)) {
      return { error: 'Source type must be text or manual' };
    }
    values.sourceType = body.sourceType;
  }

  if (Object.hasOwn(body, 'category')) {
    if (typeof body.category !== 'string' || !DOCUMENT_CATEGORIES.includes(body.category)) {
      return { error: 'Invalid document category' };
    }
    values.category = body.category;
  } else if (!partial) {
    values.category = 'other';
  }

  if (Object.hasOwn(body, 'extractedText')) {
    if (typeof body.extractedText !== 'string') return { error: 'Extracted text must be a string' };
    if (body.extractedText.length > MAX_TEXT_LENGTH) return { error: `Extracted text cannot exceed ${MAX_TEXT_LENGTH} characters` };
    values.extractedText = body.extractedText;
  } else if (!partial) {
    values.extractedText = '';
  }

  return { values };
}

function validId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

export async function createDocument(req, res, next) {
  try {
    const validation = validateFields(req.body);
    if (validation.error) return res.status(400).json(invalid(validation.error));

    const document = await Document.create({
      ...validation.values,
      userId: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Document created successfully',
      document,
    });
  } catch (error) {
    return next(error);
  }
}

export async function uploadDocument(req, res, next) {
  const filePath = req.file ? storedFilePath(req.file) : null;
  try {
    if (!req.file) return res.status(400).json(invalid('A file is required'));

    const suppliedTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : null;
    if (suppliedTitle !== null && !suppliedTitle) {
      await deleteFileIfExists(filePath);
      return res.status(400).json(invalid('Title cannot be empty'));
    }
    const fallbackTitle = req.file.originalname.replace(/\.[^.]+$/, '').trim();
    const title = suppliedTitle ?? fallbackTitle;
    if (!title || title.length > MAX_TITLE_LENGTH) {
      await deleteFileIfExists(filePath);
      return res.status(400).json(invalid(title ? `Title cannot exceed ${MAX_TITLE_LENGTH} characters` : 'Title is required'));
    }

    const category = typeof req.body?.category === 'string' && req.body.category
      ? req.body.category
      : 'other';
    if (!DOCUMENT_CATEGORIES.includes(category)) {
      await deleteFileIfExists(filePath);
      return res.status(400).json(invalid('Invalid document category'));
    }

    const sourceType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'image';
    let extractedText = '';
    if (sourceType === 'pdf') {
      const trustedPath = resolveStoredFile(filePath);
      if (!trustedPath) throw new Error('Stored upload path could not be resolved');
      ({ text: extractedText } = await extractPdfText(trustedPath));
    } else {
      const trustedPath = resolveStoredFile(filePath);
      if (!trustedPath) throw new Error('Stored upload path could not be resolved');
      ({ text: extractedText } = await extractTextFromImage(trustedPath));
    }
    const document = await Document.create({
      userId: req.user._id,
      title,
      sourceType,
      category,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      filePath,
      extractedText,
    });

    return res.status(201).json({
      success: true,
      message: !extractedText
        ? sourceType === 'pdf'
          ? 'PDF uploaded, but no extractable text was found'
          : 'Image uploaded, but no readable text was detected'
        : sourceType === 'image' ? 'Image processed successfully' : 'Document uploaded successfully',
      document,
    });
  } catch (error) {
    if (filePath) {
      try {
        await deleteFileIfExists(filePath);
      } catch {
        // Preserve the original request failure while avoiding filesystem details in the response.
      }
    }
    return next(error);
  }
}

export async function listDocuments(req, res, next) {
  try {
    const documents = await Document.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, documents, count: documents.length });
  } catch (error) {
    return next(error);
  }
}

export async function getDocument(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    return res.status(200).json({ success: true, document });
  } catch (error) {
    return next(error);
  }
}

export async function getDocumentFile(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document?.filePath) return res.status(404).json(invalid('Document file not found'));
    const trustedPath = resolveStoredFile(document.filePath);
    if (!trustedPath) return res.status(404).json(invalid('Document file not found'));
    res.set({
      'Content-Type': document.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.originalFilename || 'document.pdf')}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.sendFile(trustedPath);
  } catch (error) {
    return next(error);
  }
}

export async function updateDocument(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (FORBIDDEN_UPDATE_FIELDS.some((field) => Object.hasOwn(body, field))) {
      return res.status(400).json(invalid('Document ownership and file metadata cannot be changed'));
    }
    const submittedFields = EDITABLE_FIELDS.filter((field) => Object.hasOwn(body, field));
    if (!submittedFields.length) return res.status(400).json(invalid('No editable document fields provided'));

    const validation = validateFields(body, { partial: true });
    if (validation.error) return res.status(400).json(invalid(validation.error));

    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    Object.assign(document, validation.values);
    await document.save();
    return res.status(200).json({ success: true, message: 'Document updated successfully', document });
  } catch (error) {
    return next(error);
  }
}

export async function deleteDocument(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    await Document.deleteOne({ _id: document._id, userId: req.user._id });
    if (document.filePath) await deleteFileIfExists(document.filePath);
    return res.status(200).json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

export async function analyzeDocument(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));

    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    if (!document.extractedText?.trim()) {
      return res.status(400).json(invalid('This document has no text available for analysis'));
    }

    const regenerate = req.body?.regenerate === true;
    if (document.aiAnalysis?.status === 'completed' && !regenerate) {
      return res.status(200).json({
        success: true,
        message: 'Existing document analysis returned',
        analysis: document.aiAnalysis,
        cached: true,
      });
    }
    if (document.aiAnalysis?.status === 'processing') {
      return res.status(409).json(invalid('Document analysis is already in progress'));
    }

    document.aiAnalysis = {
      ...(document.aiAnalysis?.toObject?.() || document.aiAnalysis || {}),
      status: 'processing',
      errorMessage: '',
    };
    await document.save();

    try {
      const result = await documentAnalyzer({
        title: document.title,
        category: document.category,
        extractedText: document.extractedText,
      });
      document.aiAnalysis = {
        status: 'completed',
        ...result,
        analyzedAt: new Date(),
        errorMessage: '',
        reviewStatus: 'pending_review',
        reviewedAt: null,
        confirmedAnalysis: undefined,
        confirmedBy: null,
      };
      await document.save();
      return res.status(200).json({
        success: true,
        message: 'Document analyzed successfully',
        analysis: document.aiAnalysis,
        cached: false,
      });
    } catch (error) {
      document.aiAnalysis.status = 'failed';
      document.aiAnalysis.errorMessage = error.code === 'AI_RESPONSE_VALIDATION_FAILED'
        ? 'AI response validation failed.'
        : error instanceof AiError && error.code === 'AI_NOT_CONFIGURED'
          ? 'AI analysis is not configured.'
          : 'Document analysis could not be completed.';
      await document.save();
      throw error;
    }
  } catch (error) {
    return next(error);
  }
}

export function setDocumentAnalyzerForTests(analyzer) {
  documentAnalyzer = analyzer || analyzeDocumentText;
}

export async function getDocumentAnalysis(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id }).select('aiAnalysis');
    if (!document) return res.status(404).json(invalid('Document not found'));
    const analysis = document.aiAnalysis || null;
    return res.status(200).json({
      success: true,
      aiAnalysis: analysis,
      reviewStatus: analysis?.reviewStatus || null,
      confirmedAnalysis: analysis?.confirmedAnalysis || null,
    });
  } catch (error) {
    return next(error);
  }
}

export async function confirmDocumentAnalysis(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    if (document.aiAnalysis?.status !== 'completed') {
      return res.status(409).json(invalid('No completed AI analysis is available for review'));
    }

    const confirmedAnalysis = validateConfirmedAnalysis(req.body?.analysis);
    document.aiAnalysis.confirmedAnalysis = confirmedAnalysis;
    document.aiAnalysis.reviewStatus = 'confirmed';
    document.aiAnalysis.reviewedAt = new Date();
    document.aiAnalysis.confirmedBy = req.user._id;
    await document.save();
    return res.status(200).json({
      success: true,
      message: 'Analysis confirmed successfully',
      reviewStatus: document.aiAnalysis.reviewStatus,
      reviewedAt: document.aiAnalysis.reviewedAt,
      confirmedAnalysis: document.aiAnalysis.confirmedAnalysis,
    });
  } catch (error) {
    return next(error);
  }
}

export async function rejectDocumentAnalysis(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    if (document.aiAnalysis?.status !== 'completed') {
      return res.status(409).json(invalid('No completed AI analysis is available for review'));
    }

    document.aiAnalysis.reviewStatus = 'rejected';
    document.aiAnalysis.reviewedAt = new Date();
    document.aiAnalysis.confirmedAnalysis = undefined;
    document.aiAnalysis.confirmedBy = null;
    await document.save();
    return res.status(200).json({
      success: true,
      message: 'Analysis rejected',
      reviewStatus: document.aiAnalysis.reviewStatus,
      reviewedAt: document.aiAnalysis.reviewedAt,
    });
  } catch (error) {
    return next(error);
  }
}

export async function createTasksFromAnalysis(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await Document.findOne({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    if (document.aiAnalysis?.reviewStatus !== 'confirmed' || !document.aiAnalysis.confirmedAnalysis) {
      return res.status(400).json(invalid('Document has no confirmed analysis'));
    }

    const allowedFields = ['actionIndexes'];
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (Object.keys(body).some((field) => !allowedFields.includes(field))) return res.status(400).json(invalid('Only confirmed task selections are accepted'));
    const { tasks: candidates, skippedDuplicates } = await generateTasksFromAnalysis(document, req.user._id, { actionIndexes: body.actionIndexes });
    const tasks = candidates.length ? await Task.insertMany(candidates) : [];
    return res.status(201).json({
      success: true,
      message: tasks.length ? `${tasks.length} task${tasks.length === 1 ? '' : 's'} created` : 'No new tasks to create',
      tasks,
      created: tasks.length,
      skipped: skippedDuplicates,
      createdCount: tasks.length,
      skippedCount: skippedDuplicates,
    });
  } catch (error) { return next(error); }
}
