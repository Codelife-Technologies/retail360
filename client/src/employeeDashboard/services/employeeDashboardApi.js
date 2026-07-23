import api from '../../services/api';

/** Employee Dashboard always requests self-scoped HR APIs (even for HR managers). */
const selfParams = (params = {}) => ({ ...params, forSelf: true });

export const employeeDashboardAPI = {
  getContext: () => api.get('/hr/employee-dashboard/context'),
  getDashboard: () => api.get('/hr/employee-dashboard'),
};

export const employeeTasksAPI = {
  getToday: () => api.get('/hr/tasks/today', { params: { forSelf: true } }),
  getAll: (params) => api.get('/hr/tasks', { params: selfParams(params) }),
  updateStatus: (id, status) => api.patch(`/hr/tasks/${id}/status`, { status }),
  update: (id, data) => api.put(`/hr/tasks/${id}`, data),
  create: (data) => api.post('/hr/tasks', data),
  delete: (id) => api.delete(`/hr/tasks/${id}`),
};

export const employeeWorkLogsAPI = {
  getToday: () => api.get('/hr/work-logs/today', { params: { forSelf: true } }),
  getByDate: (date) => api.get('/hr/work-logs/by-date', {
    params: { date, forSelf: true },
  }),
  getAll: (params) => api.get('/hr/work-logs', { params: selfParams(params) }),
  save: (data) => api.post('/hr/work-logs', data),
  update: (id, data) => api.put(`/hr/work-logs/${id}`, data),
  submit: (id) => api.patch(`/hr/work-logs/${id}/submit`),
  delete: (id) => api.delete(`/hr/work-logs/${id}`),
};
