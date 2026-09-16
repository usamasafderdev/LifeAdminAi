import {
  clearUserChatHistory,
  deleteUserAccount,
  exportUserData,
} from '../services/privacyService.js';

export async function exportPrivacyData(req, res, next) {
  try {
    const data = await exportUserData(req.user._id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lifeadmin-data-export-${date}.json"`,
    );
    return res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    return next(error);
  }
}

export async function clearPrivacyChatHistory(req, res, next) {
  try {
    const result = await clearUserChatHistory(req.user._id);
    return res.json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
}

export async function deletePrivacyAccount(req, res, next) {
  try {
    if (req.body?.confirmation !== 'DELETE')
      return res
        .status(400)
        .json({ success: false, message: 'Type DELETE to confirm account deletion.' });
    await deleteUserAccount(req.user._id);
    return res.json({
      success: true,
      message: 'Your LifeAdmin account and associated data have been deleted.',
    });
  } catch (error) {
    return next(error);
  }
}
