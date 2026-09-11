import DocumentChunk from '../models/DocumentChunk.js';
import { clearTaskSchedule } from './calendarTaskLifecycleService.js';
import { vectorStoreService } from './vectorStoreService.js';
import mongoose from 'mongoose';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import GeneratedDocument from '../models/GeneratedDocument.js';
import { resolveGeneratedFile } from './documentGenerationService.js';
import fs from 'node:fs/promises';
import { deleteFileIfExists } from '../utils/fileUtils.js';

function supportsTransactions() {
  const type = mongoose.connection.client?.topology?.description?.type;
  return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
}

async function deleteDatabaseRecords(documentId, userId, session = null) {
  const options = session ? { session } : {};
  const taskIds = await Task.find({ userId, documentId }, '_id', options).lean();
  const reminderResult = await Reminder.deleteMany({ userId, $or: [{ documentId }, { taskId: { $in: taskIds.map((task) => task._id) } }] }, options);
  const chatResult = await DocumentChatMessage.deleteMany({ userId, documentId }, options);
  const generatedFiles = await GeneratedDocument.find({ userId, sourceDocumentId: documentId }, 'filePath', options).lean();
  const generatedResult = await GeneratedDocument.deleteMany({ userId, sourceDocumentId: documentId }, options);
  const taskResult = await Task.deleteMany({ userId, documentId }, options);
  await clearTaskSchedule(userId, taskIds.map(task => task._id), { deleted: true, session });
  await vectorStoreService.deleteDocumentVectors({ userId, documentId }, options);
  await DocumentChunk.deleteMany({ userId, documentId }, options);
  const documentResult = await Document.deleteOne({ _id: documentId, userId }, options);
  if (documentResult.deletedCount !== 1) {
    const error = new Error('Document deletion could not be completed');
    error.statusCode = 409;
    error.code = 'DOCUMENT_DELETE_CONFLICT';
    throw error;
  }
  return { deletedTasks: taskResult.deletedCount || 0, deletedReminders: reminderResult.deletedCount || 0, deletedChatMessages: chatResult.deletedCount || 0, deletedGeneratedDocuments: generatedResult.deletedCount || 0, generatedFiles };
}

export async function deleteDocumentAndLinkedTasks({ document, userId }) {
  let deletedTasks = 0;
  let deletedReminders = 0;
  let deletedChatMessages = 0;
  let deletedGeneratedDocuments = 0;
  let generatedFiles = [];
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        ({ deletedTasks, deletedReminders, deletedChatMessages, deletedGeneratedDocuments, generatedFiles } = await deleteDatabaseRecords(document._id, userId, session));
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone MongoDB does not support transactions. Keep the same strict
    // user/document filters and remove dependants immediately before the owner document.
    ({ deletedTasks, deletedReminders, deletedChatMessages, deletedGeneratedDocuments, generatedFiles } = await deleteDatabaseRecords(document._id, userId));
  }

  if (document.filePath) await deleteFileIfExists(document.filePath);
  await Promise.all(generatedFiles.map(({ filePath }) => { const resolved = resolveGeneratedFile(filePath); return resolved ? fs.unlink(resolved).catch((error) => { if (error.code !== 'ENOENT') throw error; }) : null; }));
  return { deletedDocument: true, deletedTasks, deletedReminders, deletedChatMessages, deletedGeneratedDocuments };
}
