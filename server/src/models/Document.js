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

const importantDateSchema = new mongoose.Schema(
  {
    date: { type: String, default: '', maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
  },
  { _id: false },
);

const extractedActionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 1000 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate: { type: String, default: '', maxlength: 100 },
  },
  { _id: false },
);

const confirmedAnalysisSchema = new mongoose.Schema(
  {
    summary: { type: String, default: '', maxlength: 5000 },
    category: { type: String, enum: ['', ...DOCUMENT_CATEGORIES], default: '' },
    importantDates: { type: [importantDateSchema], default: [] },
    extractedActions: { type: [extractedActionSchema], default: [] },
    keyInformation: { type: [String], default: [] },
    risksOrConsequences: { type: [String], default: [] },
  },
  { _id: false },
);

const aiAnalysisSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['not_started', 'processing', 'completed', 'failed'],
      default: 'not_started',
    },
    summary: { type: String, default: '', maxlength: 5000 },
    category: { type: String, default: '', maxlength: 200 },
    importantDates: { type: [importantDateSchema], default: [] },
    extractedActions: { type: [extractedActionSchema], default: [] },
    keyInformation: { type: [String], default: [] },
    risksOrConsequences: { type: [String], default: [] },
    model: { type: String, default: '', maxlength: 200 },
    analyzedAt: { type: Date, default: null },
    errorMessage: { type: String, default: '', maxlength: 500 },
    reviewStatus: {
      type: String,
      enum: ['pending_review', 'confirmed', 'rejected'],
      default: 'pending_review',
    },
    reviewedAt: { type: Date, default: null },
    confirmedAnalysis: { type: confirmedAnalysisSchema, default: undefined },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

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
    aiAnalysis: {
      type: aiAnalysisSchema,
      default: undefined,
    },
  },
  { timestamps: true },
);

documentSchema.index({ userId: 1, createdAt: -1 });

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

export default Document;
