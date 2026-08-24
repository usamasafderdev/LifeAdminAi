import mongoose from 'mongoose';
import Document, { DOCUMENT_CATEGORIES } from '../models/Document.js';

const JSON_SOURCE_TYPES = ['text', 'manual'];
const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 200000;
const EDITABLE_FIELDS = ['title', 'sourceType', 'category', 'extractedText'];
const FORBIDDEN_UPDATE_FIELDS = ['userId', '_id', 'createdAt', 'originalFilename', 'mimeType', 'filePath'];

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
    const document = await Document.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!document) return res.status(404).json(invalid('Document not found'));
    return res.status(200).json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    return next(error);
  }
}
