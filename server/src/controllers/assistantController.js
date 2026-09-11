import { suggestMemories } from '../services/memoryService.js';
import { containsCredentials } from '../services/memoryExtractionService.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import { answerWorkspaceQuestion } from '../services/assistantService.js';

let answerer = answerWorkspaceQuestion;
const invalid = (message) => ({ success: false, message });
export async function getAssistantChat(req, res, next) { try { const messages = await WorkspaceChatMessage.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(100).select('role content sources actions contextUsed contextLabels createdAt').lean(); messages.reverse(); return res.json({ success: true, messages, count: messages.length }); } catch (error) { return next(error); } }
export async function postAssistantChat(req, res, next) {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.replace(/\0/g, '').trim() : '';
    if (containsCredentials(message)) return res.status(400).json(invalid('Remove passwords, tokens, and financial credentials before sending.'));
    if (!message) return res.status(400).json(invalid('Question is required'));
    if (message.length > 3000) return res.status(400).json(invalid('Question cannot exceed 3000 characters'));
    const history = await WorkspaceChatMessage.find({ userId: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(8).select('role content sources actions').lean(); history.reverse();
    const result = await answerer({ userId: req.user._id, message, history, date: { today: req.body?.today, timezoneOffset: req.body?.timezoneOffset } });
    const [userMessage, assistantMessage] = await WorkspaceChatMessage.create([{ userId: req.user._id, role: 'user', content: message }, { userId: req.user._id, role: 'assistant', content: result.answer, sources: result.sources, actions: result.actions, contextUsed: result.contextUsed, contextLabels: result.contextLabels, model: result.model }]);
    const memory = await suggestMemories(req.user._id, message);
    return res.status(201).json({ success: true, memory, answer: result.answer, sources: result.sources, actions: result.actions, metadata: { ...result.metadata, providerCall: result.providerCall }, userMessage, message: assistantMessage });
  } catch (error) { return next(error); }
}
export async function clearAssistantChat(req, res, next) { try { const result = await WorkspaceChatMessage.deleteMany({ userId: req.user._id }); return res.json({ success: true, message: 'Ask LifeAdmin conversation cleared', deleted: result.deletedCount || 0 }); } catch (error) { return next(error); } }
export function setWorkspaceAnswererForTests(value) { answerer = value || answerWorkspaceQuestion; }
