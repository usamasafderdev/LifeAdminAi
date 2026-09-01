import { validateAiAnalysis } from './aiAnalysisValidator.js';

function uniqueStrings(items, limit = 50) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function uniqueObjects(items, keyFor, limit = 50) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function mergeDocumentAnalyses(analyses) {
  const categories = analyses.map((item) => item.category).filter(Boolean);
  const category = categories.sort((a, b) => categories.filter((item) => item === b).length - categories.filter((item) => item === a).length)[0] || '';
  const extractedActions = uniqueObjects(
    analyses.flatMap((item) => item.extractedActions || []),
    (item) => item.title?.trim().toLocaleLowerCase(),
  );
  const merged = {
    actionRequired: extractedActions.length > 0 || analyses.some((item) => item.actionRequired === true),
    summary: uniqueStrings(analyses.map((item) => item.summary).filter(Boolean), 12).join(' ').slice(0, 5000),
    category,
    importantDates: uniqueObjects(
      analyses.flatMap((item) => item.importantDates || []),
      (item) => `${item.date?.trim().toLocaleLowerCase()}|${item.description?.trim().toLocaleLowerCase()}`,
    ),
    extractedActions,
    keyInformation: uniqueStrings(analyses.flatMap((item) => item.keyInformation || [])),
    risksOrConsequences: uniqueStrings(analyses.flatMap((item) => item.risksOrConsequences || [])),
  };
  return validateAiAnalysis(merged);
}
