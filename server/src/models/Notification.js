import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'overdue_task',
  'deadline_approaching',
  'reminder_due',
  'goal_progress_warning',
  'schedule_conflict',
  'document_action',
  'ai_suggestion',
];
const ref = (model) => ({ type: mongoose.Schema.Types.ObjectId, ref: model, default: null });
const schema = new mongoose.Schema(
  {
    userId: { ...ref('User'), required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    priority: { type: String, enum: ['low', 'medium', 'high'], required: true },
    read: { type: Boolean, default: false },
    relatedTaskId: ref('Task'),
    relatedReminderId: ref('Reminder'),
    relatedGoalId: ref('Goal'),
    relatedDocumentId: ref('Document'),
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    fingerprint: { type: String, required: true, maxlength: 64 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ userId: 1, fingerprint: 1 }, { unique: true });
schema.index({ userId: 1, deletedAt: 1, createdAt: -1, _id: -1 });
schema.index({ userId: 1, deletedAt: 1, read: 1, priority: 1 });
schema.index({ deletedAt: 1, createdAt: 1 });
export default mongoose.models.Notification || mongoose.model('Notification', schema);
