import mongoose from 'mongoose';
import CalendarEvent from '../models/CalendarEvent.js';
import AvailabilityProfile from '../models/AvailabilityProfile.js';
import ScheduleProposal from '../models/ScheduleProposal.js';
import Task from '../models/Task.js';
import DailyBriefing from '../models/DailyBriefing.js';
import {
  availabilityWindows,
  overlaps,
  schedulingError,
  validateAvailability,
} from './schedulingTimeService.js';

export function validId(id) {
  if (!mongoose.isObjectIdOrHexString(id)) throw schedulingError('Invalid resource ID.');
  return id;
}
export function calendarRange(start, end) {
  for (const value of [start, end]) {
    if (value instanceof Date) continue;
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    )
      throw schedulingError('Dates must include a valid time and UTC offset.');
    const day = value.slice(0, 10),
      parsed = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== day)
      throw schedulingError('Invalid calendar date.');
  }
  const a = new Date(start),
    b = new Date(end);
  if (
    !start ||
    !end ||
    !Number.isFinite(+a) ||
    !Number.isFinite(+b) ||
    b <= a ||
    b - a > 32 * 86400000
  )
    throw schedulingError('Choose a valid calendar range of at most 32 days.');
  return { start: a, end: b };
}
// Local provider boundary. Future providers should normalize their busy intervals here.
export const calendarService = {
  async list(userId, start, end, session = null) {
    const range = calendarRange(start, end);
    const query = CalendarEvent.find({
      userId,
      status: { $ne: 'cancelled' },
      startTime: { $lt: range.end },
      endTime: { $gt: range.start },
    })
      .sort({ startTime: 1 })
      .limit(1001);
    if (session) query.session(session);
    const rows = await query.lean();
    if (rows.length > 1000)
      throw schedulingError('Too many calendar events. Choose a shorter range.');
    return rows;
  },
  async availability(userId) {
    return AvailabilityProfile.findOne({ userId }).lean();
  },
  async saveAvailability(userId, body) {
    const values = validateAvailability(body);
    return AvailabilityProfile.findOneAndUpdate(
      { userId },
      { $set: values, $inc: { revision: 1 } },
      { new: true, upsert: true, runValidators: true },
    );
  },
};

export async function validateRelations(userId, blocks, session = null) {
  if (blocks.some((b) => b.relatedGoalId))
    throw schedulingError('Goals are not available in this workspace yet. Use an existing task.');
  const ids = [
    ...new Set(blocks.filter((b) => b.relatedTaskId).map((b) => String(validId(b.relatedTaskId)))),
  ];
  const query = Task.find({
    userId,
    _id: { $in: ids },
    status: { $in: ['pending', 'in_progress'] },
  }).lean();
  if (session) query.session(session);
  const tasks = await query;
  if (tasks.length !== ids.length)
    throw schedulingError('A related task is unavailable. Refresh your schedule.', 409);
  return tasks;
}
export function cleanBlock(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200)
    throw schedulingError('Event title is required (up to 200 characters).');
  const { start, end } = calendarRange(input.startTime, input.endTime);
  if (
    end - start > 12 * 3600000 ||
    start.getSeconds() ||
    start.getMilliseconds() ||
    end.getSeconds() ||
    end.getMilliseconds()
  )
    throw schedulingError('Use whole-minute blocks of at most 12 hours.');
  if (!['task_block', 'reminder', 'meeting', 'personal'].includes(input.type || 'task_block'))
    throw schedulingError('Invalid event type.');
  if (
    input.description != null &&
    (typeof input.description !== 'string' || input.description.length > 2000)
  )
    throw schedulingError('Invalid description.');
  if ((input.type || 'task_block') === 'task_block' && !input.relatedTaskId)
    throw schedulingError('Task blocks must reference a task.');
  return {
    title: input.title.trim(),
    description: input.description || '',
    type: input.type || 'task_block',
    startTime: start,
    endTime: end,
    relatedTaskId: input.relatedTaskId || null,
    relatedGoalId: input.relatedGoalId || null,
    status: 'planned',
  };
}
export function assertFree(
  blocks,
  busy,
  profile,
  { withinAvailability = true, now = new Date() } = {},
) {
  for (const [index, block] of blocks.entries()) {
    if (new Date(block.startTime) < now)
      throw schedulingError('A suggested time has passed. Generate a new schedule.', 409);
    if ([...busy, ...blocks.slice(0, index)].some((other) => overlaps(block, other)))
      throw schedulingError('Calendar conflict. Modify the times or generate a new schedule.', 409);
    if (
      withinAvailability &&
      !availabilityWindows(profile, new Date(block.startTime), new Date(block.endTime)).some(
        (w) => w.startTime <= new Date(block.startTime) && w.endTime >= new Date(block.endTime),
      )
    )
      throw schedulingError('A block falls outside your current availability.', 409);
  }
}
function transactionUnavailable(error) {
  return (
    error?.code === 20 ||
    /Transaction numbers are only allowed/.test(error?.message || '') ||
    /replica set/i.test(error?.message || '') ||
    /atlas/i.test(error?.message || '')
  );
}

// Calendar writes prefer a MongoDB transaction when the deployment supports one.
// On a non-replica-set database, the same code path should transparently fall back
// to a single-write execution without surfacing the replica-set error message.
export async function calendarWrite(userId, operation) {
  try {
    console.log('[calendarWrite] transaction mode: attempting MongoDB transaction path');
    return await mongoose.connection.transaction(async (session) => {
      const profile = await AvailabilityProfile.findOneAndUpdate(
        { userId },
        { $inc: { revision: 1 } },
        { new: true, session },
      );
      if (!profile) throw schedulingError('Save your availability and timezone first.');
      const result = await operation(session, profile);
      await DailyBriefing.deleteMany({ userId }).session(session);
      return result;
    });
  } catch (error) {
    if (!transactionUnavailable(error)) throw error;

    console.log(
      '[calendarWrite] fallback mode: transaction unavailable; running non-transaction safe path',
    );
    try {
      const profile = await AvailabilityProfile.findOneAndUpdate(
        { userId },
        { $inc: { revision: 1 } },
        { new: true },
      );
      if (!profile) throw schedulingError('Save your availability and timezone first.');

      const result = await operation(null, profile);
      await DailyBriefing.deleteMany({ userId });
      return result;
    } catch (fallbackError) {
      throw fallbackError;
    }
  }
}
export async function createCalendarEvent(userId, body) {
  const block = cleanBlock(body);
  if (block.type === 'task_block')
    throw schedulingError('Create task blocks by accepting a schedule preview.');
  return calendarWrite(userId, async (session, profile) => {
    await validateRelations(userId, [block], session);
    const busy = await calendarService.list(userId, block.startTime, block.endTime, session);
    assertFree([block], busy, profile, { withinAvailability: block.type === 'task_block' });
    const options = session ? { session } : undefined;
    return (await CalendarEvent.create([{ ...block, userId }], options))[0];
  });
}
export async function changeCalendarEvent(userId, id, body) {
  validId(id);
  if (
    !body ||
    !['completed', 'cancelled'].includes(body.status) ||
    Object.keys(body).some((k) => k !== 'status')
  )
    throw schedulingError(
      'Choose completed or cancelled. To reschedule, cancel and generate a new preview.',
    );
  return calendarWrite(userId, async (session, profile) => {
    const query = CalendarEvent.findOneAndUpdate(
      { _id: id, userId, status: 'planned' },
      { $set: { status: body.status } },
      { new: true },
    );
    if (session) query.session(session);
    const event = await query;
    if (!event) throw schedulingError('Planned event not found.', 404);
    return event;
  });
}
export async function getProposal(userId, id) {
  const proposal = await ScheduleProposal.findOne({ _id: validId(id), userId }).lean();
  if (!proposal) throw schedulingError('Schedule preview not found.', 404);
  return proposal;
}
