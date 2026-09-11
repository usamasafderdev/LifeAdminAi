import mongoose from 'mongoose';
import Reminder, { REMINDER_STATUSES } from '../models/Reminder.js';
import { reminderResponse, validateReminderInput } from '../services/reminderService.js';

const invalid = (message) => ({ success: false, message });
const validId = (id) => mongoose.isObjectIdOrHexString(id);
const populate = (query) => query.populate('taskId', 'title status dueDate documentId').populate('documentId', 'title category sourceType');

export async function createReminder(req, res, next) {
  try {
    const values = await validateReminderInput(req.body, req.user._id);
    let reminder = await Reminder.create({ ...values, userId: req.user._id });
    reminder = await populate(Reminder.findById(reminder._id));
    return res.status(201).json({ success: true, message: 'Reminder created successfully', reminder: reminderResponse(reminder) });
  } catch (error) { return next(error); }
}

export async function listReminders(req, res, next) {
  try {
    const filter = { userId: req.user._id };
    if (req.query.status) {
      if (!REMINDER_STATUSES.includes(req.query.status)) return res.status(400).json(invalid('Invalid reminder status filter'));
      filter.status = req.query.status;
    }
    if (req.query.taskId) {
      if (!validId(req.query.taskId)) return res.status(400).json(invalid('Invalid task ID'));
      filter.taskId = req.query.taskId;
    }
    const reminders = await populate(Reminder.find(filter).sort({ remindAt: 1 }));
    return res.json({ success: true, count: reminders.length, reminders: reminders.map((item) => reminderResponse(item)) });
  } catch (error) { return next(error); }
}

export async function getReminder(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid reminder ID'));
    const reminder = await populate(Reminder.findOne({ _id: req.params.id, userId: req.user._id }));
    if (!reminder) return res.status(404).json(invalid('Reminder not found'));
    return res.json({ success: true, reminder: reminderResponse(reminder) });
  } catch (error) { return next(error); }
}

export async function updateReminder(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid reminder ID'));
    const reminder = await Reminder.findOne({ _id: req.params.id, userId: req.user._id });
    if (!reminder) return res.status(404).json(invalid('Reminder not found'));
    const values = await validateReminderInput(req.body, req.user._id, { partial: true, current: reminder });
    Object.assign(reminder, values);
    await reminder.save();
    const populated = await populate(Reminder.findById(reminder._id));
    return res.json({ success: true, message: 'Reminder updated successfully', reminder: reminderResponse(populated) });
  } catch (error) { return next(error); }
}

export async function deleteReminder(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid reminder ID'));
    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!reminder) return res.status(404).json(invalid('Reminder not found'));
    return res.json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) { return next(error); }
}
