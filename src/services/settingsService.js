import api from './api';

export const settingsService = {
  async ai() {
    const { data } = await api.get('/settings/ai');
    return data.ai;
  },
};
