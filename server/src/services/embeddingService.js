// Adapters return { values: number[], model: string }. No paid provider is required.
export function createEmbeddingService(adapter = null) {
  return {
    async generateEmbedding(text) {
      if (!adapter || !String(text || '').trim()) return null;
      try {
        const result = await adapter.generateEmbedding(text);
        if (
          typeof result?.model !== 'string' ||
          !result.model ||
          result.model.length > 200 ||
          !Array.isArray(result.values) ||
          !result.values.length ||
          result.values.length > 8192 ||
          !result.values.every(Number.isFinite)
        )
          throw new Error();
        return result;
      } catch {
        throw Object.assign(new Error('Document embeddings are temporarily unavailable.'), {
          statusCode: 503,
        });
      }
    },
  };
}
export const embeddingService = createEmbeddingService();
export const generateEmbedding = (text) => embeddingService.generateEmbedding(text);
