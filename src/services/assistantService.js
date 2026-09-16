import api from './api';
export const mapChatMessage = (message) => ({
  ...message,
  id: message._id,
  text: message.content,
  failed: message.role === 'user' && ['failed', 'pending'].includes(message.status),
});
export const assistantService = {
  async conversations() {
    const { data } = await api.get('/conversations', { params: { type: 'global' } });
    return data.conversations;
  },
  async create() {
    const { data } = await api.post('/conversations', { type: 'global' });
    return data.conversation;
  },
  async selectDocument(conversationId, documentId) {
    const { data } = await api.patch(`/conversations/${conversationId}`, { documentId });
    return data.conversation;
  },
  async history(conversationId, before) {
    const { data } = await api.get(`/conversations/${conversationId}/messages`, {
      params: { before },
    });
    return { messages: data.messages.map(mapChatMessage), hasMore: data.hasMore };
  },
  async send(message, conversationId, requestId) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { data } = await api.post(
      `/conversations/${conversationId}/messages`,
      { message, requestId, today, timezoneOffset: now.getTimezoneOffset() },
      { timeout: 180000 },
    );
    return {
      userMessage: mapChatMessage(data.userMessage),
      message: { ...mapChatMessage(data.message), memory: data.memory },
      metadata: data.metadata,
    };
  },
  async clear(conversationId) {
    const { data } = await api.delete(`/conversations/${conversationId}`);
    return data;
  },
};
