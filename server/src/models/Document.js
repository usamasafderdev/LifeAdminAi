import mongoose from 'mongoose';

export const DOCUMENT_SOURCE_TYPES = ['text', 'manual', 'pdf', 'image'];
export const DOCUMENT_CATEGORIES = [
  'university_notice',
  'bill',
  'warranty',
  'contract',
  'subscription',
  'invoice',
  'appointment',
  'information',
  'other',
];

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    sourceType: {
      type: String,
      required: true,
      enum: DOCUMENT_SOURCE_TYPES,
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      default: 'other',
    },
    originalFilename: { type: String, default: null },
    mimeType: { type: String, default: null },
    filePath: { type: String, default: null },
    extractedText: {
      type: String,
      default: '',
      maxlength: [200000, 'Extracted text cannot exceed 200000 characters'],
    },
  },
  { timestamps: true },
);

documentSchema.index({ userId: 1, createdAt: -1 });

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

export default Document;
