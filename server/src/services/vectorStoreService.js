import DocumentChunk from '../models/DocumentChunk.js';

function scopeFilter(scope) {
  if (!scope?.userId || !scope.documentId || !scope.revision)
    throw new Error('Vector scope is required');
  return { userId: scope.userId, documentId: scope.documentId, revision: scope.revision };
}
function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
// Default Mongo adapter is intentionally bounded. Replace with an indexed adapter at scale.
export function createVectorStoreService(adapter = null) {
  const backend = adapter || {
    async storeEmbeddings(scope, rows) {
      const filter = scopeFilter(scope);
      if (rows.length)
        await DocumentChunk.bulkWrite(
          rows.map((row) => ({
            updateOne: {
              filter: { ...filter, chunkIndex: row.chunkIndex },
              update: { $set: { embedding: row.values, embeddingModel: row.model } },
            },
          })),
        );
    },
    async searchSimilarChunks(scope, embedding, limit = 4) {
      const rows = await DocumentChunk.find({
        ...scopeFilter(scope),
        embeddingModel: embedding.model,
      })
        .select('+embedding')
        .limit(2000)
        .lean();
      return rows
        .map((row) => ({
          chunkIndex: row.chunkIndex,
          score: cosine(embedding.values, row.embedding || []),
        }))
        .filter((row) => row.score >= 0.3)
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.min(limit, 20));
    },
    async deleteDocumentVectors(scope, options = {}) {
      if (!scope?.userId || !scope.documentId) throw new Error('Vector scope is required');
      await DocumentChunk.updateMany(
        { userId: scope.userId, documentId: scope.documentId },
        { $unset: { embedding: 1, embeddingModel: 1 } },
        options,
      );
    },
  };
  return Object.fromEntries(
    ['storeEmbeddings', 'searchSimilarChunks', 'deleteDocumentVectors'].map((method) => [
      method,
      async (...args) => {
        if (method === 'deleteDocumentVectors') {
          if (!args[0]?.userId || !args[0]?.documentId) throw new Error('Vector scope is required');
        } else scopeFilter(args[0]);
        try {
          return await backend[method](...args);
        } catch {
          throw Object.assign(new Error('Document vector storage is temporarily unavailable.'), {
            statusCode: 503,
          });
        }
      },
    ]),
  );
}
export const vectorStoreService = createVectorStoreService();
