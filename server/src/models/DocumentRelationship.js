import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    documentB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    relationshipType: {
      type: String,
      enum: ['related', 'duplicate', 'conflicting', 'supporting'],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    confidenceScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      default: 0,
    },
  },
  { timestamps: true },
);

schema.index({ userId: 1, documentA: 1, documentB: 1 }, { unique: true });
schema.index({ userId: 1, relationshipType: 1 });
schema.index({ userId: 1, createdAt: -1 });

const DocumentRelationship =
  mongoose.models.DocumentRelationship || mongoose.model('DocumentRelationship', schema);

export default DocumentRelationship;
