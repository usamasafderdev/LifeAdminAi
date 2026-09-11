import { generateMultiDocumentAnalysis } from '../services/multiDocumentAnalysisService.js';

function invalid(message) {
  return { success: false, message };
}

export async function analyzeTogether(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.documentIds) ? req.body.documentIds : [];
    if (!ids.length) return res.status(400).json(invalid('Select at least two documents.'));
    const result = await generateMultiDocumentAnalysis({ userId: req.user._id, documentIds: ids });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}
