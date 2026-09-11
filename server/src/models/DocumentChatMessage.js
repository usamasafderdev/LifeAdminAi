import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    documentTitle: String,
    page: Number,
    revision: String,
    chunkIndex: { type: Number, min: 0 },
    label: { type: String, maxlength: 160 },
  },
  { _id: false },
);
const attachmentSchema = new mongoose.Schema(
  {
    generatedDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeneratedDocument' },
    type: { type: String, enum: ['generated_document'] },
    format: { type: String, enum: ['docx', 'pdf', 'markdown'] },
    fileName: { type: String, maxlength: 240 },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    model: { type: String, default: '', maxlength: 200 },
    sources: { type: [sourceSchema], default: [] },
    attachment: { type: attachmentSchema, default: undefined },
  },
  { timestamps: true },
);

schema.index({ userId: 1, documentId: 1, createdAt: 1 });
export default mongoose.models.DocumentChatMessage || mongoose.model('DocumentChatMessage', schema);
