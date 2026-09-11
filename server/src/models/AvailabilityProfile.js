import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    workingDays: { type: [Number], default: [] },
    availableTimeRanges: { type: [{ start: String, end: String, _id: false }], default: [] },
    timezone: { type: String, required: true },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export default mongoose.models.AvailabilityProfile || mongoose.model('AvailabilityProfile', schema);
