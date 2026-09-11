import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    revision: { type: String, required: true },
    chunkIndex: { type: Number, required: true, min: 0 },
    content: { type: String, required: true },
    characterCount: { type: Number, required: true },
    startOffset: Number,
    endOffset: Number,
    page: Number,
    label: String,
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: String,
  },
  { timestamps: true },
);
schema.index({ userId: 1, documentId: 1, revision: 1, chunkIndex: 1 }, { unique: true });
schema.index({ userId: 1, content: 'text', label: 'text' });
export default mongoose.models.DocumentChunk || mongoose.model('DocumentChunk', schema);
