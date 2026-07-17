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

export const financeAPI = {
  getMeta: () => api.get('/finance/meta'),
  getDashboard: (params) => api.get('/finance/dashboard', { params }),
  getIncome: (params) => api.get('/finance/income', { params }),
  createOtherIncome: (data) => {
    if (data instanceof FormData) {
      return api.post('/finance/other-income', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/finance/other-income', data);
  },
  updateOtherIncome: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/finance/other-income/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.put(`/finance/other-income/${id}`, data);
  },
  deleteOtherIncome: (id) => api.delete(`/finance/other-income/${id}`),
  exportIncome: async (params) => {
    const response = await api.get('/finance/income', {
      params: { ...params, export: params.format || 'xlsx' },
      responseType: 'blob',
    });
    downloadBlob(response, `Income_Report.${params.format || 'xlsx'}`);
    return response;
  },
  getExpenses: (params) => api.get('/finance/expenses', { params }),
  createExpense: (data) => {
    if (data instanceof FormData) {
      return api.post('/finance/expenses', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.post('/finance/expenses', data);
  },
  updateExpense: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/finance/expenses/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.put(`/finance/expenses/${id}`, data);
  },
  deleteExpense: (id) => api.delete(`/finance/expenses/${id}`),
  downloadExpenseTemplate: async () => {
    const response = await api.get('/finance/expenses/template', { responseType: 'blob' });
    downloadBlob(response, 'expense_template.xlsx');
    return response;
  },
  importExpenses: (formData) => api.post('/finance/expenses/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  exportExpenses: async (params) => {
    const response = await api.get('/finance/expenses', {
      params: { ...params, export: params.format || 'xlsx' },
      responseType: 'blob',
    });
    downloadBlob(response, `Expense_Report.${params.format || 'xlsx'}`);
    return response;
  },
  getPnl: (params) => api.get('/finance/pnl', { params }),
  exportPnl: async (params) => {
    const response = await api.get('/finance/pnl', {
      params: { ...params, export: params.format || 'xlsx' },
      responseType: 'blob',
    });
    downloadBlob(response, `Profit_and_Loss.${params.format || 'xlsx'}`);
    return response;
  },
  getReportsSummary: (params) => api.get('/finance/reports/summary', { params }),
  getRecords: (params) => api.get('/finance/records', { params }),
  exportRecords: async (params = {}) => {
    const response = await api.get('/finance/records', {
      params: { ...params, export: params.format || 'xlsx' },
      responseType: 'blob',
    });
    downloadBlob(response, `Finance_Records.${params.format || 'xlsx'}`);
    return response;
  },
  exportReport: async (type, format = 'xlsx', params = {}) => {
    const response = await api.get(`/finance/reports/${type}/export`, {
      params: { ...params, format },
      responseType: 'blob',
    });
    downloadBlob(response, `${type}.${format}`);
    return response;
  },
};
