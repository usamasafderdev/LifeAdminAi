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
