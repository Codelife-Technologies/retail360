import api from '../../services/api';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export const documentsAPI = {
  list: (params) => api.get('/documents', { params }),
  getById: (id) => api.get(`/documents/${id}`),
  getBySku: (sku, params) => api.get(`/documents/sku/${encodeURIComponent(sku)}`, { params }),
  getAnalytics: (params) => api.get('/documents/analytics', { params }),
  getSettings: () => api.get('/documents/settings'),
  updateSettings: (data) => api.put('/documents/settings', data),
  listFolders: (params) => api.get('/documents/folders', { params }),
  createFolder: (data) => api.post('/documents/folders', data),
  updateFolder: (id, data) => api.put(`/documents/folders/${id}`, data),
  deleteFolder: (id) => api.delete(`/documents/folders/${id}`),
  reorderFolders: (orderedIds, sourceScope) =>
    api.put('/documents/folders/reorder', { orderedIds, sourceScope }),
  moveToFolder: (id, folderId) => api.post(`/documents/${id}/move`, { folderId }),
  upload: (formData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    }),
  aiSave: (data) => api.post('/documents/ai-save', data),
  update: (id, data) => api.put(`/documents/${id}`, data),
  softDelete: (id) => api.delete(`/documents/${id}`),
  permanentDelete: (id) => api.delete(`/documents/${id}`, { params: { permanent: true } }),
  restore: (id) => api.post(`/documents/${id}/restore`),
  archive: (id) => api.post(`/documents/${id}/archive`),
  downloadUrl: (id) => `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/documents/${id}/download`,
  download: async (id, fileName = 'document') => {
    const response = await api.get(`/documents/${id}/download`, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },
  fileUrl: (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
    if (url.startsWith('uploads/')) return `${API_BASE}/${url}`;
    return `${API_BASE}/uploads/${String(url).replace(/^\/+/, '')}`;
  },
};

export default documentsAPI;
