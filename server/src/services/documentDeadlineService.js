const DEADLINE_CONTEXT = /\b(deadline|due|submit|submission|pay|payment|attend|meeting|appointment|interview|renew|renewal|expire|expiry|application)\b/i;
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'before', 'after', 'date', 'deadline', 'due']);

function words(value) {
  const aliases = { payment: 'pay', paid: 'pay', submission: 'submit', submitted: 'submit', registration: 'register', renewal: 'renew' };
  return new Set(String(value || '').toLowerCase().match(/[a-z]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)).map((word) => aliases[word] || word) || []);
}

export function prioritizeKeyInformation(analysis, limit = 12) {
  const actionText = (analysis.extractedActions || []).map((action) => `${action.title} ${action.description}`.toLowerCase());
  const seen = new Set();
  const keyInformation = (analysis.keyInformation || []).filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key) || actionText.some((text) => key.length > 20 && text.includes(key))) return false;
    seen.add(key); return true;
  }).slice(0, limit);
  return { ...analysis, keyInformation };
}

export function refineAnalysisQuality(analysis) {
  return prioritizeKeyInformation(associateActionDueDates(analysis));
}

function relevance(action, importantDate) {
  const actionWords = words(`${action.title} ${action.description}`);
  return [...words(importantDate.description)].filter((word) => actionWords.has(word)).length;
}

export function associateActionDueDates(analysis) {
  if (!analysis?.actionRequired || !analysis.extractedActions?.length || !analysis.importantDates?.length) return analysis;
  const dates = analysis.importantDates.filter((item) => item?.date && DEADLINE_CONTEXT.test(item.description));
  if (!dates.length) return analysis;
  const singleOverallDeadline = dates.length === 1 ? dates[0] : null;
  return {
    ...analysis,
    extractedActions: analysis.extractedActions.map((action) => {
      if (action.dueDate) return action;
      if (singleOverallDeadline) return { ...action, dueDate: singleOverallDeadline.date };
      const ranked = dates.map((item) => ({ item, score: relevance(action, item) })).sort((a, b) => b.score - a.score);
      return ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score || 0) ? { ...action, dueDate: ranked[0].item.date } : action;
    }),
  };
}
