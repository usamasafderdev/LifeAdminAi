import { getCalendarEvents, getDashboardData } from '../services/integrationService.js';

const invalid = (message) => ({ success: false, message });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;

function parseRange(query) {
  if (typeof query.start !== 'string' || typeof query.end !== 'string' || !ISO_DATE.test(query.start) || !ISO_DATE.test(query.end)) return null;
  const start = new Date(query.start);
  const end = new Date(query.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return null;
  return { start, end };
}

export async function dashboard(req, res, next) {
  try {
    const today = req.query.today;
    if (today !== undefined && (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00.000Z`)))) return res.status(400).json(invalid('today must be a valid YYYY-MM-DD date'));
    const timezoneOffset = req.query.timezoneOffset === undefined ? 0 : Number(req.query.timezoneOffset);
    if (!Number.isInteger(timezoneOffset) || timezoneOffset < -840 || timezoneOffset > 840) return res.status(400).json(invalid('timezoneOffset must be a valid minute offset'));
    return res.json({ success: true, ...(await getDashboardData(req.user._id, { ...(today ? { today } : {}), timezoneOffset })) });
  } catch (error) { return next(error); }
}

export async function calendar(req, res, next) {
  try {
    const range = parseRange(req.query);
    if (!range) return res.status(400).json(invalid('Valid start and end dates are required'));
    const events = await getCalendarEvents(req.user._id, range);
    return res.json({ success: true, count: events.length, events });
  } catch (error) { return next(error); }
}

export { parseRange };
