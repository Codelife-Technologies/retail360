import api from '../../services/api';

export const hrDashboardAPI = {
  getStats: () => api.get('/hr/dashboard'),
};

export const hrEmployeesAPI = {
  getAll: (params) => api.get('/hr/employees', { params }),
  getDepartments: () => api.get('/hr/employees/departments/list'),
  getById: (id) => api.get(`/hr/employees/${id}`),
  create: (data) => api.post('/hr/employees', data),
  update: (id, data) => api.put(`/hr/employees/${id}`, data),
  delete: (id) => api.delete(`/hr/employees/${id}`),
};

export const hrAttendanceAPI = {
  getContext: () => api.get('/hr/attendance/context'),
  getAll: (params) => api.get('/hr/attendance', { params }),
  getSummary: (params) => api.get('/hr/attendance/summary', { params }),
  getTrend: (params) => api.get('/hr/attendance/trend', { params }),
  getById: (id) => api.get(`/hr/attendance/${id}`),
  create: (data) => api.post('/hr/attendance', data),
  update: (id, data) => api.put(`/hr/attendance/${id}`, data),
  delete: (id) => api.delete(`/hr/attendance/${id}`),
};

export const hrLeavesAPI = {
  getPolicies: () => api.get('/hr/leaves/policies'),
  getBalances: (params) => api.get('/hr/leaves/balances', { params }),
  getAll: (params) => api.get('/hr/leaves', { params }),
  getById: (id) => api.get(`/hr/leaves/${id}`),
  create: (data) => api.post('/hr/leaves', data),
  update: (id, data) => api.put(`/hr/leaves/${id}`, data),
  approve: (id, data) => api.post(`/hr/leaves/${id}/approve`, data),
  reject: (id, data) => api.post(`/hr/leaves/${id}/reject`, data),
  cancel: (id, data) => api.post(`/hr/leaves/${id}/cancel`, data),
  delete: (id) => api.delete(`/hr/leaves/${id}`),
};

export const hrPayrollAPI = {
  getAll: (params) => api.get('/hr/payroll', { params }),
  getSummary: (params) => api.get('/hr/payroll/summary', { params }),
  getById: (id) => api.get(`/hr/payroll/${id}`),
  generate: (data) => api.post('/hr/payroll/generate', data),
  update: (id, data) => api.put(`/hr/payroll/${id}`, data),
  delete: (id) => api.delete(`/hr/payroll/${id}`),
};

export const hrHolidaysAPI = {
  getAll: (params) => api.get('/hr/holidays', { params }),
  getCalendar: (params) => api.get('/hr/holidays/calendar', { params }),
  getStandardYears: () => api.get('/hr/holidays/standard-years'),
  seedStandard: (year) => api.post('/hr/holidays/seed-standard', { year }),
  seedRestricted: (year) => api.post('/hr/holidays/seed-standard', { year }),
  getById: (id) => api.get(`/hr/holidays/${id}`),
  create: (data) => api.post('/hr/holidays', data),
  update: (id, data) => api.put(`/hr/holidays/${id}`, data),
  delete: (id) => api.delete(`/hr/holidays/${id}`),
};

export default api;
