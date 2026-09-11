import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
      index: true,
    },
    fileName: { type: String, required: true, maxlength: 240 },
    filePath: { type: String, required: true, maxlength: 500 },
    format: { type: String, enum: ['docx', 'pdf', 'markdown'], default: 'docx' },
    generationType: {
      type: String,
      enum: ['complete_document', 'standalone_document'],
      default: 'complete_document',
    },
    size: { type: Number, min: 1, required: true },
    structuredContent: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, sourceDocumentId: 1, createdAt: -1 });
export default mongoose.models.GeneratedDocument || mongoose.model('GeneratedDocument', schema);
