import api from './api';
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const briefingService = {
  async get() {
    const { data } = await api.get('/briefings', {
      params: { timeZone: timeZone() },
      timeout: 45000,
    });
    return data;
  },
  async refresh() {
    const { data } = await api.post(
      '/briefings/refresh',
      { timeZone: timeZone() },
      { timeout: 45000 },
    );
    return data;
  },
  async settings() {
    const { data } = await api.get('/briefings/settings');
    return data.settings;
  },
  async update(settings) {
    const { data } = await api.patch('/briefings/settings', settings);
    window.dispatchEvent(new Event('lifeadmin-briefing-changed'));
    return data.settings;
  },
};
