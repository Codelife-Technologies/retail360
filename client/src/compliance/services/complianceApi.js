import api from '../../services/api';

function downloadBlob(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob = new Blob([response.data], { type: response.headers['content-type'] });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function makeCrudApi(basePath) {
  return {
    getAll: (params) => api.get(basePath, { params }),
    getById: (id) => api.get(`${basePath}/${id}`),
    create: (data) => api.post(basePath, data),
    update: (id, data) => api.put(`${basePath}/${id}`, data),
    delete: (id) => api.delete(`${basePath}/${id}`),
    export: async (params) => {
      const response = await api.get(`${basePath}/export`, {
        params,
        responseType: 'blob',
      });
      downloadBlob(response, `${basePath.split('/').pop() || 'export'}.${params?.format || 'xlsx'}`);
      return response;
    },
  };
}

export const complianceDashboardAPI = {
  getStats: () => api.get('/compliance/dashboard'),
};

export const complianceCompanyAPI = {
  get: () => api.get('/compliance/company'),
  update: (data) => api.put('/compliance/company', data),
};

export const complianceFilingMastersAPI = {
  ...makeCrudApi('/compliance/filing-masters'),
  seedDefaults: () => api.post('/compliance/filing-masters/seed-defaults'),
};

export const complianceFilingsAPI = {
  ...makeCrudApi('/compliance/filings'),
  getGovConfig: () => api.get('/compliance/filings/gov-config'),
  getActiveMasters: () => api.get('/compliance/filings/active-masters'),
  previewDueDate: (data) => api.post('/compliance/filings/preview-due-date', data),
  generateUpcoming: () => api.post('/compliance/filings/generate-upcoming'),
  submitGovernment: (id) => api.post(`/compliance/filings/${id}/submit-government`),
};

export const complianceGstAPI = makeCrudApi('/compliance/gst');
export const complianceTdsAPI = makeCrudApi('/compliance/tds');
export const compliancePayrollAPI = makeCrudApi('/compliance/payroll');
export const complianceEpfAPI = makeCrudApi('/compliance/epf');
export const complianceEsicAPI = makeCrudApi('/compliance/esic');
export const complianceLabourAPI = makeCrudApi('/compliance/labour');
export const complianceEmployeesAPI = makeCrudApi('/compliance/employees');
export const complianceLicensesAPI = makeCrudApi('/compliance/licenses');
export const complianceAuditsAPI = makeCrudApi('/compliance/audits');
export const complianceTasksAPI = makeCrudApi('/compliance/tasks');

export const complianceCalendarAPI = {
  getEvents: (params) => api.get('/compliance/calendar/events', { params }),
};

export const complianceDocumentsAPI = {
  getAll: (params) => api.get('/compliance/documents', { params }),
  upload: (formData) =>
    api.post('/compliance/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  download: async (id, fileName = 'document') => {
    const response = await api.get(`/compliance/documents/${id}/download`, {
      responseType: 'blob',
    });
    downloadBlob(response, fileName);
    return response;
  },
  previewUrl: (id) => {
    const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('token');
    return `${base}/compliance/documents/${id}/preview?token=${encodeURIComponent(token || '')}`;
  },
  delete: (id) => api.delete(`/compliance/documents/${id}`),
};

export const complianceReportsAPI = {
  getSummary: () => api.get('/compliance/reports/summary'),
  export: async (type, format = 'xlsx') => {
    const response = await api.get(`/compliance/reports/${type}/export`, {
      params: { format },
      responseType: 'blob',
    });
    downloadBlob(response, `${type}.${format === 'excel' ? 'xlsx' : format}`);
    return response;
  },
};
