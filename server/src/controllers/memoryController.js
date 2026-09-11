import mongoose from 'mongoose';
import Memory from '../models/Memory.js';
import User from '../models/User.js';
import {
  acceptMemory,
  memoryFingerprint,
  memorySettings,
  publicMemory,
} from '../services/memoryService.js';
import { memoryTerms, validateMemory } from '../services/memoryExtractionService.js';

const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const publicSettings = ({ enabled, autoSavePreferences }) => ({ enabled, autoSavePreferences });
export async function listMemories(req, res, next) {
  try {
    const settings = await memorySettings(req.user._id);
    const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
    const scope = { userId: req.user._id, generation: settings.generation };
    const filter = {
      ...scope,
      ...(search
        ? { content: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        : {}),
    };
    const [rows, total, count, preferences] = await Promise.all([
      Memory.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * 25)
        .limit(25)
        .lean(),
      Memory.countDocuments(filter),
      Memory.countDocuments(scope),
      Memory.countDocuments({ ...scope, type: 'preference' }),
    ]);
    return res.json({
      success: true,
      memories: rows.map(publicMemory),
      total,
      count,
      preferences,
      page,
      settings: publicSettings(settings),
    });
  } catch (error) {
    return next(error);
  }
}
export async function updateMemorySettings(req, res, next) {
  try {
    const body = req.body || {};
    if (
      !Object.keys(body).length ||
      Object.keys(body).some(
        (key) =>
          !['enabled', 'autoSavePreferences'].includes(key) || typeof body[key] !== 'boolean',
      )
    )
      throw invalid('Provide boolean memory settings only.');
    const set = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [`memorySettings.${key}`, value]),
    );
    await User.updateOne(
      { _id: req.user._id },
      { $set: set, $inc: { 'memorySettings.consentVersion': 1 } },
    );
    return res.json({
      success: true,
      settings: publicSettings(await memorySettings(req.user._id)),
    });
  } catch (error) {
    return next(error);
  }
}
export async function confirmMemory(req, res, next) {
  try {
    if (typeof req.body?.token !== 'string' || req.body.token.length > 5000)
      throw invalid('A valid memory suggestion is required.');
    const memory = await acceptMemory(req.user._id, req.body.token);
    return res.status(201).json({ success: true, memory: publicMemory(memory) });
  } catch (error) {
    return next(error);
  }
}
export async function editMemory(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw invalid('Invalid memory ID.');
    if (!req.body || Object.keys(req.body).some((key) => !['content', 'type'].includes(key)))
      throw invalid('Only memory content and type can be edited.');
    const settings = await memorySettings(req.user._id);
    const scope = { _id: req.params.id, userId: req.user._id, generation: settings.generation };
    const row = await Memory.findOne(scope);
    if (!row) throw invalid('Memory not found', 404);
    const valid = validateMemory({
      type: req.body.type ?? row.type,
      content: req.body.content ?? row.content,
      confidence: 1,
    });
    if (!valid)
      throw invalid(
        'Use a non-sensitive first-person preference, personal fact, project, or decision (5–400 characters).',
      );
    await User.updateOne({ _id: req.user._id }, { $inc: { 'memorySettings.consentVersion': 1 } });
    const memory = await Memory.findOneAndUpdate(
      scope,
      {
        $set: {
          ...valid,
          fingerprint: memoryFingerprint(valid.content),
          terms: memoryTerms(valid.content),
          source: 'user_edit',
          contentUpdatedAt: new Date(),
          lastUsedAt: null,
          useCount: 0,
        },
      },
      { new: true, runValidators: true },
    );
    if (!memory) throw invalid('Memory not found', 404);
    return res.json({ success: true, memory: publicMemory(memory) });
  } catch (error) {
    return next(error.code === 11000 ? invalid('This memory is already saved.', 409) : error);
  }
}
export async function deleteMemory(req, res, next) {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) throw invalid('Invalid memory ID.');
    const settings = await memorySettings(req.user._id);
    const scope = { _id: req.params.id, userId: req.user._id, generation: settings.generation };
    if (!(await Memory.exists(scope))) throw invalid('Memory not found', 404);
    await User.updateOne({ _id: req.user._id }, { $inc: { 'memorySettings.consentVersion': 1 } });
    await Memory.deleteOne(scope);
    return res.json({ success: true, message: 'Memory forgotten.' });
  } catch (error) {
    return next(error);
  }
}
export async function deleteAllMemories(req, res, next) {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $inc: { 'memorySettings.generation': 1, 'memorySettings.consentVersion': 1 } },
      { new: true },
    );
    // A new generation immediately excludes all old memories and pending suggestions.
    await Memory.deleteMany({
      userId: req.user._id,
      generation: { $lt: user.memorySettings.generation },
    });
    return res.json({ success: true, message: 'All saved memories deleted.' });
  } catch (error) {
    return next(error);
  }
}
