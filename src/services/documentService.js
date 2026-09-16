import api from './api';

export const documentCategories = [
  ['university_notice', 'University Notice'],
  ['bill', 'Bill'],
  ['warranty', 'Warranty'],
  ['contract', 'Contract'],
  ['subscription', 'Subscription'],
  ['invoice', 'Invoice'],
  ['appointment', 'Appointment'],
  ['information', 'Information'],
  ['other', 'Other'],
];

export const categoryLabels = Object.fromEntries(documentCategories);
export const sourceLabels = { text: 'Text', manual: 'Manual Entry', pdf: 'PDF', image: 'Image' };

export function mapDocument(document) {
  const text = document.extractedText?.trim() || '';
  return {
    ...document,
    id: document._id,
    category: categoryLabels[document.category] || 'Other',
    categoryValue: document.category,
    type: sourceLabels[document.sourceType] || 'Document',
    date: document.createdAt ? new Date(document.createdAt).toLocaleDateString() : '',
    summary: text || 'No additional information was provided.',
    status: 'Saved',
    isReal: true,
  };
}

export const documentService = {
  async create(payload) {
    const { data } = await api.post('/documents', payload, { timeout: 120000 });
    return mapDocument(data.document);
  },
  async uploadDocument(formData) {
    const { data } = await api.post('/documents/upload', formData, { timeout: 120000 });
    return { document: mapDocument(data.document), message: data.message };
  },
  async uploadPdf(formData) {
    return this.uploadDocument(formData);
  },
  async getAll() {
    const { data } = await api.get('/documents');
    return data.documents.map(mapDocument);
  },
  async get(id) {
    const { data } = await api.get(`/documents/${id}`);
    return mapDocument(data.document);
  },
  async getFile(id) {
    const { data } = await api.get(`/documents/${id}/file`, {
      responseType: 'blob',
      timeout: 30000,
    });
    return URL.createObjectURL(data);
  },
  async update(id, payload) {
    const { data } = await api.patch(`/documents/${id}`, payload);
    return mapDocument(data.document);
  },
  async remove(id) {
    const { data } = await api.delete(`/documents/${id}`);
    return data;
  },
  async analyze(id, { regenerate = false } = {}) {
    const { data } = await api.post(`/documents/${id}/analyze`, { regenerate }, { timeout: 45000 });
    return {
      ...data.analysis,
      taskGenerationStatus: data.taskGenerationStatus,
      generatedTaskCount: data.generatedTaskCount,
    };
  },
  async getAnalysis(id) {
    const { data } = await api.get(`/documents/${id}/analysis`);
    return data;
  },
  async confirmAnalysis(id, analysis) {
    const { data } = await api.post(`/documents/${id}/analysis/confirm`, { analysis });
    return data;
  },
  async rejectAnalysis(id) {
    const { data } = await api.post(`/documents/${id}/analysis/reject`);
    return data;
  },
  async generateDocument(payload) {
    const { data } = await api.post('/documents/generate', payload, { timeout: 120000 });
    return data;
  },
  async analyzeTogether(documentIds) {
    const { data } = await api.post(
      '/documents/analyze-together',
      { documentIds },
      { timeout: 45000 },
    );
    return data;
  },
  async getAnalysisHistory(id) {
    const { data } = await api.get(`/documents/intelligence/${id}`);
    return data.history;
  },
  async getSource(id, source) {
    const { data } = await api.get(`/documents/${id}/chunks/${source.chunkIndex}`, {
      params: { revision: source.revision },
    });
    return data.chunk;
  },
  async getChat(id) {
    const { data } = await api.get(`/documents/${id}/chat`);
    return data.messages.map((message) => ({
      ...message,
      id: message._id,
      text: message.content,
      failed: message.role === 'user' && ['failed', 'pending'].includes(message.status),
    }));
  },
  async sendChat(id, message, requestId) {
    const { data } = await api.post(
      `/documents/${id}/chat`,
      { message, requestId },
      { timeout: 180000 },
    );
    return {
      userMessage: {
        ...data.userMessage,
        id: data.userMessage._id,
        text: data.userMessage.content,
      },
      message: {
        ...data.message,
        id: data.message._id,
        text: data.message.content,
        memory: data.memory,
      },
    };
  },
  async clearChat(id) {
    const { data } = await api.delete(`/documents/${id}/chat`);
    return data;
  },
  async downloadGenerated(id, generatedId, fileName) {
    const { data } = await api.get(`/documents/${id}/generated/${generatedId}/download`, {
      responseType: 'blob',
      timeout: 30000,
    });
    const url = URL.createObjectURL(data);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName || 'LifeAdmin_Document.docx';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
