import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import app from '../app.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Reminder from '../models/Reminder.js';
import Document from '../models/Document.js';
import Memory from '../models/Memory.js';
import DailyBriefing from '../models/DailyBriefing.js';
import {
  briefingClock,
  getDailyBriefing,
  setBriefingNarratorForTests,
  updateBriefingSettings,
} from '../services/dailyBriefingService.js';
import {
  generateBriefingNarrative,
  BRIEFING_SYSTEM_PROMPT,
} from '../services/briefingAiService.js';
import { applyTaskPriority } from '../services/taskPriorityService.js';
import { addCalendarDays } from '../services/taskDeadlineService.js';
import { memorySettings, saveMemory } from '../services/memoryService.js';

let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  console.log(`PASS ${++checks}: ${label}`);
};
let server;
let base;
const ids = [];
let calls = 0;
let captured;
const now = new Date();
const timeZone = 'Asia/Karachi';
const clock = briefingClock(now, timeZone);
const goodNarrator = async (data) => {
  calls++;
  captured = data;
  return generateBriefingNarrative(data, {
    generate: async () => ({
      text: JSON.stringify({
        summaryId: 'concise',
        recommendationIds: Object.keys(data.recommendationOptions).slice(0, 3),
      }),
    }),
  });
};
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, ...(await response.json()) };
}
async function run() {
  try {
    check(
      briefingClock(new Date('2026-09-10T20:00:00Z'), 'Asia/Karachi').date === '2026-09-11',
      'Local date uses the requested valid time zone',
    );
    const dst = briefingClock(new Date('2026-03-08T12:00:00Z'), 'America/New_York');
    check(
      dst.tomorrow - dst.start === 23 * 3600000,
      'Reminder day boundaries account for spring DST transition',
    );
    const fall = briefingClock(new Date('2026-11-01T12:00:00Z'), 'America/New_York');
    check(
      fall.tomorrow - fall.start === 25 * 3600000,
      'Reminder day boundaries account for autumn DST transition',
    );
    assert.throws(() => briefingClock(now, 'invalid/zone'), { statusCode: 400 });
    check(true, 'Invalid time zones are rejected');
    const options = {
      summaries: { concise: 'Known summary' },
      recommendationOptions: { focus: 'Known action' },
      focusTasks: [],
    };
    await assert.rejects(
      generateBriefingNarrative(options, {
        generate: async () => ({ text: '{"summaryId":"invented","recommendationIds":[]}' }),
      }),
    );
    await assert.rejects(
      generateBriefingNarrative(options, {
        generate: async () => ({ text: '{"summaryId":"concise","recommendationIds":["foreign"]}' }),
      }),
    );
    await assert.rejects(
      generateBriefingNarrative(options, {
        generate: async () => ({
          text: '{"summaryId":"concise","recommendationIds":[],"priority":"low"}',
        }),
      }),
    );
    check(
      /Never change priorities/.test(BRIEFING_SYSTEM_PROMPT),
      'Invalid narrative IDs, priority edits, and invented facts cannot enter a briefing',
    );
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await DailyBriefing.init();
    await Memory.init();
    setBriefingNarratorForTests(goodNarrator);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const users = [];
    for (const name of ['A', 'B']) {
      const user = await request('/api/auth/register', null, 'POST', {
        fullName: `Briefing ${name}`,
        email: `briefing-${randomUUID()}@lifeadmin.local`,
        password: 'BriefingTest123!',
      });
      assert.equal(user.status, 201);
      users.push(user);
      ids.push(user.user._id);
    }
    const [a, b] = users;
    const tasks = await Task.create([
      {
        userId: a.user._id,
        title: 'Overdue report',
        dueDate: `${addCalendarDays(clock.date, -1)}T00:00:00Z`,
        confirmedPriority: 'medium',
      },
      { userId: a.user._id, title: 'Submit assignment today', dueDate: `${clock.date}T00:00:00Z` },
      {
        userId: a.user._id,
        title: 'Project documentation',
        priorityOverride: 'high',
        dueDate: `${addCalendarDays(clock.date, 1)}T00:00:00Z`,
      },
      {
        userId: a.user._id,
        title: 'Finished task',
        status: 'completed',
        dueDate: `${clock.date}T00:00:00Z`,
      },
      { userId: a.user._id, title: 'My password is do-not-show', priorityOverride: 'high' },
    ]);
    await Reminder.create([
      {
        userId: a.user._id,
        title: 'Client meeting today',
        remindAt: new Date(clock.start.getTime() + 12 * 3600000),
      },
      {
        userId: a.user._id,
        title: 'Upcoming appointment',
        remindAt: new Date(clock.tomorrow.getTime() + 12 * 3600000),
      },
      {
        userId: a.user._id,
        title: 'Dismissed reminder',
        status: 'dismissed',
        remindAt: clock.start,
      },
    ]);
    await Document.create([
      {
        userId: a.user._id,
        title: 'Assignment Guidelines.pdf',
        sourceType: 'pdf',
        extractedText: 'Private full text must never enter briefing prompts.',
        aiAnalysis: {
          status: 'completed',
          actionRequired: true,
          summary: 'Sensitive summary must not enter prompt.',
        },
      },
      { userId: a.user._id, title: 'My API key: secret', sourceType: 'text' },
    ]);
    const settings = await memorySettings(a.user._id);
    await saveMemory(
      a.user._id,
      { type: 'preference', content: 'I prefer concise answers.', confidence: 1 },
      settings,
      'conversation_confirmed',
    );
    await saveMemory(
      a.user._id,
      { type: 'personal', content: 'I am a Software Engineering student.', confidence: 1 },
      settings,
      'conversation_confirmed',
    );
    check(
      (await request('/api/briefings')).status === 401,
      'Briefing requests require authentication',
    );
    const first = await getDailyBriefing(a.user._id, { timeZone, now });
    check(
      first.mode === 'ai' && !first.cached && first.briefing.focusTasks.length === 3,
      'Active owned tasks appear in structured briefing',
    );
    check(
      first.briefing.focusTasks.some(
        (task) => task.title === 'Overdue report' && task.attention === 'high',
      ),
      'Overdue tasks receive high attention',
    );
    const effective = applyTaskPriority(tasks[0].toObject(), {
      now: new Date(`${clock.date}T12:00:00Z`),
    });
    check(
      first.briefing.focusTasks[0].priority === effective.priority &&
        first.briefing.focusTasks[0].priorityScore === effective.priorityScore,
      'Priority values come from the existing priority engine',
    );
    check(
      first.briefing.todayReminders[0].title === 'Client meeting today' &&
        first.briefing.upcomingEvents.some((event) => event.title === 'Upcoming appointment'),
      'Today and upcoming reminders are separated',
    );
    check(
      first.briefing.recentDocuments.some((doc) => doc.title === 'Assignment Guidelines.pdf') &&
        first.briefing.importantDocuments.length === 1,
      'Recent and important analyzed documents are included',
    );
    check(
      captured.preferences.includes('concise answers') &&
        !JSON.stringify(captured).includes('Software Engineering'),
      'Only safe relevant preferences personalize proactive content',
    );
    check(
      !JSON.stringify(first).includes('do-not-show') &&
        !JSON.stringify(captured).includes('Private full text') &&
        !JSON.stringify(captured).includes('Sensitive summary') &&
        !JSON.stringify(first).includes('API key'),
      'Sensitive titles and full document text are not exposed',
    );
    check(
      first.briefing.goals.length === 0 && first.briefing.goalSourceAvailable === false,
      'Absent goal system produces no fabricated goals or milestones',
    );
    const before = calls;
    const cached = await getDailyBriefing(a.user._id, { timeZone, now });
    check(
      cached.cached &&
        calls === before &&
        (await DailyBriefing.countDocuments({ userId: a.user._id, date: clock.date })) === 1,
      'Second same-day request reuses one persisted cache entry',
    );
    const refreshed = await getDailyBriefing(a.user._id, { timeZone, now, refresh: true });
    check(!refreshed.cached && calls === before + 1, 'Manual refresh generates a new briefing');
    const other = await getDailyBriefing(b.user._id, { timeZone, now });
    check(
      other.mode === 'empty' &&
        other.briefing.summary === 'No important tasks today. Enjoy your day.' &&
        !JSON.stringify(other).includes('Overdue report'),
      'Second user gets only a friendly empty briefing',
    );
    const api = await request(`/api/briefings?timeZone=${timeZone}&userId=${a.user._id}`, b.token);
    check(
      api.status === 200 && !JSON.stringify(api).includes('Overdue report'),
      'Request parameters cannot override ownership',
    );
    check(
      (await request('/api/briefings/refresh', a.token, 'POST', { timeZone, userId: b.user._id }))
        .status === 400,
      'Refresh rejects injected owner fields',
    );
    setBriefingNarratorForTests(async () => {
      throw new Error('private provider credentials');
    });
    const fallback = await getDailyBriefing(a.user._id, { timeZone, now, refresh: true });
    check(
      fallback.mode === 'fallback' &&
        fallback.briefing.focusTasks.length === 3 &&
        !JSON.stringify(fallback).includes('credentials'),
      'AI outage returns a safe deterministic briefing',
    );
    setBriefingNarratorForTests(async () => ({
      summary: 'Fabricated meeting tomorrow',
      recommendations: ['Send money now'],
    }));
    check(
      (await getDailyBriefing(a.user._id, { timeZone, now, refresh: true })).mode === 'fallback',
      'Unvalidated custom narrator output also falls back',
    );
    await updateBriefingSettings(a.user._id, { enabled: false });
    const disabled = await getDailyBriefing(a.user._id, { timeZone, now });
    check(
      disabled.enabled === false &&
        disabled.briefing === null &&
        !(await DailyBriefing.exists({ userId: a.user._id })),
      'Disable hides briefing and clears derived cached snapshots',
    );
    await updateBriefingSettings(a.user._id, { enabled: true, hidden: true });
    check(
      (await getDailyBriefing(a.user._id, { timeZone, now })).hidden,
      'Hide is persisted separately from disable',
    );
    await updateBriefingSettings(a.user._id, { hidden: false });
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let concurrentCalls = 0;
    setBriefingNarratorForTests(async (data) => {
      concurrentCalls++;
      entered();
      await gate;
      return goodNarrator(data);
    });
    const building = getDailyBriefing(a.user._id, { timeZone, now });
    await started;
    const pending = await getDailyBriefing(a.user._id, { timeZone, now });
    check(
      pending.generating && concurrentCalls === 1,
      'Concurrent requests share a database generation lease',
    );
    release();
    await building;
    check(
      (await getDailyBriefing(a.user._id, { timeZone, now })).cached,
      'Completed concurrent generation is cached',
    );
    setBriefingNarratorForTests(goodNarrator);
    const beforePrivacy = calls;
    await User.updateOne(
      { _id: a.user._id },
      { $set: { 'memorySettings.enabled': false }, $inc: { 'memorySettings.consentVersion': 1 } },
    );
    await getDailyBriefing(a.user._id, { timeZone, now });
    check(
      calls === beforePrivacy + 1 && captured.preferences === '',
      'Memory privacy changes invalidate cached personalization',
    );
    const tomorrow = new Date(now.getTime() + 86400000);
    check(
      !(await getDailyBriefing(a.user._id, { timeZone, now: tomorrow })).cached,
      'New local day generates a separate briefing',
    );
    const overdueLow = await Task.create({
      userId: b.user._id,
      title: 'Overdue with low override',
      priorityOverride: 'low',
      dueDate: `${addCalendarDays(clock.date, -1)}T00:00:00Z`,
    });
    const lowBrief = await getDailyBriefing(b.user._id, { timeZone, now, refresh: true });
    check(
      lowBrief.briefing.focusTasks[0].priority === 'low' &&
        lowBrief.briefing.focusTasks[0].attention === 'high',
      'Overdue attention never overwrites a user priority override',
    );
    check(
      (await Task.findById(overdueLow._id)).priorityOverride === 'low',
      'Briefing generation never mutates task priority',
    );
    check(
      (await request('/api/briefings/settings', a.token, 'PATCH', { enabled: 'false' })).status ===
        400,
      'Settings reject invalid values',
    );
    const apiRefresh = await request('/api/briefings/refresh', a.token, 'POST', { timeZone });
    check(
      apiRefresh.status === 200 &&
        !apiRefresh.cached &&
        (await request(`/api/briefings?timeZone=${timeZone}`, a.token)).cached,
      'HTTP refresh creates a new snapshot reused by HTTP GET',
    );
    await DailyBriefing.updateOne(
      { userId: a.user._id, date: clock.date, timeZone },
      {
        $set: {
          content: null,
          leaseToken: 'abandoned',
          leaseUntil: new Date(now.getTime() - 1000),
        },
      },
    );
    check(
      (await getDailyBriefing(a.user._id, { timeZone, now })).briefing.focusTasks.length === 3,
      'Expired generation leases recover after a crashed worker',
    );
    let releaseDisabled;
    let enteredDisabled;
    const disabledGate = new Promise((resolve) => {
      releaseDisabled = resolve;
    });
    const disabledStarted = new Promise((resolve) => {
      enteredDisabled = resolve;
    });
    setBriefingNarratorForTests(async (data) => {
      enteredDisabled();
      await disabledGate;
      return goodNarrator(data);
    });
    const inFlight = getDailyBriefing(a.user._id, { timeZone, now, refresh: true });
    await disabledStarted;
    await updateBriefingSettings(a.user._id, { enabled: false });
    releaseDisabled();
    const cancelled = await inFlight;
    check(
      !cancelled.enabled &&
        cancelled.briefing === null &&
        !(await DailyBriefing.exists({ userId: a.user._id })),
      'Disabling during generation prevents late publication or recreated cache',
    );
    console.log(`Daily briefing: ${checks} checks passed.`);
  } finally {
    setBriefingNarratorForTests();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState && ids.length)
      await Promise.all([
        DailyBriefing.deleteMany({ userId: { $in: ids } }),
        Memory.deleteMany({ userId: { $in: ids } }),
        Task.deleteMany({ userId: { $in: ids } }),
        Reminder.deleteMany({ userId: { $in: ids } }),
        Document.deleteMany({ userId: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    await mongoose.disconnect();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
