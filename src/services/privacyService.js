import api from './api';

export const privacyService = {
  async exportData() {
    const response = await api.get('/privacy/export', { responseType: 'blob' });
    return response;
  },
  async clearChatHistory() {
    const { data } = await api.delete('/privacy/chat-history');
    return data;
  },
  async deleteAccount() {
    const { data } = await api.delete('/privacy/account', { data: { confirmation: 'DELETE' } });
    return data;
  },
};
