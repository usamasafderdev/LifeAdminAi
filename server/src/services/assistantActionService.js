import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';

const TYPES = Object.freeze({ document: { action: 'open_document', noun: 'Document', model: Document }, task: { action: 'open_task', noun: 'Task', model: Task }, reminder: { action: 'open_reminder', noun: 'Reminder', model: Reminder } });
export function dedupeSources(sources = [], limit = 30) { const seen = new Set(); return sources.filter((item) => { const key = `${item.type}:${item.sourceId}`; if (!TYPES[item.type] || seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit); }
export function navigationRequest(message) { const text = String(message || '').trim().toLowerCase(); const provenance = /^(?:where did|what (?:document|file).*(?:come from|from)|show me the original)/.test(text); if (!provenance && !/^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:open|take me|go to|show me|navigate|view)\b/.test(text)) return null; const type = provenance || /document|file|report|assignment|original/.test(text) ? 'document' : /task/.test(text) ? 'task' : /reminder/.test(text) ? 'reminder' : null; const ordinal = /\bsecond\b/.test(text) ? 1 : /\bthird\b/.test(text) ? 2 : /\bfirst\b/.test(text) ? 0 : null; return { type, ordinal, preferFirst: /\b(next|most urgent|first)\b/.test(text), provenance };
}
async function verified(userId, item) { const config = TYPES[item?.type]; if (!config) return null; const record = await config.model.findOne({ _id: item.sourceId, userId }).select('title').lean(); return record ? { type: item.type, sourceId: record._id, label: record.title } : null; }
export async function resolveNavigationAction({ userId, message, currentSources = [], history = [], preferredType = null }) {
  const request = navigationRequest(message); if (!request) return null;
  const referential = /\b(that|it|there|one)\b/i.test(message) || /\b(?:the|this|these)\s+(?:document|assignment|file|tasks?)\b/i.test(message) || request.provenance;
  const last = [...history].reverse().find((item) => item.role === 'assistant' && item.sources?.length);
  const explicitPool = dedupeSources([...currentSources, ...(last?.sources || [])], 30).filter((item) => !request.type || item.type === request.type);
  const verifiedExplicit = (await Promise.all(explicitPool.map((item) => verified(userId, item)))).filter(Boolean);
  const normalizedMessage = String(message).toLowerCase();
  const explicitMatches = verifiedExplicit.filter((item) => item.label.length > 2 && normalizedMessage.includes(item.label.toLowerCase()));
  if (explicitMatches.length === 1) return toAction(explicitMatches[0]);
  if (explicitMatches.length > 1) return { ambiguous: true, available: explicitMatches.length, candidates: explicitMatches };
  let candidates = referential ? last?.sources || [] : currentSources;
  const requestedType = request.type || (referential ? preferredType : null);
  candidates = dedupeSources(candidates, 30).filter((item) => !requestedType || item.type === requestedType);
  if (!candidates.length && !referential) candidates = dedupeSources(last?.sources || [], 30).filter((item) => !requestedType || item.type === requestedType);
  const verifiedCandidates = (await Promise.all(candidates.map((item) => verified(userId, item)))).filter(Boolean);
  const index = request.ordinal ?? (request.preferFirst ? 0 : null);
  if (index !== null && verifiedCandidates[index]) return toAction(verifiedCandidates[index]);
  if (verifiedCandidates.length === 1) return toAction(verifiedCandidates[0]);
  return { ambiguous: true, available: verifiedCandidates.length, candidates: verifiedCandidates };
}
export function actionsForSources(sources = []) { return dedupeSources(sources, 30).map(toAction); }
function toAction(resource) { const config = TYPES[resource.type]; return { type: config.action, label: `${config.noun === 'Document' ? 'Open' : 'View'} ${resource.label}`, resourceId: resource.sourceId, resourceTitle: resource.label }; }
