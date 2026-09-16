import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['document', 'task', 'reminder'], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    label: { type: String, required: true, maxlength: 240 },
    detail: { type: String, default: '', maxlength: 300 },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceDocumentTitle: { type: String, default: '', maxlength: 240 },
  },
  { _id: false },
);
const actionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['open_document', 'open_task', 'open_reminder', 'open_schedule'],
      required: true,
    },
    label: { type: String, required: true, maxlength: 260 },
    resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    resourceTitle: { type: String, required: true, maxlength: 240 },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    sources: { type: [sourceSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    contextUsed: { type: Boolean, default: false },
    contextLabels: { type: [String], default: [] },
    model: { type: String, default: '', maxlength: 200 },
  },
  { timestamps: true },
);
schema.add({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  requestId: String,
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'complete' },
});
schema.index({ userId: 1, conversationId: 1, createdAt: 1, _id: 1 });
schema.index(
  { userId: 1, conversationId: 1, requestId: 1, role: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
);
schema.index({ userId: 1, createdAt: 1 });
export default mongoose.models.WorkspaceChatMessage ||
  mongoose.model('WorkspaceChatMessage', schema);
