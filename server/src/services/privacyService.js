import mongoose from 'mongoose';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';
import DocumentAnalysisHistory from '../models/DocumentAnalysisHistory.js';
import DocumentRelationship from '../models/DocumentRelationship.js';
import GeneratedDocument from '../models/GeneratedDocument.js';
import CalendarEvent from '../models/CalendarEvent.js';
import ScheduleProposal from '../models/ScheduleProposal.js';
import AvailabilityProfile from '../models/AvailabilityProfile.js';
import DailyBriefing from '../models/DailyBriefing.js';
import Memory from '../models/Memory.js';
import Notification from '../models/Notification.js';
import Conversation from '../models/Conversation.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import { resolveGeneratedFile } from './documentGenerationService.js';
import { deleteFileIfExists } from '../utils/fileUtils.js';
import fs from 'node:fs/promises';

const supportsTransactions = () => {
  const type = mongoose.connection.client?.topology?.description?.type;
  return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
};

const ownedFilter = (userId) => ({ userId });

export async function exportUserData(userId) {
  const filter = ownedFilter(userId);
  const [
    user,
    tasks,
    reminders,
    documents,
    memories,
    notifications,
    events,
    proposals,
    availability,
    briefings,
    conversations,
    workspaceMessages,
    documentMessages,
    analyses,
    relationships,
    generatedDocuments,
  ] = await Promise.all([
    User.findById(userId)
      .select(
        'fullName email avatarUrl createdAt notificationSettings briefingSettings memorySettings',
      )
      .lean(),
    Task.find(filter).select('-schedulingRevision').lean(),
    Reminder.find(filter).lean(),
    Document.find(filter).select('-extractedText -filePath').lean(),
    Memory.find(filter).lean(),
    Notification.find(filter).lean(),
    CalendarEvent.find(filter).lean(),
    ScheduleProposal.find(filter).lean(),
    AvailabilityProfile.findOne(filter).lean(),
    DailyBriefing.find(filter).lean(),
    Conversation.find(filter).select('-activeRequest -leaseUntil -defaultKey').lean(),
    WorkspaceChatMessage.find(filter).lean(),
    DocumentChatMessage.find(filter).lean(),
    DocumentAnalysisHistory.find(filter).lean(),
    DocumentRelationship.find(filter).lean(),
    GeneratedDocument.find(filter).select('-filePath -structuredContent').lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: user,
    preferences: {
      notificationSettings: user?.notificationSettings || null,
      briefingSettings: user?.briefingSettings || null,
      memorySettings: user?.memorySettings || null,
      availabilityProfile: availability,
    },
    tasks,
    reminders,
    calendarEvents: events,
    scheduleProposals: proposals,
    documents,
    documentAnalysisHistory: analyses,
    documentRelationships: relationships,
    generatedDocuments,
    memories,
    notifications,
    dailyBriefings: briefings,
    conversations,
    chatMessages: { workspace: workspaceMessages, documents: documentMessages },
  };
}

export async function clearUserChatHistory(userId) {
  const filter = ownedFilter(userId);
  const [workspace, documents, conversations] = await Promise.all([
    WorkspaceChatMessage.deleteMany(filter),
    DocumentChatMessage.deleteMany(filter),
    Conversation.deleteMany(filter),
  ]);
  return {
    deletedMessages: (workspace.deletedCount || 0) + (documents.deletedCount || 0),
    deletedConversations: conversations.deletedCount || 0,
  };
}

async function deleteDatabaseData(userId, session = null) {
  const options = session ? { session } : {};
  const filter = ownedFilter(userId);
  await Promise.all([
    WorkspaceChatMessage.deleteMany(filter, options),
    DocumentChatMessage.deleteMany(filter, options),
    Conversation.deleteMany(filter, options),
    Reminder.deleteMany(filter, options),
    Task.deleteMany(filter, options),
    Document.deleteMany(filter, options),
    DocumentChunk.deleteMany(filter, options),
    DocumentAnalysisHistory.deleteMany(filter, options),
    DocumentRelationship.deleteMany(filter, options),
    GeneratedDocument.deleteMany(filter, options),
    CalendarEvent.deleteMany(filter, options),
    ScheduleProposal.deleteMany(filter, options),
    AvailabilityProfile.deleteMany(filter, options),
    DailyBriefing.deleteMany(filter, options),
    Memory.deleteMany(filter, options),
    Notification.deleteMany(filter, options),
  ]);
  const result = await User.deleteOne({ _id: userId }, options);
  if (result.deletedCount !== 1) {
    const error = new Error('Account deletion could not be completed.');
    error.statusCode = 409;
    throw error;
  }
}

async function removeStoredFiles(paths) {
  await Promise.all(
    paths.filter(Boolean).map((filePath) =>
      deleteFileIfExists(filePath).catch((error) => {
        if (error.code !== 'ENOENT')
          console.error('[privacy.cleanup]', { code: error.code || 'FILE_DELETE_FAILED' });
      }),
    ),
  );
}

export async function deleteUserAccount(userId) {
  const [documents, generatedDocuments] = await Promise.all([
    Document.find(ownedFilter(userId)).select('filePath').lean(),
    GeneratedDocument.find(ownedFilter(userId)).select('filePath').lean(),
  ]);
  const documentFiles = documents.map((document) => document.filePath);
  const generatedFiles = generatedDocuments.map(({ filePath }) => resolveGeneratedFile(filePath));

  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => deleteDatabaseData(userId, session));
    } finally {
      await session.endSession();
    }
  } else {
    await deleteDatabaseData(userId);
  }

  await removeStoredFiles(documentFiles);
  await Promise.all(
    generatedFiles.filter(Boolean).map((filePath) =>
      fs.unlink(filePath).catch((error) => {
        if (error.code !== 'ENOENT')
          console.error('[privacy.cleanup]', { code: error.code || 'FILE_DELETE_FAILED' });
      }),
    ),
  );
  return { deleted: true };
}
