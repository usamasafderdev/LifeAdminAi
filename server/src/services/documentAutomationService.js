import Task from '../models/Task.js';
import { analyzeDocumentText } from './documentAiService.js';
import { generateTasksFromAnalysis } from './taskGenerationService.js';
import { validateAiAnalysis } from './aiAnalysisValidator.js';

const ACTION_VERBS = new Set([
  'apply', 'assemble', 'attach', 'attend', 'book', 'calculate', 'call', 'complete',
  'confirm', 'contact', 'create', 'design', 'draft', 'file', 'fill', 'finalize',
  'gather', 'identify', 'make', 'organize', 'pay', 'prepare', 'proofread', 'provide',
  'register', 'renew', 'reply', 'research', 'respond', 'review', 'revise', 'schedule',
  'send', 'sign', 'submit', 'upload', 'verify', 'write',
]);
const HISTORICAL_OPENERS = /^(achieved|built|collaborated|completed|created|developed|implemented|improved|integrated|led|managed|worked)\b/i;

export function isAutoCreateEligible(analysis) {
  if (analysis?.actionRequired !== true || !Array.isArray(analysis.extractedActions) || !analysis.extractedActions.length) return false;
  return analysis.extractedActions.every((action) => {
    const title = typeof action?.title === 'string' ? action.title.trim() : '';
    if (!title || HISTORICAL_OPENERS.test(title)) return false;
    const firstWord = title.toLowerCase().match(/^[a-z]+/)?.[0];
    return ACTION_VERBS.has(firstWord) && typeof action.description === 'string';
  });
}

function eligibleAnalysis(analysis) {
  const extractedActions = analysis.extractedActions.filter((action) => isAutoCreateEligible({ actionRequired: true, extractedActions: [action] }));
  return { ...analysis, actionRequired: extractedActions.length > 0, extractedActions };
}

function safeErrorMessage(error) {
  if (error?.code === 'AI_RESPONSE_VALIDATION_FAILED') return 'AI response validation failed.';
  if (error?.code === 'AI_NOT_CONFIGURED') return 'AI analysis is not configured.';
  return 'Automatic analysis could not be completed.';
}

export async function processSavedDocument(document, userId, { analyze = analyzeDocumentText } = {}) {
  if (!document.extractedText?.trim()) {
    document.aiAnalysis = { status: 'not_started', errorMessage: 'No readable text available for automatic analysis.' };
    document.taskGenerationStatus = 'no_actions';
    document.generatedTaskCount = 0;
    await document.save();
    return { created: 0, skipped: 0, error: null };
  }

  document.aiAnalysis = { status: 'processing', reviewStatus: 'pending_review', errorMessage: '' };
  document.taskGenerationStatus = 'processing';
  await document.save();
  try {
    const analyzed = await analyze({ title: document.title, category: document.category, extractedText: document.extractedText });
    const result = { ...validateAiAnalysis(analyzed), model: typeof analyzed.model === 'string' ? analyzed.model : '' };
    document.aiAnalysis = {
      status: 'completed', ...result, analyzedAt: new Date(), errorMessage: '',
      reviewStatus: 'pending_review', reviewedAt: null, confirmedAnalysis: undefined, confirmedBy: null,
    };
    await document.save();

    const automaticAnalysis = eligibleAnalysis(result);
    if (!automaticAnalysis.extractedActions.length) {
      document.taskGenerationStatus = result.actionRequired && result.extractedActions?.length ? 'not_started' : 'no_actions';
      document.generatedTaskCount = 0;
      document.taskGenerationAt = new Date();
      await document.save();
      return { created: 0, skipped: 0, error: null };
    }

    try {
      const { tasks: candidates, skippedDuplicates } = await generateTasksFromAnalysis(document, userId, { analysis: automaticAnalysis, source: 'ai_automatic' });
      const tasks = candidates.length ? await Task.insertMany(candidates) : [];
      document.taskGenerationStatus = 'completed';
      document.taskGenerationAt = new Date();
      document.generatedTaskCount = tasks.length;
      await document.save();
      return { tasks, created: tasks.length, skipped: skippedDuplicates, error: null };
    } catch (error) {
      document.taskGenerationStatus = 'failed';
      document.generatedTaskCount = 0;
      await document.save();
      return { created: 0, skipped: 0, error, failureStage: 'task_generation' };
    }
  } catch (error) {
    document.aiAnalysis = { status: 'failed', errorMessage: safeErrorMessage(error), reviewStatus: 'pending_review' };
    document.taskGenerationStatus = 'failed';
    document.generatedTaskCount = 0;
    await document.save();
    return { created: 0, skipped: 0, error, failureStage: 'analysis' };
  }
}
