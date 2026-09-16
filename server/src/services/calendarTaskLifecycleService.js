import Reminder from '../models/Reminder.js';
import CalendarEvent from '../models/CalendarEvent.js';
import ScheduleProposal from '../models/ScheduleProposal.js';
import DailyBriefing from '../models/DailyBriefing.js';

export async function clearTaskSchedule(userId, taskIds, { deleted = false, session = null } = {}) {
  const filter = { userId, relatedTaskId: { $in: taskIds } };
  if (deleted) await CalendarEvent.deleteMany(filter).session(session);
  else
    await CalendarEvent.updateMany(
      { ...filter, status: 'planned' },
      { $set: { status: 'cancelled' } },
    ).session(session);
  await ScheduleProposal.deleteMany({ userId, 'blocks.relatedTaskId': { $in: taskIds } }).session(
    session,
  );
  await DailyBriefing.deleteMany({ userId }).session(session);
}

// Task.status is canonical. Calendar blocks reflect the task, including reopening.
export async function syncTaskSchedule(userId, task, { session = null } = {}) {
  const scope = { userId, relatedTaskId: task._id };
  const completed = task.status === 'completed';
  const cancelled = task.status === 'cancelled';
  await CalendarEvent.updateMany(
    { ...scope, status: completed || cancelled ? { $in: ['planned', 'completed'] } : 'completed' },
    { $set: { status: completed ? 'completed' : cancelled ? 'cancelled' : 'planned' } },
  ).session(session);
  if (completed) await Reminder.updateMany({ userId, taskId: task._id, status: 'active' }, { $set: { status: 'completed' } }).session(session);
  await ScheduleProposal.deleteMany({ userId, 'blocks.relatedTaskId': task._id }).session(session);
  await DailyBriefing.deleteMany({ userId }).session(session);
}
