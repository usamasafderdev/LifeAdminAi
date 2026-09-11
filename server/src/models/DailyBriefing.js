import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    title: { type: String, maxlength: 200 },
    reason: { type: String, maxlength: 300 },
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    priorityScore: Number,
    dueDate: String,
    attention: { type: String, enum: ['high', 'normal'] },
  },
  { _id: false },
);
const eventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['task', 'reminder'] },
    sourceId: mongoose.Schema.Types.ObjectId,
    title: { type: String, maxlength: 200 },
    date: String,
  },
  { _id: false },
);
const documentSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    title: { type: String, maxlength: 200 },
    createdAt: Date,
  },
  { _id: false },
);
const contentSchema = new mongoose.Schema(
  {
    date: String,
    summary: { type: String, maxlength: 700 },
    focusTasks: [taskSchema],
    todayReminders: [eventSchema],
    upcomingEvents: [eventSchema],
    recentDocuments: [documentSchema],
    importantDocuments: [documentSchema],
    recommendations: [{ type: String, maxlength: 500 }],
    goals: { type: [String], default: [] },
    milestones: { type: [String], default: [] },
    goalSourceAvailable: { type: Boolean, default: false },
    counts: { openTasks: Number, overdue: Number, dueToday: Number },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    timeZone: { type: String, required: true },
    content: { type: contentSchema, default: null },
    generatedAt: { type: Date, default: null },
    mode: { type: String, enum: ['ai', 'fallback', 'empty'], default: 'fallback' },
    privacyStamp: { type: String, default: '' },
    revision: { type: Number, default: 0 },
    leaseToken: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ userId: 1, date: 1, timeZone: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.DailyBriefing || mongoose.model('DailyBriefing', schema);
