import api from './api';
import { mapDocument } from './documentService';
import { mapReminder } from './reminderService';
import { mapTask } from './taskService';

export const integrationService = {
  async dashboard(today) {
    const { data } = await api.get('/dashboard', { params: { ...(today ? { today } : {}), timezoneOffset: new Date().getTimezoneOffset() } });
    return { counts: data.counts, deadlineSummary: data.deadlineSummary, taskProgress: data.taskProgress, todaysFocus: data.todaysFocus.map((item) => item.type === 'reminder' ? { ...mapReminder(item), type: 'reminder' } : { ...mapTask(item), type: 'task' }), upcomingReminders: data.upcomingReminders.map(mapReminder), recentDocuments: data.recentDocuments.map(mapDocument) };
  },
  async calendar(start, end) {
    const { data } = await api.get('/calendar', { params: { start, end } });
    return data.events;
  },
};
