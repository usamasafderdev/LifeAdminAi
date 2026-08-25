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
    const { data } = await api.post('/documents', payload);
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
    const { data } = await api.get(`/documents/${id}/file`, { responseType: 'blob', timeout: 30000 });
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
};
