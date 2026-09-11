export function schedulingLocal(value, timezone) {
  const parts = Object.fromEntries(
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
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function schedulingInstant(value, timezone) {
  const target = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Enter a valid local date and time.');
  const candidates = [];
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = target + delta;
    const offset = Date.parse(`${schedulingLocal(sample, timezone)}:00Z`) - sample;
    const candidate = target - offset;
    if (schedulingLocal(candidate, timezone) === value) candidates.push(candidate);
  }
  if (!candidates.length)
    throw new Error('This local time does not exist because of a daylight-saving change.');
  return new Date(Math.min(...candidates)).toISOString();
}
export function schedulingDay(date, amount) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}
