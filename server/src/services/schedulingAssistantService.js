import Task from '../models/Task.js';
import { calendarService } from './calendarService.js';
import { suggestSchedule } from './schedulingService.js';
import { addDays, localDate, wallTime } from './schedulingTimeService.js';

export async function answerSchedulingQuestion({ userId, message }) {
  const planning =
    /\b(when should|find time|plan my (week|day)|schedule my|schedule .*task)\b/i.test(message);
  const reading =
    /\b(schedule|scheduled)\b.*\b(today|tomorrow|week)\b|\bwhat should I do tomorrow\b/i.test(
      message,
    );
  if (!planning && !reading) return null;
  const action = (id) => [
    {
      type: 'open_schedule',
      resourceId: id || userId,
      resourceTitle: id ? 'Review suggested schedule' : 'Your calendar',
      label: id ? 'Review suggested schedule' : 'Open Calendar',
    },
  ];
  const response = (answer, id) => ({
    answer,
    sources: [],
    actions: action(id),
    metadata: { kind: 'schedule' },
    model: '',
    providerCall: false,
  });
  const profile = await calendarService.availability(userId);
  if (!profile)
    return response(
      'Save your available days, hours, and timezone on Calendar first. Then I can suggest a realistic schedule.',
    );
  if (reading && !planning) {
    const day = addDays(localDate(new Date(), profile.timezone), /tomorrow/i.test(message) ? 1 : 0);
    const events = await calendarService.list(
      userId,
      wallTime(day, '00:00', profile.timezone),
      wallTime(addDays(day, /week/i.test(message) ? 7 : 1), '00:00', profile.timezone),
    );
    const format = (d) =>
      new Date(d).toLocaleString('en-GB', {
        timeZone: profile.timezone,
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    return response(
      events.length
        ? `Your schedule (${profile.timezone}):\n\n${events
            .slice(0, 30)
            .map((e) => `- ${format(e.startTime)} – ${format(e.endTime)}: ${e.title}`)
            .join('\n')}`
        : 'No scheduled blocks in that period. Ask me to plan your week, or generate a preview on Calendar.',
    );
  }
  let taskIds;
  if (!/plan my (week|day)/i.test(message)) {
    const words =
      message
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter(
          (w) =>
            w.length > 2 &&
            ![
              'when',
              'should',
              'complete',
              'finish',
              'assignment',
              'find',
              'time',
              'for',
              'the',
              'schedule',
              'task',
              'can',
              'you',
              'please',
            ].includes(w),
        ) || [];
    const tasks = await Task.find({ userId, status: { $in: ['pending', 'in_progress'] } })
      .limit(501)
      .select('title')
      .lean();
    const matches = tasks.filter(
      (t) =>
        words.some((w) => t.title.toLowerCase().includes(w)) ||
        (/assignment/i.test(message) && /assignment/i.test(t.title)),
    );
    if (matches.length !== 1)
      return response(
        matches.length
          ? 'Several tasks match. Open Calendar and select the tasks you want to schedule.'
          : 'I could not identify that task. Create it with a deadline, or select an existing task on Calendar.',
      );
    taskIds = [String(matches[0]._id)];
  }
  const proposal = await suggestSchedule(userId, {
    taskIds,
    days: /plan my day/i.test(message) ? 1 : 7,
    useAi: false,
  });
  const format = (d) =>
    new Date(d).toLocaleString('en-GB', {
      timeZone: profile.timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  return response(
    `${proposal.explanation}\n\n${proposal.blocks
      .slice(0, 15)
      .map((b) => `- ${format(b.startTime)} – ${format(b.endTime)}: ${b.title}`)
      .join(
        '\n',
      )}\n\n${proposal.warnings.join('\n')}\n\nOpen the preview to Accept, Edit, or Cancel.`,
    proposal._id,
  );
}
