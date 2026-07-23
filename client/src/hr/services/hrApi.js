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
  syncUsers: () => api.post('/hr/employees/sync-users'),
};

export const hrAttendanceAPI = {
  getContext: () => api.get('/hr/attendance/context'),
  getMarkDefaults: (employeeId, options = {}) =>
    api.get('/hr/attendance/mark-defaults', {
      params: {
        ...(employeeId ? { employee: employeeId } : {}),
        ...(options.forSelf ? { forSelf: true } : {}),
      },
    }),
  getAll: (params) => api.get('/hr/attendance', { params }),
  getSummary: (params) => api.get('/hr/attendance/summary', { params }),
  getTrend: (params) => api.get('/hr/attendance/trend', { params }),
  getEmployeeSummary: (params) => api.get('/hr/attendance/employee-summary', { params }),
  getById: (id) => api.get(`/hr/attendance/${id}`),
  create: (data) => api.post('/hr/attendance', data),
  update: (id, data) => api.put(`/hr/attendance/${id}`, data),
  delete: (id) => api.delete(`/hr/attendance/${id}`),
};

export const hrOfficeLocationsAPI = {
  getMyOffice: (employeeId) =>
    api.get('/hr/office-locations/my-office', {
      params: employeeId ? { employee: employeeId } : undefined,
    }),
  getAll: (params) => api.get('/hr/office-locations', { params }),
  getById: (id) => api.get(`/hr/office-locations/${id}`),
  create: (data) => api.post('/hr/office-locations', data),
  update: (id, data) => api.put(`/hr/office-locations/${id}`, data),
  delete: (id) => api.delete(`/hr/office-locations/${id}`),
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

export const hrMastersAPI = {
  getSummary: () => api.get('/hr/masters/summary'),
  seed: (data) => api.post('/hr/masters/seed', data || {}),
  getDepartments: (params) => api.get('/hr/masters/departments', { params }),
  createDepartment: (data) => api.post('/hr/masters/departments', data),
  updateDepartment: (id, data) => api.put(`/hr/masters/departments/${id}`, data),
  deleteDepartment: (id) => api.delete(`/hr/masters/departments/${id}`),
  getDesignations: (params) => api.get('/hr/masters/designations', { params }),
  createDesignation: (data) => api.post('/hr/masters/designations', data),
  updateDesignation: (id, data) => api.put(`/hr/masters/designations/${id}`, data),
  deleteDesignation: (id) => api.delete(`/hr/masters/designations/${id}`),
  getPayrollComponents: (params) => api.get('/hr/masters/payroll-components', { params }),
  createPayrollComponent: (data) => api.post('/hr/masters/payroll-components', data),
  updatePayrollComponent: (id, data) => api.put(`/hr/masters/payroll-components/${id}`, data),
  deletePayrollComponent: (id) => api.delete(`/hr/masters/payroll-components/${id}`),
};

export const hrTasksAPI = {
  getToday: (params) => api.get('/hr/tasks/today', { params }),
  getAll: (params) => api.get('/hr/tasks', { params }),
  exportExcel: (params) => api.get('/hr/tasks/export', { params, responseType: 'blob' }),
  create: (data) => api.post('/hr/tasks', data),
  update: (id, data) => api.put(`/hr/tasks/${id}`, data),
  updateStatus: (id, status) => api.patch(`/hr/tasks/${id}/status`, { status }),
  delete: (id) => api.delete(`/hr/tasks/${id}`),
};

export const hrWorkLogsAPI = {
  getAll: (params) => api.get('/hr/work-logs', { params }),
  getSummary: (params) => api.get('/hr/work-logs/summary', { params }),
  getMonthlyReport: (params) => api.get('/hr/work-logs/monthly-report', { params }),
  exportExcel: (params) => api.get('/hr/work-logs/export', { params, responseType: 'blob' }),
  exportMonthlyExcel: (params) =>
    api.get('/hr/work-logs/monthly-report/export', { params, responseType: 'blob' }),
  getByDate: (params) => api.get('/hr/work-logs/by-date', { params }),
  save: (data) => api.post('/hr/work-logs', data),
  update: (id, data) => api.put(`/hr/work-logs/${id}`, data),
  delete: (id) => api.delete(`/hr/work-logs/${id}`),
};

export default api;
