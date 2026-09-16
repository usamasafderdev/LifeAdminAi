import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Conversation from '../models/Conversation.js';
import Document from '../models/Document.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import { containsCredentials } from './memoryExtractionService.js';
import { getAiConfig } from '../config/ai.js';

export const chatError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export const messageModel = (conversation) =>
  conversation.type === 'document' ? DocumentChatMessage : WorkspaceChatMessage;
export async function ownedConversation(userId, id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw chatError('Invalid conversation ID');
  const conversation = await Conversation.findOne({ _id: id, userId });
  if (!conversation) throw chatError('Conversation not found', 404);
  if (
    conversation.type === 'document' &&
    !(await Document.exists({ _id: conversation.documentId, userId }))
  )
    throw chatError('Document not found', 404);
  return conversation;
}
export async function resolveConversation(req, type) {
  await Conversation.init();
  const userId = req.user._id;
  const documentId = type === 'document' ? req.params.id : null;
  if (
    documentId &&
    (!mongoose.isObjectIdOrHexString(documentId) ||
      !(await Document.exists({ _id: documentId, userId })))
  )
    throw chatError('Document not found', 404);
  const id = req.body?.conversationId || req.query?.conversationId;
  if (id) {
    const conversation = await ownedConversation(userId, id);
    if (conversation.type !== type || (type === 'document' && String(conversation.documentId) !== String(documentId)))
      throw chatError('Conversation scope does not match', 404);
    return conversation;
  }
  const filter = { userId, defaultKey: documentId ? `document:${documentId}` : 'global' };
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          type,
          documentId,
          title: type === 'document' ? 'Document chat' : 'Ask LifeAdmin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    conversation = await Conversation.findOne(filter);
  }
  // Adopt existing history in place; preserve IDs, attachments, sources and timestamps.
  await messageModel(conversation).updateMany(
    { userId, ...(documentId ? { documentId } : {}), conversationId: null },
    { $set: { conversationId: conversation._id } },
    { timestamps: false },
  );
  return conversation;
}
export function historyFilter(req) {
  return {
    userId: req.user._id,
    conversationId: req.conversation._id,
    ...(req.chatRequestId ? { requestId: { $ne: req.chatRequestId } } : {}),
  };
}
export async function saveChatPair(req, rows) {
  const conversation = req.conversation;
  if (
    !(await Conversation.exists({
      _id: conversation._id,
      userId: req.user._id,
      activeRequest: req.chatLease,
    }))
  )
    throw chatError('This request expired. Please retry.', 409);
  if (
    conversation.documentId &&
    !(await Document.exists({ _id: conversation.documentId, userId: req.user._id }))
  )
    throw chatError('Document not found', 404);
  const Model = messageModel(conversation);
  const assistant = rows[1];
  if (typeof assistant?.content !== 'string' || !assistant.content.trim())
    throw chatError('The AI response could not be processed. Please try again.', 502);
  const assistantMessage = await Model.findOneAndUpdate(
    {
      userId: req.user._id,
      conversationId: conversation._id,
      requestId: req.chatRequestId,
      role: 'assistant',
    },
    {
      $setOnInsert: {
        ...assistant,
        conversationId: conversation._id,
        requestId: req.chatRequestId,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  const userMessage = await Model.findOneAndUpdate(
    {
      userId: req.user._id,
      conversationId: conversation._id,
      requestId: req.chatRequestId,
      role: 'user',
    },
    { $set: { status: 'complete' } },
    { new: true },
  );
  await Conversation.updateOne(
    { _id: conversation._id, userId: req.user._id },
    { $set: { updatedAt: new Date() } },
  );
  return [userMessage, assistantMessage];
}
export function withChatPersistence(type, handler) {
  return async (req, res, next) => {
    let Model, scope, lease;
    let userSaved = false;
    try {
      const message =
        typeof req.body?.message === 'string' ? req.body.message.replace(/\0/g, '').trim() : '';
      if (!message || message.length > 3000)
        throw chatError('Question must contain 1–3000 characters');
      if (containsCredentials(message))
        throw chatError('Remove passwords, tokens, and financial credentials before sending.');
      const requestId = req.body?.requestId || randomUUID();
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
        throw chatError('Invalid request ID');
      req.conversation = await resolveConversation(req, type);
      if (type === 'document') {
        const doc = await Document.findOne({
          _id: req.conversation.documentId,
          userId: req.user._id,
        }).select('extractedText');
        if (!doc?.extractedText?.trim())
          throw chatError('This document does not contain readable text to chat with');
      }
      req.chatRequestId = requestId;
      Model = messageModel(req.conversation);
      await Model.init();
      scope = { userId: req.user._id, conversationId: req.conversation._id, requestId };
      const existing = await Model.findOne({ ...scope, role: 'user' });
      if (existing && existing.content !== message)
        throw chatError('Request ID already belongs to a different message', 409);
      const replay = await Model.findOne({ ...scope, role: 'assistant' });
      if (replay)
        return res.status(200).json({
          success: true,
          conversationId: req.conversation._id,
          userMessage: existing,
          message: replay,
          answer: replay.content,
          sources: replay.sources,
          actions: replay.actions,
          replayed: true,
        });
      lease = randomUUID();
      req.chatLease = lease;
      const locked = await Conversation.findOneAndUpdate(
        {
          _id: req.conversation._id,
          userId: req.user._id,
          $or: [{ activeRequest: null }, { leaseUntil: { $lt: new Date() } }],
        },
        {
          $set: {
            activeRequest: lease,
            leaseUntil: new Date(
              Date.now() + Math.max(180000, getAiConfig().timeoutMs * 2 + 60000),
            ),
          },
        },
        { new: true },
      );
      if (!locked) {
        lease = null;
        throw chatError(
          'LifeAdmin is still processing this conversation. Please retry in a moment.',
          409,
        );
      }
      req.conversation = locked;
      // Another worker may have completed this request between our first read and lease acquisition.
      const lockedUser = await Model.findOne({ ...scope, role: 'user' });
      if (lockedUser && lockedUser.content !== message)
        throw chatError('Request ID already belongs to a different message', 409);
      const completed = await Model.findOne({ ...scope, role: 'assistant' });
      if (completed) {
        const userMessage = await Model.findOne({ ...scope, role: 'user' });
        return res.json({
          success: true,
          userMessage,
          message: completed,
          answer: completed.content,
          sources: completed.sources,
          actions: completed.actions,
          replayed: true,
        });
      }
      await Model.findOneAndUpdate(
        { ...scope, role: 'user' },
        {
          $setOnInsert: {
            ...scope,
            role: 'user',
            content: message,
            ...(type === 'document' ? { documentId: req.conversation.documentId } : {}),
          },
          $set: { status: 'pending' },
        },
        { upsert: true, runValidators: true },
      );
      userSaved = true;
      if (req.conversation.title === 'New chat')
        await Conversation.updateOne(
          { _id: req.conversation._id, userId: req.user._id },
          { $set: { title: message.slice(0, 120) } },
        );
      await handler(req, res, (error) => {
        throw error;
      });
      if (res.statusCode >= 400)
        await Model.updateOne({ ...scope, role: 'user' }, { $set: { status: 'failed' } });
    } catch (error) {
      if (Model && scope && lease && userSaved)
        await Model.updateOne({ ...scope, role: 'user' }, { $set: { status: 'failed' } }).catch(
          () => {},
        );
      next(error);
    } finally {
      if (lease && req.conversation)
        await Conversation.updateOne(
          { _id: req.conversation._id, userId: req.user._id, activeRequest: lease },
          { $unset: { activeRequest: 1, leaseUntil: 1 } },
        ).catch(() => {});
    }
  };
}

export async function clearChatHistory(req, type) {
  req.conversation = await resolveConversation(req, type);
  const lease = randomUUID();
  const scope = { _id: req.conversation._id, userId: req.user._id };
  const locked = await Conversation.findOneAndUpdate(
    { ...scope, $or: [{ activeRequest: null }, { leaseUntil: { $lt: new Date() } }] },
    { $set: { activeRequest: lease, leaseUntil: new Date(Date.now() + 60000) } },
  );
  if (!locked) throw chatError('Wait for the current response before clearing chat', 409);
  try {
    return await messageModel(req.conversation).deleteMany(historyFilter(req));
  } finally {
    await Conversation.updateOne(
      { ...scope, activeRequest: lease },
      { $unset: { activeRequest: 1, leaseUntil: 1 } },
    );
  }
}
