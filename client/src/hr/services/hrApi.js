import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const hrApi = axios.create({
  baseURL: `${API_BASE_URL}/hr`,
  headers: { 'Content-Type': 'application/json' },
});

export const hrDashboardAPI = {
  getStats: () => hrApi.get('/dashboard'),
};

export const hrEmployeesAPI = {
  getAll: (params) => hrApi.get('/employees', { params }),
  getDepartments: () => hrApi.get('/employees/departments/list'),
  getById: (id) => hrApi.get(`/employees/${id}`),
  create: (data) => hrApi.post('/employees', data),
  update: (id, data) => hrApi.put(`/employees/${id}`, data),
  delete: (id) => hrApi.delete(`/employees/${id}`),
};

export const hrAttendanceAPI = {
  getAll: (params) => hrApi.get('/attendance', { params }),
  getSummary: (params) => hrApi.get('/attendance/summary', { params }),
  getTrend: (params) => hrApi.get('/attendance/trend', { params }),
  getById: (id) => hrApi.get(`/attendance/${id}`),
  create: (data) => hrApi.post('/attendance', data),
  update: (id, data) => hrApi.put(`/attendance/${id}`, data),
  delete: (id) => hrApi.delete(`/attendance/${id}`),
};

export const hrLeavesAPI = {
  getPolicies: () => hrApi.get('/leaves/policies'),
  getBalances: (params) => hrApi.get('/leaves/balances', { params }),
  getAll: (params) => hrApi.get('/leaves', { params }),
  getById: (id) => hrApi.get(`/leaves/${id}`),
  create: (data) => hrApi.post('/leaves', data),
  update: (id, data) => hrApi.put(`/leaves/${id}`, data),
  approve: (id, data) => hrApi.post(`/leaves/${id}/approve`, data),
  reject: (id, data) => hrApi.post(`/leaves/${id}/reject`, data),
  cancel: (id, data) => hrApi.post(`/leaves/${id}/cancel`, data),
  delete: (id) => hrApi.delete(`/leaves/${id}`),
};

export const hrPayrollAPI = {
  getAll: (params) => hrApi.get('/payroll', { params }),
  getSummary: (params) => hrApi.get('/payroll/summary', { params }),
  getById: (id) => hrApi.get(`/payroll/${id}`),
  generate: (data) => hrApi.post('/payroll/generate', data),
  update: (id, data) => hrApi.put(`/payroll/${id}`, data),
  delete: (id) => hrApi.delete(`/payroll/${id}`),
};

export const hrHolidaysAPI = {
  getAll: (params) => hrApi.get('/holidays', { params }),
  getCalendar: (params) => hrApi.get('/holidays/calendar', { params }),
  getStandardYears: () => hrApi.get('/holidays/standard-years'),
  seedStandard: (year) => hrApi.post('/holidays/seed-standard', { year }),
  seedRestricted: (year) => hrApi.post('/holidays/seed-standard', { year }),
  getById: (id) => hrApi.get(`/holidays/${id}`),
  create: (data) => hrApi.post('/holidays', data),
  update: (id, data) => hrApi.put(`/holidays/${id}`, data),
  delete: (id) => hrApi.delete(`/holidays/${id}`),
};

export default hrApi;
