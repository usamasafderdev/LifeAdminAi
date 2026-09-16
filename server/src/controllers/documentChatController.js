import {
  resolveConversation,
  historyFilter,
  saveChatPair,
  withChatPersistence,
  clearChatHistory,
} from '../services/chatPersistenceService.js';
import { suggestMemories } from '../services/memoryService.js';
import { containsCredentials } from '../services/memoryExtractionService.js';
import { getKnowledgeSource } from '../services/documentKnowledgeService.js';
import mongoose from 'mongoose';
import Document from '../models/Document.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import { getDocumentChatConfig } from '../services/documentChatContextService.js';
import { answerDocumentQuestion } from '../services/documentChatService.js';
import GeneratedDocument from '../models/GeneratedDocument.js';
import {
  detectChatIntent,
  generateDocumentContent,
  isExportOnlyIntent,
  resolveGeneratedFile,
  writeGeneratedDocx,
} from '../services/documentGenerationService.js';
import fs from 'node:fs/promises';

let answerer = answerDocumentQuestion;
let documentGenerator = generateDocumentContent;
const invalid = (message) => ({ success: false, message });
const validId = (id) => mongoose.isObjectIdOrHexString(id);
async function ownedDocument(id, userId) {
  return Document.findOne({ _id: id, userId });
}

export async function getDocumentChat(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    if (!(await ownedDocument(req.params.id, req.user._id)))
      return res.status(404).json(invalid('Document not found'));
    req.conversation = await resolveConversation(req, 'document');
    const messages = await DocumentChatMessage.find({
      ...historyFilter(req),
      userId: req.user._id,
      documentId: req.params.id,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .select('role content sources attachment createdAt requestId status')
      .lean();
    messages.reverse();
    return res.json({ success: true, messages, count: messages.length });
  } catch (error) {
    return next(error);
  }
}

async function postDocumentChatImpl(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    const document = await ownedDocument(req.params.id, req.user._id);
    if (!document) return res.status(404).json(invalid('Document not found'));
    const message =
      typeof req.body?.message === 'string' ? req.body.message.replace(/\0/g, '').trim() : '';
    const { maxQuestionLength, maxHistoryMessages } = getDocumentChatConfig();
    if (containsCredentials(message))
      return res
        .status(400)
        .json(invalid('Remove passwords, tokens, and financial credentials before sending.'));
    if (!message) return res.status(400).json(invalid('Question is required'));
    if (message.length > maxQuestionLength)
      return res
        .status(400)
        .json(invalid(`Question cannot exceed ${maxQuestionLength} characters`));
    if (!document.extractedText?.trim())
      return res
        .status(400)
        .json(invalid('This document does not contain readable text to chat with'));
    const history = await DocumentChatMessage.find({
      ...historyFilter(req),
      userId: req.user._id,
      documentId: document._id,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(maxHistoryMessages)
      .select('role content')
      .lean();
    history.reverse();
    if (detectChatIntent(message) === 'GENERATE_FILE') {
      if (isExportOnlyIntent(message)) {
        const existing = await GeneratedDocument.findOne({
          userId: req.user._id,
          sourceDocumentId: document._id,
        }).sort({ createdAt: -1 });
        if (existing) {
          const answer = 'Your previously generated document is ready to download.';
          const attachment = {
            generatedDocumentId: existing._id,
            type: 'generated_document',
            format: 'docx',
            fileName: existing.fileName,
          };
          const [userMessage, assistantMessage] = await saveChatPair(req, [
            { userId: req.user._id, documentId: document._id, role: 'user', content: message },
            {
              userId: req.user._id,
              documentId: document._id,
              role: 'assistant',
              content: answer,
              attachment,
            },
          ]);
          return res.status(201).json({
            success: true,
            memory: await suggestMemories(req.user._id, message).catch(() => null),
            answer,
            attachment,
            reused: true,
            message: assistantMessage,
            userMessage,
          });
        }
      }
      const result = await documentGenerator({ document, question: message });
      let file;
      try {
        file = await writeGeneratedDocx(result.content, document.extractedText);
        const generated = await GeneratedDocument.create({
          userId: req.user._id,
          sourceDocumentId: document._id,
          fileName: file.fileName,
          filePath: file.filePath,
          size: file.size,
          structuredContent: result.content,
        });
        const answer =
          'Your document is ready. I created the best complete draft from the supplied material; unresolved personal details and unverified references remain clearly marked as placeholders.';
        const attachment = {
          generatedDocumentId: generated._id,
          type: 'generated_document',
          format: 'docx',
          fileName: generated.fileName,
        };
        const [userMessage, assistantMessage] = await saveChatPair(req, [
          { userId: req.user._id, documentId: document._id, role: 'user', content: message },
          {
            userId: req.user._id,
            documentId: document._id,
            role: 'assistant',
            content: answer,
            model: result.model,
            attachment,
          },
        ]);
        return res.status(201).json({
          success: true,
          memory: await suggestMemories(req.user._id, message).catch(() => null),
          answer,
          attachment,
          message: assistantMessage,
          userMessage,
        });
      } catch (error) {
        if (file?.absolutePath) await fs.unlink(file.absolutePath).catch(() => {});
        throw error;
      }
    }
    const result = await answerer({ document, question: message, history });
    const [userMessage, assistantMessage] = await saveChatPair(req, [
      { userId: req.user._id, documentId: document._id, role: 'user', content: message },
      {
        userId: req.user._id,
        documentId: document._id,
        role: 'assistant',
        content: result.answer,
        model: result.model,
        sources: result.sources,
      },
    ]);
    return res.status(201).json({
      success: true,
      memory: await suggestMemories(req.user._id, message).catch(() => null),
      answer: result.answer,
      sources: result.sources,
      message: assistantMessage,
      userMessage,
    });
  } catch (error) {
    return next(error);
  }
}

export async function downloadGeneratedDocument(req, res, next) {
  try {
    if (!validId(req.params.generatedId))
      return res.status(400).json(invalid('Invalid generated document ID'));
    const sourceDocumentId =
      typeof req.params.id === 'string' && validId(req.params.id) ? req.params.id : null;
    const filter = { _id: req.params.generatedId, userId: req.user._id };
    if (sourceDocumentId) filter.sourceDocumentId = sourceDocumentId;
    const generated = await GeneratedDocument.findOne(filter);
    if (!generated) return res.status(404).json(invalid('Generated document not found'));
    const file = resolveGeneratedFile(generated.filePath);
    if (!file) return res.status(404).json(invalid('Generated document not found'));
    return res.download(file, generated.fileName, (error) => {
      if (error && !res.headersSent)
        next(Object.assign(new Error('Generated document is unavailable'), { statusCode: 404 }));
    });
  } catch (error) {
    return next(error);
  }
}

export async function clearDocumentChat(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid document ID'));
    if (!(await ownedDocument(req.params.id, req.user._id)))
      return res.status(404).json(invalid('Document not found'));
    const result = await clearChatHistory(req, 'document');
    return res.json({
      success: true,
      message: 'Document chat cleared',
      deleted: result.deletedCount || 0,
    });
  } catch (error) {
    return next(error);
  }
}

export function setDocumentChatAnswererForTests(value) {
  answerer = value || answerDocumentQuestion;
}
export function setDocumentGeneratorForTests(value) {
  documentGenerator = value || generateDocumentContent;
}

export async function getDocumentSource(req, res, next) {
  try {
    const chunkIndex = Number(req.params.chunkIndex);
    if (!validId(req.params.id) || !Number.isInteger(chunkIndex) || chunkIndex < 0)
      return res.status(400).json(invalid('Invalid document source'));
    const chunk = await getKnowledgeSource({
      documentId: req.params.id,
      userId: req.user._id,
      chunkIndex,
      revision: typeof req.query.revision === 'string' ? req.query.revision : '',
    });
    return res.json({ success: true, chunk });
  } catch (error) {
    return next(error);
  }
}

export const postDocumentChat = withChatPersistence('document', postDocumentChatImpl);
