import mongoose from 'mongoose';

export const REMINDER_STATUSES = ['active', 'dismissed', 'completed', 'cancelled'];
export const REMINDER_SOURCES = ['manual', 'task'];

const reminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  remindAt: { type: Date, required: true },
  status: { type: String, enum: REMINDER_STATUSES, default: 'active' },
  source: { type: String, enum: REMINDER_SOURCES, default: 'manual' },
}, { timestamps: true });

reminderSchema.index({ userId: 1, remindAt: 1 });
reminderSchema.index({ userId: 1, taskId: 1 });
reminderSchema.index({ userId: 1, status: 1, remindAt: 1 });

export default mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);
