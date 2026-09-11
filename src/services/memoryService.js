import api from './api';
const changed = (kind) =>
  window.dispatchEvent(new CustomEvent('lifeadmin-memory-changed', { detail: { kind } }));
export const memoryService = {
  async list(q = '', page = 1) {
    const { data } = await api.get('/memories', { params: { q, page } });
    return data;
  },
  async settings(settings) {
    const { data } = await api.patch('/memories/settings', settings);
    changed();
    return data;
  },
  async save(token) {
    const { data } = await api.post('/memories/confirm', { token });
    changed('save');
    return data.memory;
  },
  async edit(id, payload) {
    const { data } = await api.patch(`/memories/${id}`, payload);
    changed();
    return data.memory;
  },
  async forget(id) {
    await api.delete(`/memories/${id}`);
    changed();
  },
  async clear() {
    await api.delete('/memories');
    changed();
  },
};
