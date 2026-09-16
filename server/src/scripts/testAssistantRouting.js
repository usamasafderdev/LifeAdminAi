import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import {
  answerWorkspaceQuestion,
  analyzeAssistantRequest,
  classifyAssistantIntent,
  isSelectedDocumentConversation,
} from '../services/assistantService.js';
import { retrieveWorkspace } from '../services/workspaceRetrievalService.js';
import { generateText } from '../services/ai/aiService.js';
import { answerDocumentQuestion } from '../services/documentChatService.js';
import Task from '../models/Task.js';
const live = process.argv.includes('--live');
const userId = new mongoose.Types.ObjectId();
try {
  await connectDB();
  const mixedPlan = analyzeAssistantRequest(
    'Based on my assignment, explain CBC and tell me how much time I should spend on it.',
    [{ role: 'user', content: 'I need to finish the assignment this week.' }],
  );
  assert.equal(mixedPlan.mixed, true);
  assert.ok(mixedPlan.dimensions.includes('document'));
  assert.ok(mixedPlan.dimensions.includes('workspace'));
  assert.ok(mixedPlan.dimensions.includes('reasoning'));
  assert.ok(mixedPlan.sources.includes('selected_document'));
  assert.ok(mixedPlan.sources.includes('workspace'));
  const shoppingPlan = analyzeAssistantRequest('Used HP laptop with 16GB RAM in Lahore under 100k');
  assert.ok(shoppingPlan.dimensions.includes('shopping'));
  assert.ok(shoppingPlan.dimensions.includes('local'));
  assert.equal(shoppingPlan.constraints.condition, 'Used');
  assert.equal(shoppingPlan.constraints.specification, '16GB RAM');
  assert.equal(shoppingPlan.constraints.budget, 'under 100k');
  assert.equal(shoppingPlan.constraints.location, 'Lahore');
  await Task.create({
    userId,
    title: 'Routing verification task',
    dueDate: new Date('2026-09-20'),
    source: 'manual',
  });
  for (const [question, intent] of [
    ['Where can I buy a cricket bat?', 'general'],
    ['Give me cricket bat shops near me.', 'general'],
    ['What is the best laptop under $500?', 'general'],
    ['Explain blockchain.', 'general'],
    ['Explain calendar scheduling algorithms.', 'general'],
    ['What is my task deadline?', 'workspace'],
    ['Show my upcoming reminders.', 'workspace'],
  ]) {
    let workspaceRetrievalCalled = false,
      aiProviderCalled = false,
      queries = 0;
    mongoose.set('debug', (collection, method) => {
      if (['find', 'findOne', 'aggregate', 'countDocuments'].includes(method)) queries++;
    });
    assert.equal(classifyAssistantIntent(question).intent, intent);
    const result = await answerWorkspaceQuestion({
      userId,
      message: question,
      retrieve: async (args) => {
        workspaceRetrievalCalled = true;
        return retrieveWorkspace(args);
      },
      generate: async (args) => {
        aiProviderCalled = true;
        if (question === 'What is my task deadline?')
          assert.match(args.userPrompt, /Routing verification task/);
        if (intent === 'general')
          assert.doesNotMatch(args.systemPrompt, /Answer only from the supplied/);
        return live
          ? generateText(args)
          : { text: 'Verified provider answer.', model: 'routing-test' };
      },
    });
    assert.equal(workspaceRetrievalCalled, intent === 'workspace');
    assert.equal(aiProviderCalled, true);
    if (intent === 'general') assert.equal(queries, 0, 'General answer must not query MongoDB');
    assert.doesNotMatch(result.answer, /I could not find this information in the document/i);
    console.log(
      JSON.stringify({
        question,
        intent,
        workspaceRetrievalCalled,
        aiProviderCalled,
        ...(live ? { answer: result.answer } : {}),
      }),
    );
  }
  const privateResult = await answerWorkspaceQuestion({
    userId,
    message: 'What is my bank password?',
    generate: () => {
      throw Error('Privacy bypass');
    },
    retrieve: () => {
      throw Error('Privacy bypass');
    },
  });
  assert.equal(privateResult.metadata.kind, 'sensitive_rejected');
  assert.equal(isSelectedDocumentConversation('lets discuss about it'), true);
  assert.equal(isSelectedDocumentConversation("Let's talk about assignment"), true);
  assert.equal(isSelectedDocumentConversation("Let's discuss"), true);
  assert.equal(isSelectedDocumentConversation('Explain this assignment'), true);
  assert.equal(isSelectedDocumentConversation('Explain that again'), true);
  assert.equal(isSelectedDocumentConversation('what about CTR?'), true);
  assert.equal(isSelectedDocumentConversation('Continue.'), true);
  assert.equal(
    isSelectedDocumentConversation('I want to ask questions about this assignment'),
    true,
  );
  let selectedDocumentQuery = '';
  const selectedDocumentResult = await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'I want to ask questions about this assignment',
    retrieveDocument: async ({ question }) => {
      selectedDocumentQuery = question;
      return {
        document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
        chunks: [],
        context: '',
      };
    },
    generate: async ({ userPrompt }) => {
      assert.match(userPrompt, /assignment\.pdf/);
      return {
        text: 'We can go through assignment.pdf together. Which section would you like to start with?',
      };
    },
  });
  assert.equal(
    selectedDocumentQuery,
    'document overview requirements purpose sections questions topics',
  );
  assert.doesNotMatch(
    selectedDocumentResult.answer,
    /I could not find this information in the document/i,
  );
  assert.equal(selectedDocumentResult.providerCall, true);
  let generalDocumentCall = false;
  const generalDocumentResult = await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'What does CBC mean?',
    retrieveDocument: async () => ({
      document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
      chunks: [],
      context: '',
    }),
    generate: async ({ systemPrompt }) => {
      generalDocumentCall = true;
      assert.match(systemPrompt, /selected document is present/);
      return {
        text: 'The document does not define CBC explicitly, but generally CBC is a block cipher mode.',
      };
    },
  });
  assert.equal(generalDocumentCall, true);
  assert.doesNotMatch(
    generalDocumentResult.answer,
    /I could not find this information in the document/i,
  );
  let planningDocumentCall = false;
  await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'What should I do?',
    retrieveDocument: async ({ question }) => {
      planningDocumentCall = question.includes('document overview requirements purpose');
      return {
        document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
        chunks: [{ chunkIndex: 0, label: 'Requirements' }],
        context: '[Chunk 1] Submit the report.',
      };
    },
    generate: async () => ({ text: 'Start by reviewing the assignment requirements.' }),
  });
  assert.equal(planningDocumentCall, true);
  const responseShape = await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'What is CBC?',
    retrieveDocument: async () => ({
      document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
      chunks: [{ chunkIndex: 0, label: 'CBC' }],
      context: '[Chunk 1] CBC decryption uses an IV for the first block.',
    }),
    generate: async ({ userPrompt, maxTokens }) => {
      assert.equal(maxTokens, 500);
      assert.match(userPrompt, /CBC decryption uses an IV/);
      return {
        text: 'CBC decryption uses the previous ciphertext block or IV for the first block.',
      };
    },
  });
  assert.doesNotMatch(responseShape.answer, /could not find this information/i);
  let independentRetrievalCalled = false;
  const independent = await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'What is AES?',
    retrieveDocument: async () => {
      independentRetrievalCalled = true;
      throw Error('Independent knowledge must not retrieve the document');
    },
    generate: async ({ systemPrompt }) => {
      assert.match(systemPrompt, /general-purpose assistant/);
      return { text: 'AES is a symmetric block cipher.' };
    },
  });
  assert.equal(independentRetrievalCalled, false);
  assert.match(independent.answer, /AES/);
  let removedContextPrompt = '';
  await answerWorkspaceQuestion({
    userId,
    message: 'Explain machine learning simply.',
    history: [
      {
        role: 'assistant',
        content: 'We were discussing Assignment.pdf.',
        sources: [
          { type: 'document', sourceId: new mongoose.Types.ObjectId(), label: 'Assignment' },
        ],
      },
    ],
    generate: async ({ systemPrompt }) => {
      removedContextPrompt = systemPrompt;
      return { text: 'Machine learning finds patterns in data.' };
    },
  });
  assert.match(removedContextPrompt, /No document is currently selected/);
  assert.match(removedContextPrompt, /historical only/);
  for (const [message, selectedDocumentId, expectsDocument] of [
    ['What is VPN?', new mongoose.Types.ObjectId(), false],
    ['Where can I buy a cricket bat physically in Lahore?', new mongoose.Types.ObjectId(), false],
    ['Summarize my current workload.', null, false],
    [
      'Based on my assignment, explain what I need to complete and also explain CBC using your general knowledge.',
      new mongoose.Types.ObjectId(),
      true,
    ],
  ]) {
    let documentRetrieved = false;
    const result = await answerWorkspaceQuestion({
      userId,
      selectedDocumentId,
      message,
      retrieveDocument: async () => {
        documentRetrieved = true;
        return {
          document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
          chunks: [{ chunkIndex: 0, label: 'Requirements' }],
          context: '[Chunk 1] Complete Part A and explain CBC.',
        };
      },
      retrieve: async () => ({
        direct: false,
        context: 'Current workload context.',
        sources: [],
        metadata: {},
      }),
      generate: async () => ({ text: `AI answer for ${message}` }),
    });
    assert.equal(documentRetrieved, expectsDocument);
    assert.match(result.answer, /AI answer/);
  }
  let mixedWorkspaceRetrieved = false;
  const mixedSourceResult = await answerWorkspaceQuestion({
    userId,
    selectedDocumentId: new mongoose.Types.ObjectId(),
    message: 'Based on my assignment, what should I do next?',
    retrieveDocument: async () => ({
      document: { _id: new mongoose.Types.ObjectId(), title: 'assignment.pdf' },
      chunks: [{ chunkIndex: 0, label: 'Requirements' }],
      context: '[Chunk 1] Complete Part A and submit the report.',
    }),
    retrieve: async () => {
      mixedWorkspaceRetrieved = true;
      return {
        direct: false,
        context: 'Open task: Finish Part A by Friday.',
        sources: [
          { type: 'task', sourceId: new mongoose.Types.ObjectId(), label: 'Finish Part A' },
        ],
        metadata: { kind: 'workspace_reasoning' },
      };
    },
    generate: async ({ userPrompt }) => {
      assert.match(userPrompt, /<request_plan>/);
      assert.match(userPrompt, /Finish Part A by Friday/);
      return { text: 'Review Part A, then finish the report before Friday.' };
    },
  });
  assert.equal(mixedWorkspaceRetrieved, true);
  assert.match(mixedSourceResult.answer, /Review Part A/);
  const missing = await answerDocumentQuestion({
    document: { title: 'Receipt', extractedText: 'A red chair costs 20 dollars.' },
    question: 'When does my passport expire?',
    generate: async () => ({ text: 'I could not find this information in the document.' }),
  });
  assert.match(
    missing.answer,
    /could not find this information in (?:the document|your documents)/i,
  );
  console.log('Routing, privacy and document fallback checks passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  mongoose.set('debug', false);
  await Task.deleteMany({ userId });
  await mongoose.disconnect();
}
