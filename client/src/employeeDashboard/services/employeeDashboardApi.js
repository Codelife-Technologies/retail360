import api from '../../services/api';

export const employeeDashboardAPI = {
  getContext: () => api.get('/hr/employee-dashboard/context'),
  getDashboard: () => api.get('/hr/employee-dashboard'),
};

export const employeeTasksAPI = {
  getToday: () => api.get('/hr/tasks/today'),
  getAll: (params) => api.get('/hr/tasks', { params }),
  updateStatus: (id, status) => api.patch(`/hr/tasks/${id}/status`, { status }),
  update: (id, data) => api.put(`/hr/tasks/${id}`, data),
  create: (data) => api.post('/hr/tasks', data),
  delete: (id) => api.delete(`/hr/tasks/${id}`),
};

export const employeeWorkLogsAPI = {
  getToday: () => api.get('/hr/work-logs/today'),
  getByDate: (date) => api.get('/hr/work-logs/by-date', { params: { date } }),
  getAll: (params) => api.get('/hr/work-logs', { params }),
  save: (data) => api.post('/hr/work-logs', data),
  update: (id, data) => api.put(`/hr/work-logs/${id}`, data),
  submit: (id) => api.patch(`/hr/work-logs/${id}/submit`),
  delete: (id) => api.delete(`/hr/work-logs/${id}`),
};
