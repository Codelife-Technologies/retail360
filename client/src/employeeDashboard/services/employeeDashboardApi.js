import api from '../../services/api';

export const employeeDashboardAPI = {
  getContext: () => api.get('/hr/employee-dashboard/context'),
  getDashboard: () => api.get('/hr/employee-dashboard'),
};

export const employeeTasksAPI = {
  getToday: () => api.get('/hr/tasks/today'),
  getAll: (params) => api.get('/hr/tasks', { params }),
  updateStatus: (id, status) => api.patch(`/hr/tasks/${id}/status`, { status }),
  create: (data) => api.post('/hr/tasks', data),
  delete: (id) => api.delete(`/hr/tasks/${id}`),
};
