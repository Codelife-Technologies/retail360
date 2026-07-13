import api from '../../services/api';

export const employeeChatAPI = {
  getMessages: () => api.get('/hr/chat/messages'),
  sendMessage: (body, mentionedEmployeeIds) =>
    api.post('/hr/chat/messages', { body, mentionedEmployeeIds }),
  getMentionCandidates: (search) =>
    api.get('/hr/chat/mention-candidates', { params: { search } }),
  getNotifications: () => api.get('/hr/chat/notifications'),
  markNotificationRead: (id) => api.patch(`/hr/chat/notifications/${id}/read`),
  markAllNotificationsRead: () => api.patch('/hr/chat/notifications/read-all'),
};
