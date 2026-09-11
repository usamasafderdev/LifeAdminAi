import { calendarService } from './calendarService.js';
import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import DailyBriefing from '../models/DailyBriefing.js';
import { applyTaskPriority } from './taskPriorityService.js';
import { addCalendarDays, summarizeTaskDeadlines, taskDateKey } from './taskDeadlineService.js';
import { reminderDayBounds } from './integrationService.js';
import { retrieveMemories, markMemoriesUsed } from './memoryService.js';
import { containsSensitiveInformation } from './memoryExtractionService.js';
import { generateBriefingNarrative } from './briefingAiService.js';

const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const rank = { high: 0, medium: 1, low: 2 };
const safeTitle = (title) =>
  typeof title === 'string' && title.trim() && !containsSensitiveInformation(title);
export async function getBriefingSettings(userId) {
  if (!userId) throw invalid('User not found', 404);
  const user = await User.findById(userId).select('briefingSettings memorySettings').lean();
  if (!user) throw invalid('User not found', 404);
  const settings = { enabled: true, hidden: false, version: 0, ...user.briefingSettings };
  const memory = { enabled: true, generation: 0, consentVersion: 0, ...user.memorySettings };
  return {
    ...settings,
    privacyStamp: JSON.stringify([
      settings.version,
      memory.enabled,
      memory.generation,
      memory.consentVersion,
    ]),
  };
}
export async function updateBriefingSettings(userId, body) {
  if (
    !body ||
    !Object.keys(body).length ||
    Object.keys(body).some(
      (key) => !['enabled', 'hidden'].includes(key) || typeof body[key] !== 'boolean',
    )
  )
    throw invalid('Provide boolean briefing settings only.');
  await getBriefingSettings(userId);
  await User.updateOne(
    { _id: userId },
    {
      $set: Object.fromEntries(
        Object.entries(body).map(([key, value]) => [`briefingSettings.${key}`, value]),
      ),
      $inc: { 'briefingSettings.version': 1 },
    },
  );
  // Also erase old derived snapshots when settings change.
  await DailyBriefing.deleteMany({ userId });
  const { enabled, hidden } = await getBriefingSettings(userId);
  return { enabled, hidden };
}
function zoneParts(now, timeZone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}
function midnight(date, timeZone) {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  let stamp = target;
  for (let i = 0; i < 3; i++) {
    const p = zoneParts(new Date(stamp), timeZone);
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    stamp += target - local;
  }
  // Reuse the existing reminder boundary convention for a resolved local midnight.
  return reminderDayBounds(date, (stamp - target) / 60000).start;
}
export function briefingClock(now = new Date(), requestedZone = 'UTC') {
  let timeZone;
  try {
    if (typeof requestedZone !== 'string' || requestedZone.length > 100) throw new Error();
    timeZone = new Intl.DateTimeFormat('en', { timeZone: requestedZone }).resolvedOptions()
      .timeZone;
  } catch {
    throw invalid('Invalid time zone.');
  }
  const p = zoneParts(now, timeZone);
  const date = `${p.year}-${p.month}-${p.day}`;
  return {
    date,
    timeZone,
    start: midnight(date, timeZone),
    tomorrow: midnight(addCalendarDays(date, 1), timeZone),
    end: midnight(addCalendarDays(date, 15), timeZone),
  };
}
const taskSort = (a, b) =>
  rank[a.priority] - rank[b.priority] ||
  b.priorityScore - a.priorityScore ||
  (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
  String(a.taskId).localeCompare(String(b.taskId));
export async function collectBriefingData(userId, clock) {
  if (!userId) throw invalid('User not found', 404);
  const focusTasks = [];
  const taskEvents = [];
  let firstOverdue = null;
  const counts = { openTasks: 0, overdue: 0, dueToday: 0 };
  for await (const raw of Task.find({ userId, status: { $in: ['pending', 'in_progress'] } })
    .select('title status dueDate confirmedPriority priorityOverride')
    .lean()
    .cursor()) {
    if (!safeTitle(raw.title)) continue;
    const task = applyTaskPriority(raw, { now: new Date(`${clock.date}T12:00:00.000Z`) });
    const deadlines = summarizeTaskDeadlines([task], { today: clock.date });
    counts.openTasks++;
    counts.overdue += deadlines.overdue.length;
    counts.dueToday += deadlines.dueToday.length;
    const dueDate = taskDateKey(task.dueDate);
    const row = {
      taskId: task._id,
      title: task.title,
      priority: task.priority,
      priorityScore: task.priorityScore,
      dueDate,
      attention: deadlines.overdue.length ? 'high' : 'normal',
      reason: deadlines.overdue.length
        ? 'Overdue and needs attention'
        : deadlines.dueToday.length
          ? 'Due today'
          : task.priorityOverride
            ? `Your ${task.priority} priority override`
            : task.priorityReasons.join('; ').slice(0, 300),
    };
    if (deadlines.overdue.length && (!firstOverdue || taskSort(row, firstOverdue) < 0))
      firstOverdue = row;
    focusTasks.push(row);
    focusTasks.sort(taskSort);
    if (focusTasks.length > 5) focusTasks.pop();
    if (deadlines.upcoming.length && dueDate > clock.date) {
      taskEvents.push({ type: 'task', sourceId: task._id, title: task.title, date: dueDate });
      taskEvents.sort((a, b) => a.date.localeCompare(b.date));
      if (taskEvents.length > 8) taskEvents.pop();
    }
  }
  if (
    firstOverdue &&
    !focusTasks.some((task) => String(task.taskId) === String(firstOverdue.taskId))
  ) {
    if (focusTasks.length === 5) focusTasks.pop();
    focusTasks.push(firstOverdue);
    focusTasks.sort(taskSort);
  }
  const [reminders, documents, important, memories] = await Promise.all([
    Reminder.find({ userId, status: 'active', remindAt: { $gte: clock.start, $lt: clock.end } })
      .sort({ remindAt: 1, _id: 1 })
      .limit(30)
      .select('title remindAt')
      .lean(),
    Document.find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(15)
      .select('title createdAt')
      .lean(),
    Document.find({ userId, 'aiAnalysis.status': 'completed', 'aiAnalysis.actionRequired': true })
      .sort({ updatedAt: -1 })
      .limit(15)
      .select('title createdAt')
      .lean(),
    retrieveMemories(userId, 'daily plan concise answers preferences writing style focus tasks'),
  ]);
  const events = reminders
    .filter((item) => safeTitle(item.title))
    .map((item) => ({
      type: 'reminder',
      sourceId: item._id,
      title: item.title,
      date: item.remindAt.toISOString(),
    }));
  const scheduledBlocks = await calendarService.list(userId, clock.start, clock.tomorrow);
  const todayReminders = events.filter((item) => new Date(item.date) < clock.tomorrow).slice(0, 8);
  const upcomingEvents = [
    ...taskEvents,
    ...events.filter((item) => new Date(item.date) >= clock.tomorrow),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);
  const mapDocuments = (rows) =>
    rows
      .filter((item) => safeTitle(item.title))
      .slice(0, 5)
      .map((item) => ({ documentId: item._id, title: item.title, createdAt: item.createdAt }));
  // Only safe preferences personalize a briefing; personal facts are not surfaced proactively.
  const preferenceLines = [];
  const memoryIds = [];
  for (const [index, line] of (memories.context || '').split('\n').entries()) {
    if (!line) continue;
    const item = JSON.parse(line);
    if (item.type === 'preference' && !containsSensitiveInformation(item.content)) {
      preferenceLines.push(line);
      memoryIds.push(memories.ids[index]);
    }
  }
  return {
    date: clock.date,
    scheduledBlocks: scheduledBlocks.filter(item => safeTitle(item.title)),
    focusTasks,
    todayReminders,
    upcomingEvents,
    recentDocuments: mapDocuments(documents),
    importantDocuments: mapDocuments(important),
    goals: [],
    milestones: [],
    goalSourceAvailable: false,
    counts,
    preferences: preferenceLines.join('\n'),
    memorySelection: { ...memories, ids: memoryIds },
  };
}
export function briefingOptions(data) {
  const empty =
    !(data.scheduledBlocks || []).length &&
    !data.focusTasks.length &&
    !data.todayReminders.length &&
    !data.upcomingEvents.length &&
    !data.recentDocuments.length &&
    !data.importantDocuments.length;
  const concise = empty
    ? 'No important tasks today. Enjoy your day.'
    : data.counts.openTasks
      ? `${data.counts.openTasks} open tasks: ${data.counts.overdue} overdue and ${data.counts.dueToday} due today.`
      : 'No open tasks. Review your reminders and recent documents below.';
  const summaries = {
    concise,
    detailed: empty
      ? concise
      : `${concise} ${data.todayReminders.length} reminders today and ${data.upcomingEvents.length} upcoming items are shown.`,
  };
  const recommendationOptions = {};
  if (data.scheduledBlocks?.length) recommendationOptions.schedule = `Follow today's ${data.scheduledBlocks.length} scheduled blocks on Calendar.`;
  if (data.focusTasks[0])
    recommendationOptions.focus = `Start with "${data.focusTasks[0].title}": ${data.focusTasks[0].reason.toLowerCase()}.`;
  if (data.todayReminders[0])
    recommendationOptions.reminder = `Make time for today's reminder: "${data.todayReminders[0].title}".`;
  if (data.importantDocuments[0])
    recommendationOptions.document = `Review the actionable document "${data.importantDocuments[0].title}" and its requirements.`;
  else if (data.recentDocuments[0])
    recommendationOptions.document = `Review the recent document "${data.recentDocuments[0].title}" for any next steps.`;
  if (!data.focusTasks.length && data.upcomingEvents[0])
    recommendationOptions.upcoming = `Prepare for the upcoming item "${data.upcomingEvents[0].title}".`;
  return { summaries, recommendationOptions, empty };
}
let narrator = generateBriefingNarrative;
export function setBriefingNarratorForTests(value) {
  narrator = value || generateBriefingNarrative;
}
export async function getDailyBriefing(
  userId,
  { timeZone = 'UTC', refresh = false, now = new Date() } = {},
) {
  const schedulingProfile = await calendarService.availability(userId);
  if (schedulingProfile) timeZone = schedulingProfile.timezone;
  const settings = await getBriefingSettings(userId);
  if (!settings.enabled || settings.hidden)
    return { enabled: settings.enabled, hidden: settings.hidden, briefing: null, cached: false };
  const clock = briefingClock(now, timeZone);
  const scope = { userId, date: clock.date, timeZone: clock.timeZone };
  let cached = await DailyBriefing.findOne(scope).lean();
  const present = (row, extra = {}) => ({
    enabled: true,
    hidden: false,
    briefing: row.content,
    generatedAt: row.generatedAt,
    timeZone: clock.timeZone,
    mode: row.mode,
    cached: true,
    ...extra,
  });
  if (!refresh && cached?.content && cached.privacyStamp === settings.privacyStamp)
    return present(cached);
  if (!cached) {
    try {
      await DailyBriefing.updateOne(
        scope,
        { $setOnInsert: { expiresAt: new Date(now.getTime() + 8 * 86400000) } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    cached = await DailyBriefing.findOne(scope).lean();
  }
  if (!cached) {
    const current = await getBriefingSettings(userId);
    return {
      enabled: current.enabled,
      hidden: current.hidden,
      briefing: null,
      cached: false,
      settingsChanged: true,
    };
  }
  const token = randomUUID();
  const lease = await DailyBriefing.findOneAndUpdate(
    {
      ...scope,
      revision: cached.revision || 0,
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    },
    { $set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 60000) } },
    { new: true },
  );
  if (!lease) {
    const latest = await DailyBriefing.findOne(scope).lean();
    if (latest?.content && latest.privacyStamp === settings.privacyStamp)
      return present(latest, { generating: Boolean(latest.leaseToken) });
    return { enabled: true, hidden: false, briefing: null, cached: false, generating: true };
  }
  try {
    const data = await collectBriefingData(userId, clock);
    const { summaries, recommendationOptions, empty } = briefingOptions(data);
    let narrative = {
      summary: summaries.concise,
      recommendations: Object.values(recommendationOptions).slice(0, 3),
    };
    let mode = empty ? 'empty' : 'fallback';
    if (!empty) {
      try {
        const result = await narrator({
          summaries,
          recommendationOptions,
          focusTasks: data.focusTasks,
          todayReminders: data.todayReminders,
          upcomingEvents: data.upcomingEvents,
          preferences: data.preferences,
        });
        // Defend even when a future narrator implementation changes its contract.
        if (
          !Object.values(summaries).includes(result.summary) ||
          !Array.isArray(result.recommendations) ||
          result.recommendations.length > 3 ||
          result.recommendations.some(
            (item) => !Object.values(recommendationOptions).includes(item),
          )
        )
          throw new Error('Invalid briefing');
        narrative = { summary: result.summary, recommendations: result.recommendations };
        mode = 'ai';
      } catch {
        /* Fresh deterministic briefing is usable during AI outages. */
      }
    }
    const { preferences, memorySelection, ...facts } = data;
    const current = await getBriefingSettings(userId);
    if (!current.enabled || current.hidden || current.privacyStamp !== settings.privacyStamp)
      return {
        enabled: current.enabled,
        hidden: current.hidden,
        briefing: null,
        cached: false,
        settingsChanged: true,
      };
    const record = await DailyBriefing.findOneAndUpdate(
      { ...scope, leaseToken: token },
      {
        $set: {
          content: { ...facts, ...narrative },
          generatedAt: now,
          mode,
          privacyStamp: settings.privacyStamp,
          leaseToken: null,
          leaseUntil: null,
        },
        $inc: { revision: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!record)
      return { enabled: true, hidden: false, briefing: null, cached: false, generating: true };
    if (mode === 'ai') await markMemoriesUsed(userId, memorySelection);
    return present(record.toObject(), { cached: false });
  } finally {
    await DailyBriefing.updateOne(
      { ...scope, leaseToken: token },
      { $set: { leaseToken: null, leaseUntil: null } },
    );
  }
}
