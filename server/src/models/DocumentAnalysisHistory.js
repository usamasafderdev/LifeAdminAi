import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    selectedDocuments: {
      type: [mongoose.Schema.Types.ObjectId],
      required: true,
      default: [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length >= 2 && items.length <= 20,
        message: 'At least two and no more than twenty documents can be stored for one analysis.',
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    summaryReference: {
      type: String,
      required: true,
      maxlength: 800,
    },
    report: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  { timestamps: true },
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, selectedDocuments: 1 });

const DocumentAnalysisHistory =
  mongoose.models.DocumentAnalysisHistory || mongoose.model('DocumentAnalysisHistory', schema);

export default DocumentAnalysisHistory;
