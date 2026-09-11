import {
  calendarService,
  calendarRange,
  createCalendarEvent,
  changeCalendarEvent,
  getProposal,
} from '../services/calendarService.js';
import { suggestSchedule, acceptSchedule, cancelSchedule } from '../services/schedulingService.js';

const endpoint = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, ...(await fn(req)) });
  } catch (error) {
    next(error);
  }
};
export const getAvailability = endpoint(async (req) => ({
  profile: await calendarService.availability(req.user._id),
}));
export const saveAvailability = endpoint(async (req) => ({
  profile: await calendarService.saveAvailability(req.user._id, req.body),
}));
export const listEvents = endpoint(async (req) => {
  const { start, end } = calendarRange(req.query.start, req.query.end);
  return { events: await calendarService.list(req.user._id, start, end) };
});
export const createEvent = endpoint(async (req) => ({
  event: await createCalendarEvent(req.user._id, req.body),
}));
export const changeEvent = endpoint(async (req) => ({
  event: await changeCalendarEvent(req.user._id, req.params.id, req.body),
}));
export const suggest = endpoint(async (req) => ({
  proposal: await suggestSchedule(req.user._id, req.body),
}));
export const proposal = endpoint(async (req) => ({
  proposal: await getProposal(req.user._id, req.params.id),
}));
export const accept = endpoint(async (req) => ({
  events: await acceptSchedule(req.user._id, req.params.id, req.body),
}));
export const cancel = endpoint(async (req) => ({
  proposal: await cancelSchedule(req.user._id, req.params.id),
}));
