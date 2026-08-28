import mongoose from 'mongoose';
import Task, { TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { validateTaskInput } from '../services/taskValidator.js';

const EDITABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];
const FORBIDDEN_FIELDS = ['userId', 'documentId', 'source', '_id', 'createdAt', 'updatedAt'];
const invalid = (message) => ({ success: false, message });
const validId = (id) => mongoose.isObjectIdOrHexString(id);

export async function createTask(req, res, next) {
  try {
    if (FORBIDDEN_FIELDS.some((field) => Object.hasOwn(req.body || {}, field))) return res.status(400).json(invalid('Task ownership and source cannot be set by the client'));
    const values = validateTaskInput(req.body);
    const task = await Task.create({ ...values, userId: req.user._id, source: 'manual' });
    return res.status(201).json({ success: true, message: 'Task created successfully', task });
  } catch (error) { return next(error); }
}

export async function listTasks(req, res, next) {
  try {
    const filter = { userId: req.user._id };
    if (req.query.status) {
      if (!TASK_STATUSES.includes(req.query.status)) return res.status(400).json(invalid('Invalid task status filter'));
      filter.status = req.query.status;
    }
    if (req.query.priority) {
      if (!TASK_PRIORITIES.includes(req.query.priority)) return res.status(400).json(invalid('Invalid task priority filter'));
      filter.priority = req.query.priority;
    }
    const tasks = await Task.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, tasks, count: tasks.length });
  } catch (error) { return next(error); }
}

export async function getTask(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid task ID'));
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json(invalid('Task not found'));
    return res.status(200).json({ success: true, task });
  } catch (error) { return next(error); }
}

export async function updateTask(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid task ID'));
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) return res.status(400).json(invalid('Task ownership and source cannot be changed'));
    if (!EDITABLE_FIELDS.some((field) => Object.hasOwn(body, field))) return res.status(400).json(invalid('No editable task fields provided'));
    const values = validateTaskInput(body, { partial: true });
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: values },
      { new: true, runValidators: true },
    );
    if (!task) return res.status(404).json(invalid('Task not found'));
    return res.status(200).json({ success: true, message: 'Task updated successfully', task });
  } catch (error) { return next(error); }
}

export async function deleteTask(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid task ID'));
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json(invalid('Task not found'));
    return res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) { return next(error); }
}
