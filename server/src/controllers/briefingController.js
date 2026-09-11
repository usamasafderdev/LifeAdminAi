import {
  getDailyBriefing,
  getBriefingSettings,
  updateBriefingSettings,
} from '../services/dailyBriefingService.js';

export async function getBriefing(req, res, next) {
  try {
    return res.json({
      success: true,
      ...(await getDailyBriefing(req.user._id, { timeZone: req.query.timeZone || 'UTC' })),
    });
  } catch (error) {
    return next(error);
  }
}
export async function refreshBriefing(req, res, next) {
  try {
    if (Object.keys(req.body || {}).some((key) => key !== 'timeZone'))
      return res.status(400).json({ success: false, message: 'Only timeZone may be provided.' });
    return res.json({
      success: true,
      ...(await getDailyBriefing(req.user._id, {
        timeZone: req.body?.timeZone || 'UTC',
        refresh: true,
      })),
    });
  } catch (error) {
    return next(error);
  }
}
export async function readBriefingSettings(req, res, next) {
  try {
    const { enabled, hidden } = await getBriefingSettings(req.user._id);
    return res.json({ success: true, settings: { enabled, hidden } });
  } catch (error) {
    return next(error);
  }
}
export async function patchBriefingSettings(req, res, next) {
  try {
    return res.json({
      success: true,
      settings: await updateBriefingSettings(req.user._id, req.body),
    });
  } catch (error) {
    return next(error);
  }
}
