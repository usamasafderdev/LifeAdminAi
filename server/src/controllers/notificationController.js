import * as service from '../services/notificationService.js';
const endpoint = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, ...(await fn(req)) });
  } catch (error) {
    next(error);
  }
};
export const list = endpoint((req) => service.getUserNotifications(req.user._id, req.query));
export const settings = endpoint(async (req) => ({
  settings: await service.getNotificationSettings(req.user._id),
}));
export const updateSettings = endpoint(async (req) => ({
  settings: await service.updateNotificationSettings(req.user._id, req.body),
}));
export const read = endpoint(async (req) => ({
  notification: await service.markAsRead(req.user._id, req.params.id),
}));
export const readAll = endpoint(async (req) => ({
  modified: (await service.markAllAsRead(req.user._id)).modifiedCount,
}));
export const remove = endpoint(async (req) => {
  await service.deleteNotification(req.user._id, req.params.id);
  return { message: 'Notification deleted.' };
});
export const resource = endpoint(async (req) => ({
  path: await service.resolveNotificationResource(req.user._id, req.params.id),
}));
