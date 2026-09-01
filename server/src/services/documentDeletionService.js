import mongoose from 'mongoose';
import Document from '../models/Document.js';
import Task from '../models/Task.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';

function supportsTransactions() {
  const type = mongoose.connection.client?.topology?.description?.type;
  return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
}

async function deleteDatabaseRecords(documentId, userId, session = null) {
  const options = session ? { session } : {};
  const taskResult = await Task.deleteMany({ userId, documentId }, options);
  const documentResult = await Document.deleteOne({ _id: documentId, userId }, options);
  if (documentResult.deletedCount !== 1) {
    const error = new Error('Document deletion could not be completed');
    error.statusCode = 409;
    error.code = 'DOCUMENT_DELETE_CONFLICT';
    throw error;
  }
  return taskResult.deletedCount || 0;
}

export async function deleteDocumentAndLinkedTasks({ document, userId }) {
  let deletedTasks = 0;
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        deletedTasks = await deleteDatabaseRecords(document._id, userId, session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone MongoDB does not support transactions. Keep the same strict
    // user/document filters and remove dependants immediately before the owner document.
    deletedTasks = await deleteDatabaseRecords(document._id, userId);
  }

  if (document.filePath) await deleteFileIfExists(document.filePath);
  return { deletedDocument: true, deletedTasks };
}
