import api from './api';

const statusLabels = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const statusValues = Object.fromEntries(Object.entries(statusLabels).map(([value, label]) => [label, value]));

export function mapTask(task) {
  const date = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
  return {
    ...task,
    id: task._id,
    documentId: task.documentId || null,
    source: task.documentId || null,
    sourceType: task.source,
    category: task.source === 'ai_confirmed' ? 'AI Confirmed' : 'Personal',
    priority: task.priority?.toUpperCase() || 'MEDIUM',
    calculatedPriority: task.calculatedPriority?.toUpperCase() || task.priority?.toUpperCase() || 'LOW',
    priorityOverride: task.priorityOverride?.toUpperCase() || '',
    priorityScore: Number(task.priorityScore) || 0,
    priorityReasons: Array.isArray(task.priorityReasons) ? task.priorityReasons : [],
    status: statusLabels[task.status] || 'Pending',
    date,
    due: date || 'No due date',
  };
}

function toApiTask(values) {
  const payload = {};
  if (Object.hasOwn(values, 'title')) payload.title = values.title;
  if (Object.hasOwn(values, 'description')) payload.description = values.description;
  if (Object.hasOwn(values, 'priority')) payload.priority = values.priority.toLowerCase();
  if (Object.hasOwn(values, 'priorityOverride')) payload.priorityOverride = values.priorityOverride ? values.priorityOverride.toLowerCase() : null;
  if (Object.hasOwn(values, 'status')) payload.status = statusValues[values.status] || values.status;
  if (Object.hasOwn(values, 'dueDate') || Object.hasOwn(values, 'date')) payload.dueDate = values.dueDate ?? values.date ?? null;
  return payload;
}

export const taskService = {
  async getAll(filters = {}) {
    const { data } = await api.get('/tasks', { params: filters });
    return data.tasks.map(mapTask);
  },
  async create(values) {
    const { data } = await api.post('/tasks', toApiTask(values));
    return mapTask(data.task);
  },
  async update(id, values) {
    const { data } = await api.patch(`/tasks/${id}`, toApiTask(values));
    return mapTask(data.task);
  },
  async remove(id) {
    const { data } = await api.delete(`/tasks/${id}`);
    return data;
  },
  async createFromDocument(documentId, actionIndexes) {
    const { data } = await api.post(`/documents/${documentId}/create-tasks`, actionIndexes === undefined ? {} : { actionIndexes });
    return { ...data, tasks: data.tasks.map(mapTask) };
  },
};
