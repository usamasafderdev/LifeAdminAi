import api from './api';

export const schedulingService = {
  async availability() {
    return (await api.get('/schedule/availability')).data.profile;
  },
  async saveAvailability(profile) {
    return (await api.put('/schedule/availability', profile)).data.profile;
  },
  async events(start, end) {
    return (await api.get('/schedule/events', { params: { start, end } })).data.events;
  },
  async suggest(body) {
    return (await api.post('/schedule/suggestions', body, { timeout: 120000 })).data.proposal;
  },
  async proposal(id) {
    return (await api.get(`/schedule/suggestions/${id}`)).data.proposal;
  },
  async accept(id, blocks) {
    const result = (
      await api.post(`/schedule/suggestions/${id}/accept`, { approved: true, blocks })
    ).data;
    window.dispatchEvent(new Event('lifeadmin-briefing-changed'));
    return result;
  },
  async cancel(id) {
    return (await api.post(`/schedule/suggestions/${id}/cancel`)).data.proposal;
  },
  async create(body) {
    return (await api.post('/schedule/events', body)).data.event;
  },
  async change(id, status) {
    return (await api.patch(`/schedule/events/${id}`, { status })).data.event;
  },
};
