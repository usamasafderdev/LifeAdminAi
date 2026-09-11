import api from './api';
const mapMessage = (message) => ({ ...message, id: message._id, text: message.content });
export const assistantService = {
  async history() { const { data } = await api.get('/assistant/chat'); return data.messages.map(mapMessage); },
  async send(message) { const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; const { data } = await api.post('/assistant/chat', { message, today, timezoneOffset: now.getTimezoneOffset() }, { timeout: 45000 }); return { userMessage: mapMessage(data.userMessage), message: { ...mapMessage(data.message), memory: data.memory }, metadata: data.metadata }; },
  async clear() { const { data } = await api.delete('/assistant/chat'); return data; },
};
