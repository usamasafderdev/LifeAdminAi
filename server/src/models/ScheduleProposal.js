import mongoose from 'mongoose';
import { calendarEventFields } from './CalendarEvent.js';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    blocks: { type: [new mongoose.Schema(calendarEventFields)], default: [] },
    timezone: { type: String, required: true },
    explanation: { type: String, maxlength: 4000 },
    warnings: { type: [String], default: [] },
    estimates: { type: mongoose.Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ['pending', 'accepted', 'cancelled'], default: 'pending' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 });
export default mongoose.models.ScheduleProposal || mongoose.model('ScheduleProposal', schema);
