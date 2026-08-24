export const DEMO_TODAY = '2026-08-21';
export const toDateKey = (value) => { if (!value) return ''; if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10); const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10); };
export const formatDate = (value, options = { month: 'short', day: 'numeric', year: 'numeric' }) => { const key = toDateKey(value); return key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-US', options) : 'No date'; };
export const daysUntil = (value, from = DEMO_TODAY) => { const a = toDateKey(value), b = toDateKey(from); return a && b ? Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000) : null; };
export const isToday = (value) => toDateKey(value) === DEMO_TODAY;
export const isOverdue = (value) => Boolean(toDateKey(value) && toDateKey(value) < DEMO_TODAY);
export const isThisWeek = (value) => { const days = daysUntil(value); return days !== null && days >= 0 && days <= 7; };
export const dueLabel = (value) => { const days = daysUntil(value); if (days === 0) return 'Today'; if (days === 1) return 'Tomorrow'; return formatDate(value, { month: 'short', day: 'numeric' }); };
