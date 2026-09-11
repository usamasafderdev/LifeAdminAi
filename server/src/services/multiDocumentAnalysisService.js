import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import Document from '../models/Document.js';
import DocumentRelationship from '../models/DocumentRelationship.js';
import DocumentAnalysisHistory from '../models/DocumentAnalysisHistory.js';
import { generateText } from './ai/aiService.js';
import { validateAiAnalysis } from './aiAnalysisValidator.js';

export const MULTI_DOC_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    connections: {
      type: 'array',
      items: { type: 'object' },
    },
    conflicts: {
      type: 'array',
      items: { type: 'object' },
    },
    importantInformation: {
      type: 'array',
      items: { type: 'string' },
    },
    suggestedActions: {
      type: 'array',
      items: { type: 'object' },
    },
  },
  required: ['summary', 'connections', 'conflicts', 'importantInformation', 'suggestedActions'],
  additionalProperties: false,
};

const relLabels = {
  related: 'related',
  duplicate: 'duplicate',
  conflicting: 'conflicting',
  supporting: 'supporting',
};

export function validateMultiDocumentAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid cross-document analysis payload');
  if (typeof raw.summary !== 'string') throw new Error('Missing summary');
  if (!Array.isArray(raw.connections)) throw new Error('Invalid connections');
  if (!Array.isArray(raw.conflicts)) throw new Error('Invalid conflicts');
  if (!Array.isArray(raw.importantInformation)) throw new Error('Invalid important information');
  if (!Array.isArray(raw.suggestedActions)) throw new Error('Invalid suggested actions');

  const normalizeConnection = (item) => {
    const docA = String(item.documentA || '').trim();
    const docB = String(item.documentB || '').trim();
    if (
      !docA ||
      !docB ||
      !mongoose.isObjectIdOrHexString(docA) ||
      !mongoose.isObjectIdOrHexString(docB)
    )
      return null;
    return {
      documentA: docA,
      documentB: docB,
      relationshipType: relLabels[item.relationshipType] || 'related',
      reason: String(item.reason || '').slice(0, 500),
      confidenceScore: Number.isFinite(Number(item.confidenceScore))
        ? Math.min(1, Math.max(0, Number(item.confidenceScore)))
        : 0,
    };
  };

  const normalizeConflict = (item) => {
    const docA = String(item.documentA || '').trim();
    const docB = String(item.documentB || '').trim();
    if (
      !docA ||
      !docB ||
      !mongoose.isObjectIdOrHexString(docA) ||
      !mongoose.isObjectIdOrHexString(docB)
    )
      return null;
    return {
      documentA: docA,
      documentB: docB,
      reason: String(item.reason || '').slice(0, 500),
      confidenceScore: Number.isFinite(Number(item.confidenceScore))
        ? Math.min(1, Math.max(0, Number(item.confidenceScore)))
        : 0,
    };
  };

  return {
    summary: String(raw.summary).slice(0, 5000),
    connections: raw.connections.map(normalizeConnection).filter(Boolean).slice(0, 50),
    conflicts: raw.conflicts.map(normalizeConflict).filter(Boolean).slice(0, 50),
    importantInformation: raw.importantInformation
      .map((item) => String(item).slice(0, 1000))
      .filter(Boolean)
      .slice(0, 50),
    suggestedActions: raw.suggestedActions
      .map((item) => ({
        title: String(item.title || '').slice(0, 200),
        description: String(item.description || '').slice(0, 1000),
        dueDate: String(item.dueDate || ''),
        priority: ['low', 'medium', 'high'].includes(String(item.priority || '').toLowerCase())
          ? String(item.priority).toLowerCase()
          : 'medium',
      }))
      .filter((item) => item.title)
      .slice(0, 50),
  };
}

function normalizeDocument(doc) {
  return {
    id: doc._id,
    title: doc.title,
    category: doc.category,
    sourceType: doc.sourceType,
    extractedText: doc.extractedText || '',
    aiAnalysis: doc.aiAnalysis || null,
  };
}

function extractDatesFromText(text) {
  const regex = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/g;
  return Array.from(new Set((text || '').match(regex) || [])).slice(0, 20);
}

export async function validateDocumentSelection(userId, ids) {
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20) {
    throw Object.assign(new Error('Choose 2-20 documents to analyze together.'), {
      statusCode: 400,
    });
  }
  if (!ids.every((id) => mongoose.isObjectIdOrHexString(id))) {
    throw Object.assign(new Error('Invalid document ID.'), { statusCode: 400 });
  }
  const unique = [...new Set(ids.map(String))];
  const docs = await Document.find({ _id: { $in: unique }, userId })
    .select('_id title category sourceType extractedText aiAnalysis')
    .lean();
  if (docs.length !== unique.length) {
    throw Object.assign(new Error('One or more documents are unavailable to your account.'), {
      statusCode: 404,
    });
  }
  return docs.map(normalizeDocument);
}

export async function generateMultiDocumentAnalysis({
  userId,
  documentIds,
  generate = generateText,
}) {
  const docs = await validateDocumentSelection(userId, documentIds);
  const endpoint = docs.length;
  const normalizedIds = [...new Set(documentIds.map(String))]
    .filter((id) => mongoose.isObjectIdOrHexString(id))
    .sort();
  const objectIds = normalizedIds.map((id) => new mongoose.Types.ObjectId(id));
  const context = docs.map((doc) => ({
    id: String(doc.id),
    title: doc.title,
    category: doc.category,
    sourceType: doc.sourceType,
    summary: doc.aiAnalysis?.confirmedAnalysis?.summary || doc.aiAnalysis?.summary || '',
    importantDates: (
      doc.aiAnalysis?.confirmedAnalysis?.importantDates ||
      doc.aiAnalysis?.importantDates ||
      []
    ).map((date) => date.date),
    keyInformation: (
      doc.aiAnalysis?.confirmedAnalysis?.keyInformation ||
      doc.aiAnalysis?.keyInformation ||
      []
    ).slice(0, 8),
    actions: (
      doc.aiAnalysis?.confirmedAnalysis?.extractedActions ||
      doc.aiAnalysis?.extractedActions ||
      []
    ).map((a) => a.title),
    text: (doc.extractedText || '').slice(0, 1200),
  }));

  const pairs = [];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      const aText = (a.extractedText || '').toLowerCase();
      const bText = (b.extractedText || '').toLowerCase();
      const overlap = new Set([...aText.split(/\W+/), ...bText.split(/\W+/)]).size;
      const aDates = new Set([
        ...(
          a.aiAnalysis?.confirmedAnalysis?.importantDates ||
          a.aiAnalysis?.importantDates ||
          []
        ).map((d) => d.date),
        ...extractDatesFromText(a.extractedText || ''),
      ]);
      const bDates = new Set([
        ...(
          b.aiAnalysis?.confirmedAnalysis?.importantDates ||
          b.aiAnalysis?.importantDates ||
          []
        ).map((d) => d.date),
        ...extractDatesFromText(b.extractedText || ''),
      ]);
      const sharedDates = [...aDates].filter((d) => bDates.has(d));
      const termShared =
        aText.includes(b.title.toLowerCase()) ||
        bText.includes(a.title.toLowerCase()) ||
        (aText.length && bText.length && overlap < 1000);
      if (sharedDates.length) {
        pairs.push({
          documentA: String(a.id),
          documentB: String(b.id),
          relationshipType: 'related',
          reason: `Both documents reference the same deadline: ${sharedDates.join(', ')}.`,
          confidenceScore: 0.82,
        });
      } else if (termShared) {
        pairs.push({
          documentA: String(a.id),
          documentB: String(b.id),
          relationshipType: 'supporting',
          reason: 'Shared terminology and document context suggest the same workstream.',
          confidenceScore: 0.66,
        });
      }

      const aDeadlines = [
        ...new Set([
          ...(
            a.aiAnalysis?.confirmedAnalysis?.importantDates ||
            a.aiAnalysis?.importantDates ||
            []
          ).map((d) => d.date),
          ...extractDatesFromText(a.extractedText || ''),
        ]),
      ];
      const bDeadlines = [
        ...new Set([
          ...(
            b.aiAnalysis?.confirmedAnalysis?.importantDates ||
            b.aiAnalysis?.importantDates ||
            []
          ).map((d) => d.date),
          ...extractDatesFromText(b.extractedText || ''),
        ]),
      ];
      if (
        aDeadlines.length &&
        bDeadlines.length &&
        aDeadlines.some((d) => d && !bDeadlines.includes(d))
      ) {
        pairs.push({
          documentA: String(a.id),
          documentB: String(b.id),
          relationshipType: 'conflicting',
          reason: 'The documents point to different or conflicting deadlines.',
          confidenceScore: 0.78,
        });
      }
    }
  }

  let aiResult = null;
  try {
    const payload = {
      systemPrompt:
        'You compare multiple user-owned documents using only existing structured document summaries, key information, dates, and actions. Return valid JSON with keys summary, connections, conflicts, importantInformation, suggestedActions. Do not fabricate facts.',
      userPrompt: JSON.stringify({ documentCount: endpoint, context }),
      temperature: 0,
      maxTokens: 700,
      jsonSchema: MULTI_DOC_ANALYSIS_SCHEMA,
    };
    const response = await generate(payload);
    aiResult = JSON.parse(response.text || '{}');
  } catch {
    aiResult = null;
  }

  const fallback = {
    summary: `Reviewed ${docs.length} user-owned documents and identified ${pairs.length || 'no'} relationship signals.`,
    connections: pairs
      .filter((row) => row.relationshipType === 'related' || row.relationshipType === 'supporting')
      .map((row) => ({
        documentA: row.documentA,
        documentB: row.documentB,
        relationshipType: row.relationshipType,
        reason: row.reason,
        confidenceScore: row.confidenceScore,
      })),
    conflicts: pairs
      .filter((row) => row.relationshipType === 'conflicting')
      .map((row) => ({
        documentA: row.documentA,
        documentB: row.documentB,
        reason: row.reason,
        confidenceScore: row.confidenceScore,
      })),
    importantInformation: context.flatMap((doc) =>
      doc.keyInformation.map((item) => `${doc.title}: ${item}`),
    ),
    suggestedActions: context
      .flatMap((doc) =>
        (doc.actions || []).map((title) => ({
          title,
          description: `Action suggested from ${doc.title}.`,
          dueDate: '',
          priority: 'medium',
        })),
      )
      .concat(
        docs.flatMap((doc) => {
          const actionText = (doc.extractedText || '').match(
            /\b(submit|review|confirm|send|upload|schedule|renew|register|reply|prepare|write|create|gather|silently)\b[^.]{0,80}/i,
          );
          if (!actionText) return [];
          return [
            {
              title: `${actionText[0].slice(0, 80).trim()}`,
              description: `Action suggested from ${doc.title}.`,
              dueDate: '',
              priority: 'medium',
            },
          ];
        }),
      ),
  };

  const fallbackOutput = validateMultiDocumentAnalysis(fallback);
  const output = validateMultiDocumentAnalysis(aiResult || fallback);

  const deduped = new Map();
  for (const item of [...output.connections, ...fallbackOutput.connections]) {
    const key = `${item.documentA}:${item.documentB}:${item.relationshipType}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const dedupedConflicts = new Map();
  for (const item of [...output.conflicts, ...fallbackOutput.conflicts]) {
    const key = `${item.documentA}:${item.documentB}:${item.reason}`;
    if (!dedupedConflicts.has(key)) dedupedConflicts.set(key, item);
  }

  const mergedOutput = {
    summary: output.summary || fallbackOutput.summary,
    connections: [...deduped.values()],
    conflicts: [...dedupedConflicts.values()],
    importantInformation: [
      ...new Set([
        ...(output.importantInformation || []),
        ...(fallbackOutput.importantInformation || []),
      ]),
    ],
    suggestedActions: [
      ...new Set(
        [...(output.suggestedActions || []), ...(fallbackOutput.suggestedActions || [])].map(
          (item) => `${item.title}::${item.description}::${item.dueDate}::${item.priority}`,
        ),
      ),
    ]
      .map((key) => {
        const [title, description, dueDate, priority] = key.split('::');
        return { title, description, dueDate, priority };
      })
      .filter((item) => item.title),
  };

  const relationshipRows = [];
  for (const connection of mergedOutput.connections) {
    const a = connection.documentA;
    const b = connection.documentB;
    const existing = await DocumentRelationship.findOne({
      userId,
      documentA: a,
      documentB: b,
      relationshipType: connection.relationshipType,
    }).lean();
    if (!existing) {
      const row = await DocumentRelationship.findOneAndUpdate(
        { userId, documentA: a, documentB: b, relationshipType: connection.relationshipType },
        {
          $setOnInsert: {
            userId,
            documentA: a,
            documentB: b,
            relationshipType: connection.relationshipType,
            reason: connection.reason,
            confidenceScore: connection.confidenceScore,
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      relationshipRows.push(row);
    }
  }

  const existingHistory = await DocumentAnalysisHistory.findOne({
    userId,
    selectedDocuments: { $all: objectIds, $size: objectIds.length },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!existingHistory) {
    const saved = await DocumentAnalysisHistory.create({
      userId,
      selectedDocuments: objectIds,
      createdAt: new Date(),
      summaryReference: mergedOutput.summary || 'Document intelligence analysis',
      report: {
        summary: mergedOutput.summary,
        connections: mergedOutput.connections,
        conflicts: mergedOutput.conflicts,
        importantInformation: mergedOutput.importantInformation,
        suggestedActions: mergedOutput.suggestedActions,
        relationships: relationshipRows,
      },
    });

    return {
      summary: mergedOutput.summary,
      connections: mergedOutput.connections,
      conflicts: mergedOutput.conflicts,
      importantInformation: mergedOutput.importantInformation,
      suggestedActions: mergedOutput.suggestedActions,
      relationships: relationshipRows,
      history: { id: saved._id },
    };
  }

  return {
    summary: existingHistory.report?.summary || mergedOutput.summary,
    connections: existingHistory.report?.connections || mergedOutput.connections,
    conflicts: existingHistory.report?.conflicts || mergedOutput.conflicts,
    importantInformation: existingHistory.report?.importantInformation || mergedOutput.importantInformation,
    suggestedActions: existingHistory.report?.suggestedActions || mergedOutput.suggestedActions,
    relationships: existingHistory.report?.relationships || relationshipRows,
    history: { id: existingHistory._id },
  };
}
