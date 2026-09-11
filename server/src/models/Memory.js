import mongoose from 'mongoose';

export const MEMORY_TYPES = ['preference', 'personal', 'working_context', 'decision'];
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    generation: { type: Number, required: true, default: 0 },
    type: { type: String, enum: MEMORY_TYPES, required: true },
    content: { type: String, required: true, maxlength: 400 },
    fingerprint: { type: String, required: true },
    terms: { type: [String], default: [] },
    importance: { type: String, enum: ['low', 'medium', 'high'], required: true },
    source: {
      type: String,
      enum: ['conversation_confirmed', 'preference_automatic', 'user_edit'],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 1, required: true },
    lastUsedAt: { type: Date, default: null },
    contentUpdatedAt: { type: Date, default: Date.now },
    useCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);
schema.index({ userId: 1, generation: 1, fingerprint: 1 }, { unique: true });
schema.index({ userId: 1, generation: 1, type: 1, updatedAt: -1 });
schema.index({ userId: 1, generation: 1, terms: 1 });
export default mongoose.models.Memory || mongoose.model('Memory', schema);
