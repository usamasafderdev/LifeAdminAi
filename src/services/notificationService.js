import api from './api';
export const notificationService = {
  async list(params = {}) {
    return (await api.get('/notifications', { params })).data;
  },
  async read(id) {
    return (await api.patch(`/notifications/${id}/read`)).data;
  },
  async readAll() {
    return (await api.patch('/notifications/read-all')).data;
  },
  async remove(id) {
    return (await api.delete(`/notifications/${id}`)).data;
  },
  async resource(id) {
    return (await api.get(`/notifications/${id}/resource`)).data.path;
  },
  async settings() {
    return (await api.get('/notifications/settings')).data.settings;
  },
  async updateSettings(body) {
    const data = (await api.patch('/notifications/settings', body)).data.settings;
    window.dispatchEvent(new Event('lifeadmin-notifications-changed'));
    return data;
  },
};
