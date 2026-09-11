import mongoose from 'mongoose';

export const calendarEventFields = {
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', maxlength: 2000 },
  type: {
    type: String,
    enum: ['task_block', 'reminder', 'meeting', 'personal'],
    default: 'task_block',
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  relatedTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  relatedGoalId: { type: mongoose.Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' },
};
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ...calendarEventFields,
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScheduleProposal', default: null },
  },
  { timestamps: true },
);
schema.index({ userId: 1, startTime: 1, endTime: 1 });
schema.path('endTime').validate(function (end) {
  return end > this.startTime;
}, 'End must follow start');
export default mongoose.models.CalendarEvent || mongoose.model('CalendarEvent', schema);
