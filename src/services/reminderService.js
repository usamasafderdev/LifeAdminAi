import api from './api';

export function mapReminder(reminder) {
  const linkedTask = reminder.linkedTask || (reminder.taskId && typeof reminder.taskId === 'object' ? reminder.taskId : null);
  const linkedDocument = reminder.linkedDocument || (reminder.documentId && typeof reminder.documentId === 'object' ? reminder.documentId : null);
  return {
    ...reminder,
    id: reminder._id,
    taskId: linkedTask?._id || reminder.taskId || null,
    documentId: linkedDocument?._id || reminder.documentId || null,
    linkedTask,
    linkedDocument,
    when: reminder.remindAt,
    detail: reminder.description || (linkedTask ? `Task: ${linkedTask.title}` : 'Standalone reminder'),
  };
}

export const reminderService = {
  async getAll(filters = {}) { const { data } = await api.get('/reminders', { params: filters }); return data.reminders.map(mapReminder); },
  async get(id) { const { data } = await api.get(`/reminders/${id}`); return mapReminder(data.reminder); },
  async create(values) { const { data } = await api.post('/reminders', values); return mapReminder(data.reminder); },
  async update(id, values) { const { data } = await api.patch(`/reminders/${id}`, values); return mapReminder(data.reminder); },
  async remove(id) { const { data } = await api.delete(`/reminders/${id}`); return data; },
};
