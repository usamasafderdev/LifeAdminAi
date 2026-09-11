import { createHash } from 'node:crypto';
import Document from '../models/Document.js';
import DocumentChunk from '../models/DocumentChunk.js';
import { splitKnowledgeChunks } from './documentChunkingService.js';
import { getDocumentChatConfig, normalizeTerms, scoreChunk } from './documentChatContextService.js';
import { embeddingService } from './embeddingService.js';
import { vectorStoreService } from './vectorStoreService.js';

export const NOT_FOUND = 'I could not find this information in the document.';
const unavailable = () =>
  Object.assign(new Error('Document knowledge is temporarily unavailable. Please try again.'), {
    statusCode: 503,
  });

export async function workspaceKnowledgeCandidates(userId, question) {
  const terms = normalizeTerms(question).slice(0, 40);
  if (!userId) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  if (!terms.length) return Document.find({ userId }).select('title category').lean().cursor();
  try {
    await DocumentChunk.init();
    const matches = await DocumentChunk.find({ userId, $text: { $search: terms.join(' ') } })
      .select({ documentId: 1, score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(200)
      .lean();
    const titlePattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Include legacy documents for lazy backfill, and title matches for short queries.
    return Document.find({
      userId,
      $or: [
        { _id: { $in: matches.map((row) => row.documentId) } },
        { knowledgeRevision: null },
        { knowledgePending: true },
        { title: { $regex: titlePattern, $options: 'i' } },
      ],
    })
      .select('title category')
      .lean()
      .cursor();
  } catch {
    // A missing text index must not break existing workspaces during deployment.
    return Document.find({ userId }).select('title category').lean().cursor();
  }
}

export async function ensureDocumentKnowledge(documentId, userId) {
  if (!documentId || !userId)
    throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const document = await Document.findOne({ _id: documentId, userId })
    .select('title originalFilename extractedText knowledgeRevision knowledgePending')
    .lean();
  if (!document) throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  const config = getDocumentChatConfig();
  const revision = createHash('sha256')
    .update(JSON.stringify([document.extractedText, config.chunkSize, config.overlap, 2]))
    .digest('hex');
  if (document.knowledgeRevision !== revision || document.knowledgePending) {
    try {
      const chunks = splitKnowledgeChunks(document.extractedText, {
        chunkSize: config.chunkSize,
        overlap: Math.min(config.overlap, Math.floor(config.chunkSize / 4)),
      });
      const scope = { userId, documentId, revision };
      for (let offset = 0; offset < chunks.length; offset += 100) {
        const batch = chunks.slice(offset, offset + 100);
        await DocumentChunk.bulkWrite(
          batch.map((chunk) => ({
            updateOne: {
              filter: { ...scope, chunkIndex: chunk.chunkIndex },
              update: { $setOnInsert: { ...scope, ...chunk } },
              upsert: true,
            },
          })),
        );
        // Embeddings are optional; lexical retrieval remains available on provider failure.
        try {
          const vectors = [];
          for (const chunk of batch) {
            const vector = await embeddingService.generateEmbedding(chunk.content);
            if (vector) vectors.push({ chunkIndex: chunk.chunkIndex, ...vector });
          }
          await vectorStoreService.storeEmbeddings(scope, vectors);
        } catch {
          /* Fall back to stored text. */
        }
      }
      const published = await Document.updateOne(
        { _id: documentId, userId, extractedText: document.extractedText },
        { $set: { knowledgeRevision: revision, knowledgePending: false } },
      );
      if (!published.matchedCount) {
        await DocumentChunk.deleteMany(scope);
        throw unavailable();
      }
      // Only retire the previously published revision; never remove a concurrent build.
      if (document.knowledgeRevision && document.knowledgeRevision !== revision)
        await DocumentChunk.deleteMany({
          userId,
          documentId,
          revision: document.knowledgeRevision,
        });
    } catch {
      throw unavailable();
    }
  }
  return { document, scope: { userId, documentId, revision } };
}

export function selectKnowledgeContext(
  chunks,
  question,
  config = getDocumentChatConfig(),
  vectorHits = [],
) {
  const semantic = new Map(vectorHits.map((hit) => [hit.chunkIndex, hit.score]));
  const overview = /\b(summarize|summarise|overview|what is this document about)\b/i.test(question);
  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      text: chunk.content,
      score:
        scoreChunk(
          { text: chunk.content, label: `${config.documentTitle || ''} ${chunk.label || ''}` },
          question,
        ) +
        (semantic.get(chunk.chunkIndex) || 0) * 10,
    }))
    .filter((chunk) => chunk.score > 0 || overview)
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
  const selected = [];
  let used = 0;
  for (const chunk of ranked) {
    if (selected.length >= config.maxChunks) break;
    const framed = `[Chunk ${chunk.chunkIndex + 1}${chunk.page ? `, Page ${chunk.page}` : ''}: ${chunk.label}]\n${chunk.content}`;
    if (used + framed.length + 2 > config.maxContextChars) continue;
    selected.push({ ...chunk, framed });
    used += framed.length + 2;
  }
  selected.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return {
    chunks: selected,
    context: selected.map((chunk) => chunk.framed).join('\n\n'),
    totalChunks: chunks.length,
  };
}

export async function retrieveDocumentKnowledge({
  documentId,
  userId,
  question,
  config = getDocumentChatConfig(),
}) {
  const { document, scope } = await ensureDocumentKnowledge(documentId, userId);
  let hits = [];
  try {
    const vector = await embeddingService.generateEmbedding(question);
    if (vector)
      hits = await vectorStoreService.searchSimilarChunks(scope, vector, config.maxChunks);
  } catch {
    /* Lexical fallback. */
  }
  const chunks = await DocumentChunk.find(scope).sort({ chunkIndex: 1 }).lean();
  // Revalidate publication after reading to avoid returning stale/deleted source text.
  if (
    !(await Document.exists({
      _id: documentId,
      userId,
      knowledgeRevision: scope.revision,
      extractedText: document.extractedText,
    }))
  )
    throw unavailable();
  return {
    ...selectKnowledgeContext(chunks, question, { ...config, documentTitle: document.title }, hits),
    document,
  };
}

export async function getKnowledgeSource({ documentId, userId, chunkIndex, revision }) {
  const { scope } = await ensureDocumentKnowledge(documentId, userId);
  if (!revision || revision !== scope.revision)
    throw Object.assign(
      new Error('This source has changed. Ask the question again for current sources.'),
      { statusCode: 409 },
    );
  const chunk = await DocumentChunk.findOne({ ...scope, chunkIndex })
    .select('content chunkIndex label page startOffset endOffset revision')
    .lean();
  if (!chunk) throw Object.assign(new Error('Document source not found'), { statusCode: 404 });
  return chunk;
}
