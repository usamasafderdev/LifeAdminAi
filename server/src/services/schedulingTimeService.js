export const schedulingError = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
export function validTimezone(zone) {
  try {
    if (typeof zone !== 'string' || !zone.trim() || zone.length > 100) throw new Error();
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    throw schedulingError('Choose a valid IANA timezone before scheduling.');
  }
}
export function zonedParts(value, timezone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
}
export function localDate(value, timezone) {
  const p = zonedParts(value, timezone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function addDays(date, count) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
}
// Resolve wall times using zone offsets on both sides of a possible DST transition.
// Nonexistent times are skipped; ambiguous times use the earliest occurrence.
export function wallTime(date, time, timezone) {
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) throw schedulingError('Invalid local date or time.');
  const candidates = new Set();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = target + delta;
    const p = zonedParts(sample, timezone);
    const offset = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - sample;
    const candidate = target - offset;
    const c = zonedParts(candidate, timezone);
    if (`${c.year}-${c.month}-${c.day}T${c.hour}:${c.minute}` === `${date}T${time}`)
      candidates.add(candidate);
  }
  return candidates.size ? new Date(Math.min(...candidates)) : null;
}
export function validateAvailability(body) {
  const timezone = validTimezone(body?.timezone);
  const { workingDays, availableTimeRanges } = body;
  if (
    !Array.isArray(workingDays) ||
    workingDays.length > 7 ||
    workingDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw schedulingError('Working days must be weekday numbers 0–6.');
  if (!Array.isArray(availableTimeRanges) || availableTimeRanges.length > 8)
    throw schedulingError('Provide up to eight available time ranges.');
  const ranges = availableTimeRanges
    .map((r) => {
      if (
        !r ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end) ||
        r.start >= r.end
      )
        throw schedulingError('Availability ranges must have valid same-day start and end times.');
      return { start: r.start, end: r.end };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  if (ranges.some((r, i) => i && r.start < ranges[i - 1].end))
    throw schedulingError('Availability ranges must not overlap.');
  return { timezone, workingDays: [...new Set(workingDays)], availableTimeRanges: ranges };
}
export function availabilityWindows(profile, start, end) {
  const windows = [];
  for (
    let day = localDate(start, profile.timezone), i = 0;
    i < 32 && day <= localDate(end, profile.timezone);
    day = addDays(day, 1), i++
  ) {
    if (!profile.workingDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
    for (const range of profile.availableTimeRanges) {
      const a = wallTime(day, range.start, profile.timezone),
        b = wallTime(day, range.end, profile.timezone);
      if (a && b && b > a && b > start && a < end)
        windows.push({
          startTime: new Date(Math.max(+a, +start)),
          endTime: new Date(Math.min(+b, +end)),
        });
    }
  }
  return windows;
}
export const overlaps = (a, b) =>
  new Date(a.startTime) < new Date(b.endTime) && new Date(b.startTime) < new Date(a.endTime);
