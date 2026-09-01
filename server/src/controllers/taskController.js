import mongoose from 'mongoose';
import Task, { TASK_PRIORITIES, TASK_STATUSES } from '../models/Task.js';
import { applyTaskPriority } from '../services/taskPriorityService.js';
import { validateTaskInput } from '../services/taskValidator.js';

const EDITABLE_FIELDS = ['title', 'description', 'status', 'priority', 'priorityOverride', 'dueDate'];
const FORBIDDEN_FIELDS = ['userId', 'documentId', 'source', 'confirmedPriority', 'calculatedPriority', 'priorityScore', 'priorityReasons', 'priorityCalculatedAt', '_id', 'createdAt', 'updatedAt'];
const invalid = (message) => ({ success: false, message });
const validId = (id) => mongoose.isObjectIdOrHexString(id);

function readBody(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function readOverride(body, fallback = null) {
  const supplied = Object.hasOwn(body, 'priorityOverride') ? body.priorityOverride : Object.hasOwn(body, 'priority') ? body.priority : fallback;
  if (supplied === null || supplied === '') return null;
  if (typeof supplied !== 'string' || !TASK_PRIORITIES.includes(supplied.toLowerCase())) {
    const error = new Error('Invalid priority override');
    error.statusCode = 400;
    error.code = 'INVALID_TASK_DATA';
    throw error;
  }
  return supplied.toLowerCase();
}

function automaticResponse(task, now = new Date()) {
  const plain = typeof task.toObject === 'function' ? task.toObject() : task;
  if (!plain.priorityCalculatedAt && !plain.priorityOverride && TASK_PRIORITIES.includes(plain.priority)) plain.priorityOverride = plain.priority;
  return applyTaskPriority(plain, { now });
}

export async function createTask(req, res, next) {
  try {
    const body = readBody(req.body);
    if (FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) return res.status(400).json(invalid('Calculated priority and task ownership fields are backend-controlled'));
    const validationBody = { ...body };
    delete validationBody.priorityOverride;
    const values = validateTaskInput(validationBody);
    const priorityOverride = readOverride(body, null);
    delete values.priority;
    const prepared = applyTaskPriority({ ...values, priorityOverride, confirmedPriority: null, userId: req.user._id, source: 'manual' });
    const task = await Task.create(prepared);
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
    if (req.query.priority && !TASK_PRIORITIES.includes(req.query.priority)) return res.status(400).json(invalid('Invalid task priority filter'));
    const now = new Date();
    let tasks = (await Task.find(filter).sort({ createdAt: -1 })).map((task) => automaticResponse(task, now));
    if (req.query.priority) tasks = tasks.filter((task) => task.priority === req.query.priority);
    return res.status(200).json({ success: true, tasks, count: tasks.length });
  } catch (error) { return next(error); }
}

export async function getTask(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid task ID'));
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json(invalid('Task not found'));
    return res.status(200).json({ success: true, task: automaticResponse(task) });
  } catch (error) { return next(error); }
}

export async function updateTask(req, res, next) {
  try {
    if (!validId(req.params.id)) return res.status(400).json(invalid('Invalid task ID'));
    const body = readBody(req.body);
    if (FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field))) return res.status(400).json(invalid('Calculated priority and task ownership fields are backend-controlled'));
    if (!EDITABLE_FIELDS.some((field) => Object.hasOwn(body, field))) return res.status(400).json(invalid('No editable task fields provided'));
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json(invalid('Task not found'));
    const validationBody = { ...body };
    delete validationBody.priorityOverride;
    const values = validateTaskInput(validationBody, { partial: true });
    const legacyOverride = !task.priorityCalculatedAt && !task.priorityOverride ? task.priority : task.priorityOverride;
    const priorityOverride = readOverride(body, legacyOverride);
    delete values.priority;
    const prepared = applyTaskPriority({ ...task.toObject(), ...values, priorityOverride });
    for (const field of ['title', 'description', 'status', 'dueDate', 'priority', 'calculatedPriority', 'priorityScore', 'priorityReasons', 'priorityOverride', 'priorityCalculatedAt']) {
      if (Object.hasOwn(prepared, field)) task[field] = prepared[field];
    }
    await task.save();
    return res.status(200).json({ success: true, message: priorityOverride ? 'Task updated successfully' : 'Task updated using automatic priority', task });
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
