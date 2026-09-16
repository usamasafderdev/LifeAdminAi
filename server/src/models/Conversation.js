import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['global', 'document'], required: true },
    title: { type: String, required: true, maxlength: 120, default: 'New chat' },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    defaultKey: String,
    activeRequest: String,
    leaseUntil: Date,
  },
  { timestamps: true },
);
schema.pre('validate', function () {
  if (this.type === 'document' && !this.documentId)
    this.invalidate('documentId', 'Document scope must match conversation type');
});
schema.index({ userId: 1, updatedAt: -1 });
schema.index(
  { userId: 1, defaultKey: 1 },
  { unique: true, partialFilterExpression: { defaultKey: { $type: 'string' } } },
);
export default mongoose.models.Conversation || mongoose.model('Conversation', schema);
