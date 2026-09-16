import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/authMiddleware.js';
import Conversation from '../models/Conversation.js';
import Document from '../models/Document.js';
import {
  ownedConversation,
  resolveConversation,
  messageModel,
  chatError,
} from '../services/chatPersistenceService.js';
import { postAssistantChat } from '../controllers/assistantController.js';
import { postDocumentChat } from '../controllers/documentChatController.js';
const router = express.Router();
router.use(protect);
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
router.post(
  '/',
  route(async (req, res) => {
    const { type = 'global', documentId = null } = req.body || {};
    if (!['global', 'document'].includes(type))
      throw chatError('Invalid conversation scope');
    if (
      (type === 'document' || documentId) &&
      (!mongoose.isObjectIdOrHexString(documentId) ||
        !(await Document.exists({ _id: documentId, userId: req.user._id })))
    )
      throw chatError('Document not found', 404);
    const conversation = await Conversation.create({ userId: req.user._id, type, documentId });
    res.status(201).json({ success: true, conversation });
  }),
);
router.patch(
  '/:id',
  route(async (req, res) => {
    const conversation = await ownedConversation(req.user._id, req.params.id);
    if (conversation.type !== 'global') throw chatError('Document chat scope cannot be changed');
    const { documentId } = req.body || {};
    if (documentId !== null && (!mongoose.isObjectIdOrHexString(documentId) ||
      !(await Document.exists({ _id: documentId, userId: req.user._id }))))
      throw chatError('Document not found', 404);
    const updated = await Conversation.findOneAndUpdate({
      _id: conversation._id, userId: req.user._id,
      $or: [{ activeRequest: null }, { leaseUntil: { $lt: new Date() } }],
    }, { $set: { documentId } }, { new: true, runValidators: true })
      .select('-activeRequest -leaseUntil -defaultKey');
    if (!updated) throw chatError('Wait for the current response before changing document context', 409);
    res.json({ success: true, conversation: updated });
  }),
);
router.get(
  '/',
  route(async (req, res) => {
    // Resolve old global history once, so pre-feature conversations remain discoverable.
    await resolveConversation({ ...req, body: {}, query: {} }, 'global');
    const filter = { userId: req.user._id };
    if (req.query.type) {
      if (!['global', 'document'].includes(req.query.type))
        throw chatError('Invalid conversation type');
      filter.type = req.query.type;
    }
    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .select('-activeRequest -leaseUntil -defaultKey')
      .lean();
    res.json({ success: true, conversations });
  }),
);
router.get(
  '/:id',
  route(async (req, res) => {
    const conversation = await ownedConversation(req.user._id, req.params.id);
    res.json({
      success: true,
      conversation: {
        _id: conversation._id,
        type: conversation.type,
        title: conversation.title,
        documentId: conversation.documentId,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  }),
);
router.get(
  '/:id/messages',
  route(async (req, res) => {
    const conversation = await ownedConversation(req.user._id, req.params.id);
    const filter = { userId: req.user._id, conversationId: conversation._id };
    if (req.query.before) {
      if (!mongoose.isObjectIdOrHexString(req.query.before))
        throw chatError('Invalid message cursor');
      const cursor = await messageModel(conversation).findOne({ ...filter, _id: req.query.before });
      if (!cursor) throw chatError('Message not found', 404);
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
      ];
    }
    const messages = await messageModel(conversation)
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(101)
      .lean();
    const hasMore = messages.length > 100;
    if (hasMore) messages.pop();
    messages.reverse();
    res.json({ success: true, messages, hasMore });
  }),
);
router.post(
  '/:id/messages',
  route(async (req, res, next) => {
    const conversation = await ownedConversation(req.user._id, req.params.id);
    req.body = { ...req.body, conversationId: String(conversation._id) };
    if (conversation.type === 'document') {
      req.params.id = String(conversation.documentId);
      return postDocumentChat(req, res, next);
    }
    return postAssistantChat(req, res, next);
  }),
);
router.delete(
  '/:id',
  route(async (req, res) => {
    const conversation = await ownedConversation(req.user._id, req.params.id);
    const removed = await Conversation.findOneAndDelete({
      _id: conversation._id,
      userId: req.user._id,
      $or: [{ activeRequest: null }, { leaseUntil: { $lt: new Date() } }],
    });
    if (!removed)
      throw chatError('Wait for the current response before deleting this conversation', 409);
    await messageModel(conversation).deleteMany({
      userId: req.user._id,
      conversationId: conversation._id,
    });
    res.json({ success: true });
  }),
);
export default router;
