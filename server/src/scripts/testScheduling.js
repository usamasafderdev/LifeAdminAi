import 'dotenv/config';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../app.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import CalendarEvent from '../models/CalendarEvent.js';
import AvailabilityProfile from '../models/AvailabilityProfile.js';
import ScheduleProposal from '../models/ScheduleProposal.js';
import DailyBriefing from '../models/DailyBriefing.js';
import { buildSchedule, suggestSchedule } from '../services/schedulingService.js';
import {
  validateAvailability,
  wallTime,
  overlaps,
  localDate,
  addDays,
} from '../services/schedulingTimeService.js';
import { generateToken } from '../utils/generateToken.js';
import { answerSchedulingQuestion } from '../services/schedulingAssistantService.js';
import { collectBriefingData, briefingClock } from '../services/dailyBriefingService.js';
import { validateTaskInput } from '../services/taskValidator.js';
import { calendarRange, calendarWrite } from '../services/calendarService.js';

let checks = 0;
const check = (condition, title) => {
  assert.ok(condition, title);
  console.log(`PASS ${++checks}: ${title}`);
};
const profile = validateAvailability({
  timezone: 'Asia/Karachi',
  workingDays: [1, 2, 3, 4, 5],
  availableTimeRanges: [{ start: '18:00', end: '22:00' }],
});
const now = new Date('2026-09-11T10:00:00Z');
const task = {
  _id: new mongoose.Types.ObjectId(),
  title: 'Prepare project report',
  status: 'pending',
  estimatedDuration: 180,
  dueDate: new Date('2026-09-18'),
  priorityOverride: 'medium',
};
const plan = buildSchedule({ tasks: [task], profile, now });
check(plan.blocks.length === 2, '1: Deadline task generates a split schedule');
check(
  plan.blocks[0].startTime.toISOString() === '2026-09-11T13:00:00.000Z',
  '8: Karachi 18:00 is stored as 13:00 UTC',
);
const empty = buildSchedule({ tasks: [task], profile: { ...profile, workingDays: [] }, now });
check(
  !empty.blocks.length && /No availability/.test(empty.warnings[0]),
  '2: No availability produces an explanation',
);
const high = {
  ...task,
  _id: new mongoose.Types.ObjectId(),
  title: 'High task',
  priorityOverride: 'high',
};
const two = buildSchedule({ tasks: [task, high], profile, now });
check(
  two.blocks.every((b, i) => !two.blocks.slice(0, i).some((a) => overlaps(a, b))),
  '3: Two tasks never overlap',
);
check(
  String(two.blocks[0].relatedTaskId) === String(high._id),
  '4: Existing priority override schedules high priority first',
);
const busy = [{ startTime: new Date('2026-09-11T13:00Z'), endTime: new Date('2026-09-11T15:00Z') }];
check(
  buildSchedule({ tasks: [task], profile, now, busy }).blocks.every((b) => !overlaps(b, busy[0])),
  'Existing meetings are excluded',
);
const impossible = buildSchedule({
  tasks: [{ ...task, estimatedDuration: 1000, dueDate: new Date('2026-09-11') }],
  profile,
  now,
});
check(
  impossible.warnings.some((w) => /cannot fit/.test(w)) &&
    impossible.blocks.every((b) => b.endTime <= wallTime('2026-09-12', '00:00', profile.timezone)),
  'Impossible deadlines produce partial plans and explicit warnings',
);
check(
  wallTime('2026-03-08', '02:30', 'America/New_York') === null,
  'DST nonexistent time is rejected',
);
check(
  wallTime('2026-11-01', '01:30', 'America/New_York').toISOString() === '2026-11-01T05:30:00.000Z',
  'DST ambiguous time resolves consistently to first occurrence',
);
check(
  wallTime('2026-09-11', '18:00', 'Asia/Kathmandu').toISOString() === '2026-09-11T12:15:00.000Z',
  'Quarter-hour timezone offsets work',
);
assert.throws(() => validateAvailability({ ...profile, timezone: '' }));
assert.throws(() =>
  validateAvailability({ ...profile, availableTimeRanges: [{ start: '21:00', end: '18:00' }] }),
);
assert.throws(() => validateTaskInput({ estimatedDuration: 1.5 }, { partial: true }));
assert.throws(() => calendarRange('2026-02-30T00:00:00Z', '2026-03-04T00:00:00Z'));
check(true, 'Missing timezone, invalid ranges and fractional duration are rejected');
const allocated = plan.blocks.map((b) => ({ ...b, status: 'planned' }));
check(
  !buildSchedule({ tasks: [task], profile, now, allocations: allocated }).blocks.length,
  'Already allocated task duration is not scheduled twice',
);
const overdue = {
  ...task,
  _id: new mongoose.Types.ObjectId(),
  dueDate: new Date('2026-09-10'),
  priorityOverride: 'low',
};
check(
  String(buildSchedule({ tasks: [high, overdue], profile, now }).blocks[0].relatedTaskId) ===
    String(overdue._id),
  'Overdue work precedes high priority work',
);

(async () => {
  const originalTransaction = mongoose.connection.transaction;
  const originalFindOneAndUpdate = AvailabilityProfile.findOneAndUpdate;
  const originalFindOne = AvailabilityProfile.findOne;
  const originalDeleteMany = DailyBriefing.deleteMany;
  try {
    mongoose.connection.transaction = async () => {
      const error = new Error('Transaction numbers are only allowed.');
      error.code = 20;
      throw error;
    };
    AvailabilityProfile.findOneAndUpdate = async () => ({ timezone: 'Asia/Karachi', revision: 1 });
    AvailabilityProfile.findOne = async () => ({ timezone: 'Asia/Karachi', revision: 1 });
    DailyBriefing.deleteMany = async () => ({ deletedCount: 0 });
    const fallback = await calendarWrite(
      new mongoose.Types.ObjectId().toString(),
      async (session, profile) => ({
        ok: true,
        session: Boolean(session),
        profile: Boolean(profile),
      }),
    );
    check(
      fallback.ok && fallback.session === false && fallback.profile === true,
      'Calendar write falls back safely when replica-set transactions are unavailable',
    );
  } finally {
    mongoose.connection.transaction = originalTransaction;
    AvailabilityProfile.findOneAndUpdate = originalFindOneAndUpdate;
    AvailabilityProfile.findOne = originalFindOne;
    DailyBriefing.deleteMany = originalDeleteMany;
  }
})();

if (!process.argv.includes('--integration')) {
  console.log(
    `${checks} scheduling algorithm checks passed. Use --integration with an isolated replica set for HTTP tests.`,
  );
} else {
  let server;
  const userIds = [];
  try {
    if (!process.env.SCHEDULING_TEST_URI)
      throw new Error('Set SCHEDULING_TEST_URI to an isolated test replica set.');
    await mongoose.connect(process.env.SCHEDULING_TEST_URI, { serverSelectionTimeoutMS: 5000 });
    await Promise.all([
      CalendarEvent.init(),
      AvailabilityProfile.init(),
      ScheduleProposal.init(),
      Task.init(),
      User.init(),
      DailyBriefing.init(),
    ]);
    const suffix = randomUUID();
    const users = await User.create([
      {
        fullName: 'Schedule Tester A',
        email: `schedule-a-${suffix}@example.test`,
        password: 'ScheduleTesting123',
      },
      {
        fullName: 'Schedule Tester B',
        email: `schedule-b-${suffix}@example.test`,
        password: 'ScheduleTesting123',
      },
    ]);
    userIds.push(...users.map((u) => u._id));
    process.env.JWT_SECRET ||= 'isolated-scheduling-test-secret';
    const tokens = users.map((u) => generateToken(u._id));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = async (path, { user = 0, method = 'GET', body } = {}) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(user === null ? {} : { authorization: `Bearer ${tokens[user]}` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, ...(await res.json()) };
    };
    check(
      (await request('/schedule/availability', { user: null })).status === 401,
      'Authentication required',
    );
    const current = new Date();
    const tomorrow = addDays(localDate(current, profile.timezone), 1);
    const futureProfile = { ...profile, workingDays: [0, 1, 2, 3, 4, 5, 6] };
    await request('/schedule/availability', { method: 'PUT', body: futureProfile });
    const created = await request('/tasks', {
      method: 'POST',
      body: {
        title: 'Schedule assignment',
        dueDate: addDays(tomorrow, 7),
        estimatedDuration: 180,
        priority: 'high',
      },
    });
    check(created.success && created.task.estimatedDuration === 180, 'Task API persists duration');
    const id = created.task._id;
    const preview = (
      await request('/schedule/suggestions', {
        method: 'POST',
        body: { taskIds: [id], useAi: false },
      })
    ).proposal;
    check(
      preview?.blocks.length > 0 &&
        (await CalendarEvent.countDocuments({ userId: userIds[0] })) === 0,
      'Preview creates no events',
    );
    check(
      (await request(`/schedule/suggestions/${preview._id}`, { user: 1 })).status === 404,
      '7: Other user cannot read preview',
    );
    check(
      (
        await request(`/schedule/suggestions/${preview._id}/accept`, {
          user: 1,
          method: 'POST',
          body: { approved: true },
        })
      ).status >= 400,
      'Other user cannot accept preview',
    );
    check(
      (
        await request('/schedule/suggestions', {
          user: 1,
          method: 'POST',
          body: { taskIds: [id], useAi: false },
        })
      ).status === 400,
      'Missing availability prevents scheduling',
    );
    await request('/schedule/availability', { user: 1, method: 'PUT', body: futureProfile });
    check(
      (
        await request('/schedule/suggestions', {
          user: 1,
          method: 'POST',
          body: { taskIds: [id], useAi: false },
        })
      ).status === 404,
      'Cross-user task IDs are rejected',
    );
    check(
      (await request(`/schedule/suggestions/${preview._id}/accept`, { method: 'POST', body: {} }))
        .status === 400,
      'Explicit approval is mandatory',
    );
    const rejected = await request(`/schedule/suggestions/${preview._id}/cancel`, {
      method: 'POST',
    });
    check(
      rejected.proposal.status === 'cancelled' &&
        (await CalendarEvent.countDocuments({ userId: userIds[0] })) === 0,
      '6: Rejection creates no events',
    );
    check(
      (
        await request(`/schedule/suggestions/${preview._id}/accept`, {
          method: 'POST',
          body: { approved: true },
        })
      ).status === 409,
      'Cancelled preview cannot be accepted',
    );
    const p1 = (
      await request('/schedule/suggestions', {
        method: 'POST',
        body: { taskIds: [id], useAi: false },
      })
    ).proposal;
    const p2 = (
      await request('/schedule/suggestions', {
        method: 'POST',
        body: { taskIds: [id], useAi: false },
      })
    ).proposal;
    const results = await Promise.all(
      [p1, p2].map((p) =>
        request(`/schedule/suggestions/${p._id}/accept`, {
          method: 'POST',
          body: { approved: true },
        }),
      ),
    );
    check(
      results.filter((r) => r.success).length === 1 && results.some((r) => r.status === 409),
      '5: Concurrent acceptance creates exactly one conflict-free schedule',
    );
    const accepted = results[0].success ? p1 : p2;
    const count = await CalendarEvent.countDocuments({ userId: userIds[0] });
    await request(`/schedule/suggestions/${accepted._id}/accept`, {
      method: 'POST',
      body: { approved: true },
    });
    check(
      (await CalendarEvent.countDocuments({ userId: userIds[0] })) === count,
      'Acceptance retry is idempotent',
    );
    const range = `start=${current.toISOString()}&end=${new Date(+current + 7 * 86400000).toISOString()}`;
    check(
      (await request(`/schedule/events?${range}`, { user: 1 })).events.length === 0,
      '7: Users do not share calendar events',
    );
    const event = await CalendarEvent.findOne({ userId: userIds[0] });
    check(
      (
        await request(`/schedule/events/${event._id}`, {
          user: 1,
          method: 'PATCH',
          body: { status: 'cancelled' },
        })
      ).status === 404,
      'Other user cannot cancel events',
    );
    const goalResult = await request('/schedule/events', {
      method: 'POST',
      body: {
        title: 'Invalid goal',
        type: 'meeting',
        startTime: `${tomorrow}T06:00:00Z`,
        endTime: `${tomorrow}T07:00:00Z`,
        relatedGoalId: String(new mongoose.Types.ObjectId()),
      },
    });
    check(
      goalResult.status === 400,
      'Goal references rejected while no goal ownership source exists',
    );
    const data = await collectBriefingData(
      userIds[0],
      briefingClock(event.startTime, profile.timezone),
    );
    check(
      data.scheduledBlocks.some((b) => String(b._id) === String(event._id)),
      '9: Daily briefing contains scheduled blocks',
    );
    const answer = await answerSchedulingQuestion({
      userId: userIds[0],
      message: 'What is my schedule this week?',
    });
    check(
      answer.answer.includes('Schedule assignment') && answer.actions[0].type === 'open_schedule',
      'Ask LifeAdmin returns scheduled tasks and calendar action',
    );
    const aiTask = await Task.create({
      userId: userIds[0],
      title: 'Estimate me',
      status: 'pending',
    });
    const aiPlan = await suggestSchedule(
      userIds[0],
      { taskIds: [String(aiTask._id)] },
      {
        generate: async ({ systemPrompt }) => ({
          text: systemPrompt.startsWith('Estimate')
            ? '{"minutes":[90]}'
            : 'Review these blocks before accepting.',
        }),
      },
    );
    check(
      aiPlan.estimates[0].source === 'ai' && aiPlan.estimates[0].minutes === 90,
      'AI estimate is bounded and remains an editable suggestion',
    );
    const invalidAi = await suggestSchedule(
      userIds[0],
      { taskIds: [String(aiTask._id)] },
      { generate: async () => ({ text: '{"minutes":[999999]}' }) },
    );
    check(
      invalidAi.estimates[0].source === 'default',
      'Invalid AI estimates use deterministic fallback',
    );
    await ScheduleProposal.updateOne({ _id: aiPlan._id }, { $set: { expiresAt: new Date(0) } });
    check(
      (
        await request(`/schedule/suggestions/${aiPlan._id}/accept`, {
          method: 'POST',
          body: { approved: true },
        })
      ).status === 409,
      'Expired preview is rejected',
    );
    const outside = invalidAi.blocks.map((b) => ({
      ...b.toObject(),
      startTime: `${tomorrow}T00:00:00Z`,
      endTime: `${tomorrow}T01:00:00Z`,
    }));
    check(
      (
        await request(`/schedule/suggestions/${invalidAi._id}/accept`, {
          method: 'POST',
          body: { approved: true, blocks: outside },
        })
      ).status === 409,
      'Edits outside availability are rejected',
    );
    await request(`/tasks/${id}`, { method: 'PATCH', body: { status: 'completed' } });
    check(
      (await CalendarEvent.countDocuments({
        userId: userIds[0],
        relatedTaskId: id,
        status: 'planned',
      })) === 0,
      'Task completion releases planned blocks',
    );
    await request(`/tasks/${id}`, { method: 'DELETE' });
    check(
      (await CalendarEvent.countDocuments({ userId: userIds[0], relatedTaskId: id })) === 0,
      'Task deletion removes related calendar records',
    );
    console.log(`${checks} scheduling checks passed.`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      for (const Model of [
        CalendarEvent,
        AvailabilityProfile,
        ScheduleProposal,
        Task,
        DailyBriefing,
      ])
        await Model.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
    }
  }
}
