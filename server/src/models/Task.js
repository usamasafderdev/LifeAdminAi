import mongoose from 'mongoose';

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
export const TASK_PRIORITIES = ['low', 'medium', 'high'];
export const TASK_SOURCES = ['manual', 'ai_confirmed'];

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    status: { type: String, enum: TASK_STATUSES, default: 'pending' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    confirmedPriority: { type: String, enum: TASK_PRIORITIES, default: null },
    calculatedPriority: { type: String, enum: TASK_PRIORITIES, default: 'low' },
    priorityScore: { type: Number, min: 0, max: 100, default: 0 },
    priorityReasons: { type: [String], default: [] },
    priorityOverride: { type: String, enum: TASK_PRIORITIES, default: null },
    priorityCalculatedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    source: { type: String, enum: TASK_SOURCES, required: true, default: 'manual' },
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, documentId: 1 });

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
export default Task;
