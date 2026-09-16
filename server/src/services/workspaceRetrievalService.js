import {
  retrieveDocumentKnowledge,
  workspaceKnowledgeCandidates,
} from './documentKnowledgeService.js';
import Document from '../models/Document.js';
import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import { applyTaskPriority } from './taskPriorityService.js';
import {
  addCalendarDays,
  localTodayKey,
  summarizeTaskDeadlines,
  taskDateKey,
} from './taskDeadlineService.js';
import { normalizeTerms } from './documentChatContextService.js';
import { reminderDayBounds } from './integrationService.js';

const OPEN = ['pending', 'in_progress'];
const source = (type, item, detail = '') => ({
  type,
  sourceId: item._id,
  label: item.title,
  detail,
});
const taskPriorityRank = { high: 0, medium: 1, low: 2 };
const formatDay = (value) =>
  new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const monthNumbers = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function mentionedDateKey(message, today) {
  const text = String(message || '').toLowerCase();
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const named = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/,
  );
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : named
      ? [Number(named[3] || today.slice(0, 4)), monthNumbers[named[1]], Number(named[2])]
      : null;
  if (!parts) return '';
  const [year, month, day] = parts;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : '';
}

async function taskSources(userId, tasks, detail) {
  const documentIds = [
    ...new Set(tasks.map((task) => task.documentId && String(task.documentId)).filter(Boolean)),
  ];
  const documents = documentIds.length
    ? await Document.find({ userId, _id: { $in: documentIds } })
        .select('title category')
        .lean()
    : [];
  const documentsById = new Map(documents.map((document) => [String(document._id), document]));
  const documentSources = documents.map((document) =>
    source('document', document, document.category || 'Source document'),
  );
  const taskSourceRows = tasks.map((task) => {
    const document = task.documentId ? documentsById.get(String(task.documentId)) : null;
    return {
      ...source('task', task, document ? `From: ${document.title}` : detail),
      ...(document ? { sourceDocumentId: document._id, sourceDocumentTitle: document.title } : {}),
    };
  });
  return [...documentSources, ...taskSourceRows];
}

export function classifyWorkspaceQuery(message) {
  const q = String(message || '').toLowerCase();
  const workspaceTerms = /(task|tasks|due|deadline|document|documents|assignment|uploaded file|pdf|upload|reminder|calendar|schedule|event|workspace|notes|remind|plan|invoice|invoice|report|memory|previous|history)/i;
  const generalTerms = /(where can i buy|where can i get|where can i find|from where can i buy|from where i can buy|give me .*shop|shops with location|physical shop|location|recommend|recommendation|explain|who is the best|best .*brand|what is|who is|when is|how do i|why is|tell me about|machine learning|compare)/i;
  if (/\b(?:assignment|document|file|section)\b/.test(q) && /\b(summarize|summarise|say|talk|explain|uploaded|based|section)\b/.test(q)) return 'semantic_documents';
  if (/\b(?:my|this|that|uploaded)\s+(?:\w+\s+){0,3}(?:assignment|document|file|report)\b/i.test(q) && /\b(explain|compare|based on|according to)\b/i.test(q)) return 'semantic_documents';
  if (generalTerms.test(q) && !workspaceTerms.test(q)) return 'general_knowledge';
  if (/\b(where can i buy|where can i get|where can i find|from where can i buy|from where i can buy|buy.*bat|where.*bat).*?\b/.test(q)) return 'general_knowledge';
  if (
    /\b(?:on\s+)?(?:20\d{2}-\d{1,2}-\d{1,2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})\b/.test(
      q,
    ) &&
    /task|due|deadline|have to do|need to do/.test(q)
  )
    return 'specific_date';
  if (/how many (?:pending|open|unfinished) tasks?/.test(q)) return 'open_task_count';
  if (/how many documents?/.test(q)) return 'document_count';
  if (/most urgent task|which task is most urgent/.test(q)) return 'most_urgent';
  if (/what document.*task|which document.*task|task .*come from|document did .* come from/.test(q))
    return 'task_origin';
  if (/overdue tasks?|tasks?.*overdue/.test(q)) return 'overdue';
  if (/(?:due|deadline).*(?:today)|anything due today/.test(q)) return 'due_today';
  if (/(?:deadline|due).*(?:next 14 days|coming up|upcoming|soon)/.test(q)) return 'upcoming_14';
  if (/reminders?.*today/.test(q)) return 'reminders_today';
  if (/(?:next|upcoming|coming up).*reminder|reminders?.*(?:next|upcoming|coming up)/.test(q))
    return 'upcoming_reminders';
  if (/what should i focus on today|what .*do today/.test(q)) return 'focus_today';
  if (/documents?.*(?:add(?:ed)?|created|saved).*recent|recent(?:ly)? added documents?/.test(q))
    return 'recent_documents';
  if (/\bnext week\b/.test(q) && /due|deadline|tasks?|assignments?/.test(q)) return 'due_next_week';
  if (
    /\b(?:next 7 days|this week)\b/.test(q) &&
    /due|deadline|tasks?|assignments?|need to do/.test(q)
  )
    return 'due_next_7';
  if (
    /which documents?|what (?:information|documents).*about|summari[sz]e.*(?:documents?|about)|talks? about|discuss(?:es)?/.test(
      q,
    )
  )
    return 'semantic_documents';
  if (/detailed|plan|which .*first|busiest|most work|this week|next week|next 7 days/.test(q))
    return 'workspace_reasoning';
  return 'workspace_reasoning';
}

export function dateOptions({ now = new Date(), today, timezoneOffset = 0 } = {}) {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : localTodayKey(now);
  return {
    now,
    today: key,
    timezoneOffset: Number.isFinite(Number(timezoneOffset)) ? Number(timezoneOffset) : 0,
  };
}

async function realTasks(userId, now) {
  return (await Task.find({ userId }).lean()).map((item) => applyTaskPriority(item, { now }));
}
function taskLine(task) {
  return `${task.title}${task.dueDate ? ` — due ${formatDay(task.dueDate)}` : ''} — ${task.priority} priority — ${task.status}`;
}
function direct(answer, sources = [], metadata = {}) {
  return { direct: true, answer, sources, metadata };
}

export async function retrieveWorkspace({ userId, message, date = {} }) {
  const kind = classifyWorkspaceQuery(message);
  const { now, today, timezoneOffset } = dateOptions(date);
  if (kind === 'general_knowledge') {
    return {
      direct: false,
      kind,
      context: '',
      sources: [],
      metadata: {
        kind,
        selectedTasks: 0,
        selectedReminders: 0,
        selectedDocuments: 0,
        contextCharacters: 0,
        today,
      },
    };
  }
  if (kind === 'document_count') {
    const count = await Document.countDocuments({ userId });
    return direct(`**${count} document${count === 1 ? '' : 's'}.**`, [], { kind, count });
  }
  if (kind === 'recent_documents') {
    const items = await Document.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .select('title category createdAt')
      .lean();
    return direct(
      items.length
        ? `Your most recently added documents are:\n${items.map((item) => `- ${item.title} — added ${formatDay(item.createdAt)}`).join('\n')}`
        : 'You have not added any documents yet.',
      items.map((item) => source('document', item, item.category)),
      { kind, count: items.length },
    );
  }
  const tasks = kind === 'semantic_documents' ? [] : await realTasks(userId, now);
  const open = tasks.filter((item) => OPEN.includes(item.status));
  const deadlines = summarizeTaskDeadlines(tasks, { today, windowDays: 14 });
  if (kind === 'focus_today') {
    const items = open.filter(task => task.priority === 'high' || (task.dueDate && taskDateKey(task.dueDate) <= today))
      .sort((a, b) => taskPriorityRank[a.priority] - taskPriorityRank[b.priority] || b.priorityScore - a.priorityScore).slice(0, 10);
    return direct(items.length ? `Focus on these current tasks:\n${items.map(task => `- ${taskLine(task)}`).join('\n')}` : 'You have no pending tasks requiring attention today.', await taskSources(userId, items, 'Current task'), { kind, today, count: items.length });
  }
  if (kind === 'open_task_count')
    return direct(`**${open.length} open task${open.length === 1 ? '' : 's'}.**`, [], {
      kind,
      count: open.length,
    });
  if (kind === 'specific_date') {
    const dateKey = mentionedDateKey(message, today);
    const items = dateKey
      ? open
          .filter((item) => taskDateKey(item.dueDate) === dateKey)
          .sort(
            (a, b) =>
              taskPriorityRank[a.priority] - taskPriorityRank[b.priority] ||
              String(a._id).localeCompare(String(b._id)),
          )
      : [];
    return direct(
      items.length
        ? `On **${formatDay(`${dateKey}T00:00:00.000Z`)}**, you need to complete:\n${items.map((item) => `- ${taskLine(item)}`).join('\n')}`
        : `You have no active tasks due on ${dateKey ? formatDay(`${dateKey}T00:00:00.000Z`) : 'that date'}.`,
      await taskSources(userId, items, `Due ${dateKey}`),
      { kind, count: items.length, date: dateKey },
    );
  }
  if (kind === 'overdue') {
    const items = deadlines.overdue.sort(
      (a, b) =>
        taskDateKey(a.dueDate).localeCompare(taskDateKey(b.dueDate)) ||
        taskPriorityRank[a.priority] - taskPriorityRank[b.priority],
    );
    return direct(
      items.length
        ? `You have **${items.length} overdue task${items.length === 1 ? '' : 's'}**:\n${items.map((item) => `- ${taskLine(item)}`).join('\n')}`
        : 'You have no overdue tasks.',
      await taskSources(userId, items, 'Overdue'),
      { kind, count: items.length },
    );
  }
  if (kind === 'due_today') {
    const items = deadlines.dueToday;
    return direct(
      items.length
        ? `You have **${items.length} task${items.length === 1 ? '' : 's'} due today**:\n${items.map((item) => `- ${taskLine(item)}`).join('\n')}`
        : 'You have no active tasks due today.',
      await taskSources(userId, items, 'Due today'),
      { kind, count: items.length, today },
    );
  }
  if (kind === 'upcoming_14') {
    const items = deadlines.upcoming.sort((a, b) =>
      taskDateKey(a.dueDate).localeCompare(taskDateKey(b.dueDate)),
    );
    return direct(
      items.length
        ? `You have **${items.length} deadline${items.length === 1 ? '' : 's'} in the next 14 days**:\n${items.map((item) => `- ${taskLine(item)}`).join('\n')}`
        : 'You have no active task deadlines in the next 14 days.',
      await taskSources(userId, items, 'Upcoming deadline'),
      { kind, count: items.length, start: today, end: addCalendarDays(today, 14) },
    );
  }
  if (kind === 'due_next_7' || kind === 'due_next_week') {
    const start = kind === 'due_next_week' ? addCalendarDays(today, 8) : today;
    const end = kind === 'due_next_week' ? addCalendarDays(today, 14) : addCalendarDays(today, 7);
    const items = open
      .filter((item) => {
        const due = taskDateKey(item.dueDate);
        return due && due >= start && due <= end;
      })
      .sort((a, b) => taskDateKey(a.dueDate).localeCompare(taskDateKey(b.dueDate)));
    const label = kind === 'due_next_week' ? 'next week' : 'the next 7 days';
    return direct(
      items.length
        ? `You have **${items.length} active task${items.length === 1 ? '' : 's'} due ${label}**:\n${items.map((item) => `- ${taskLine(item)}`).join('\n')}`
        : `You have no active tasks due ${label}.`,
      await taskSources(userId, items, `Due ${label}`),
      { kind, count: items.length, start, end },
    );
  }
  if (kind === 'most_urgent') {
    const item = [...open].sort(
      (a, b) =>
        taskPriorityRank[a.priority] - taskPriorityRank[b.priority] ||
        b.priorityScore - a.priorityScore ||
        (a.dueDate ? new Date(a.dueDate) : Infinity) -
          (b.dueDate ? new Date(b.dueDate) : Infinity) ||
        String(a._id).localeCompare(String(b._id)),
    )[0];
    return direct(
      item
        ? `**${item.title}** is your most urgent task. It has ${item.priority} effective priority${item.dueDate ? ` and is due ${formatDay(item.dueDate)}` : ''}.`
        : 'You have no open tasks.',
      item ? await taskSources(userId, [item], `${item.priority} effective priority`) : [],
      { kind, taskId: item?._id || null },
    );
  }
  if (kind === 'task_origin') {
    const quoted = String(message)
      .match(/["']([^"']+)["']/)?.[1]
      ?.toLowerCase();
    const terms = normalizeTerms(message);
    const item = tasks
      .map((task) => ({
        task,
        score: quoted
          ? task.title.toLowerCase() === quoted
            ? 100
            : task.title.toLowerCase().includes(quoted)
              ? 50
              : 0
          : terms.filter((term) => task.title.toLowerCase().includes(term)).length,
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (!item?.score)
      return direct('I could not find a matching task in your workspace.', [], { kind });
    const document = item.task.documentId
      ? await Document.findOne({ _id: item.task.documentId, userId })
          .select('title category')
          .lean()
      : null;
    return direct(
      document
        ? `The task **${item.task.title}** came from **${document.title}**.`
        : `The task **${item.task.title}** is not linked to a source document.`,
      await taskSources(userId, [item.task], ''),
      { kind },
    );
  }
  const day = reminderDayBounds(today, timezoneOffset);
  if (kind === 'reminders_today') {
    const items = await Reminder.find({
      userId,
      status: 'active',
      remindAt: { $gte: day.start, $lt: day.end },
    })
      .sort({ remindAt: 1 })
      .lean();
    return direct(
      items.length
        ? `You have **${items.length} reminder${items.length === 1 ? '' : 's'} today**:\n${items.map((item) => `- ${item.title} — ${new Date(item.remindAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`).join('\n')}`
        : 'You have no active reminders today.',
      items.map((item) => source('reminder', item, 'Today')),
      { kind, count: items.length },
    );
  }
  if (kind === 'upcoming_reminders') {
    const items = await Reminder.find({ userId, status: 'active', remindAt: { $gt: now } })
      .sort({ remindAt: 1 })
      .limit(10)
      .lean();
    return direct(
      items.length
        ? `Your next reminders are:\n${items.map((item) => `- ${item.title} — ${new Date(item.remindAt).toLocaleString()}`).join('\n')}`
        : 'You have no upcoming reminders.',
      items.map((item) => source('reminder', item, 'Upcoming')),
      { kind, count: items.length },
    );
  }
  const reminders = kind === 'semantic_documents' ? [] : await Reminder.find({
    userId,
    status: 'active',
    remindAt: { $gte: day.start, $lt: new Date(day.start.getTime() + 14 * 86400000) },
  })
    .sort({ remindAt: 1 })
    .limit(20)
    .lean();
  const relevantOpen = open
    .sort(
      (a, b) =>
        taskPriorityRank[a.priority] - taskPriorityRank[b.priority] ||
        b.priorityScore - a.priorityScore ||
        String(a._id).localeCompare(String(b._id)),
    )
    .slice(0, 25);
  const taskContext = `TASKS (${relevantOpen.length} selected):\n${relevantOpen.map(taskLine).join('\n') || 'None'}`;
  const reminderContext = `REMINDERS (${reminders.length} selected):\n${reminders.map((item) => `${item.title} ? ${new Date(item.remindAt).toISOString()}`).join('\n') || 'None'}`;
  const docContexts = [];
  const documentCount = await Document.countDocuments({ userId });
  // Stream metadata across the collection; retain at most five bounded contexts.
  const yesterday = /\buploaded yesterday\b/i.test(message);
  const uploadDay = reminderDayBounds(addCalendarDays(today, -1), timezoneOffset);
  const candidates = yesterday ? Document.find({ userId, createdAt: { $gte: uploadDay.start, $lt: uploadDay.end } }).sort({ createdAt: -1 }).limit(20).select('title category').lean() : await workspaceKnowledgeCandidates(userId, message);
  const documentQuery = yesterday || /\btalk about\b/i.test(message) ? `Summarize ${message}` : message;
  for await (const doc of candidates) {
    const selected = await retrieveDocumentKnowledge({
      documentId: doc._id,
      userId,
      question: documentQuery,
      config: { maxContextChars: 15000, maxChunks: 2, maxHistoryMessages: 4 },
    });
    if (!selected.context) continue;
    docContexts.push({
      doc,
      selected,
      score: Math.max(...selected.chunks.map((chunk) => chunk.score)),
    });
    docContexts.sort(
      (a, b) => b.score - a.score || String(a.doc._id).localeCompare(String(b.doc._id)),
    );
    if (docContexts.length > 5) docContexts.pop();
  }
  // Share one prompt budget across sources without cutting a cited chunk in half.
  let remainingDocumentChars =
    kind === 'semantic_documents'
      ? 17900
      : Math.max(0, 23900 - taskContext.length - reminderContext.length);
  for (let i = 0; i < docContexts.length;) {
    const item = docContexts[i];
    const framing = `[Document: ${item.doc.title}]\n`.length + 2;
    if (item.selected.context.length + framing > remainingDocumentChars) {
      docContexts.splice(i, 1);
      continue;
    }
    remainingDocumentChars -= item.selected.context.length + framing;
    i++;
  }
  const documentSources = docContexts.map(({ doc, selected }) =>
    source(
      'document',
      doc,
      selected.chunks
        .map((chunk) => `${chunk.page ? `Page ${chunk.page}, ` : ''}Chunk ${chunk.chunkIndex + 1}`)
        .join('; '),
    ),
  );
  if (!tasks.length && !reminders.length && !documentCount)
    return direct(
      "You don't have any tasks, reminders, or documents yet. Add some information and I can help organize it.",
      [],
      { kind: 'empty' },
    );
  if (kind === 'semantic_documents' && !docContexts.length)
    return {
      hasEvidence: false,
      direct: false,
      kind,
      context: null,
      sources: [],
      metadata: {
        kind,
        selectedTasks: 0,
        selectedReminders: 0,
        selectedDocuments: 0,
        contextCharacters: 0,
        today,
      },
    };
  if (kind === 'semantic_documents') {
    const context =
      `RELEVANT DOCUMENT EXCERPTS (${docContexts.length} documents):\n${docContexts.map(({ doc, selected }) => `[Document: ${doc.title}]\n${selected.context}`).join('\n\n') || 'None'}`.slice(
        0,
        18000,
      );
    return {
      direct: false,
      kind,
      context,
      sources: documentSources,
      metadata: {
        kind,
        selectedTasks: 0,
        selectedReminders: 0,
        selectedDocuments: docContexts.length,
        contextCharacters: context.length,
        today,
      },
    };
  }
  const sources = [
    ...documentSources,
    ...(await taskSources(userId, relevantOpen.slice(0, 10), '')),
    ...reminders.slice(0, 8).map((item) => source('reminder', item, 'Active reminder')),
  ];
  const context = [
    taskContext,
    reminderContext,
    `RELEVANT DOCUMENT EXCERPTS (${docContexts.length} documents):\n${docContexts.map(({ doc, selected }) => `[Document: ${doc.title}]\n${selected.context}`).join('\n\n') || 'None'}`,
  ]
    .join('\n\n')
    .slice(0, 24000);
  return {
    direct: false,
    kind,
    context,
    sources,
    metadata: {
      kind,
      selectedTasks: relevantOpen.length,
      selectedReminders: reminders.length,
      selectedDocuments: docContexts.length,
      contextCharacters: context.length,
      today,
    },
  };
}
