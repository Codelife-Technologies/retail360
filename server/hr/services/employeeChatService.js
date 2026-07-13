const Employee = require('../models/Employee');
const EmployeeChatMessage = require('../models/EmployeeChatMessage');
const EmployeeChatNotification = require('../models/EmployeeChatNotification');
const { getEmployeeContext } = require('./employeeDashboardService');
const { findUserForEmployee, employeeDisplayName } = require('../../utils/userEmployeeLink');

const CHAT_TTL_MS = 2 * 60 * 60 * 1000;

function chatCutoffDate() {
  return new Date(Date.now() - CHAT_TTL_MS);
}

async function requireLinkedEmployee(userId) {
  const context = await getEmployeeContext(userId);
  if (!context.linked || !context.employeeId) {
    const error = new Error('Employee profile not linked to your account');
    error.status = 403;
    throw error;
  }
  return context;
}

async function searchMentionCandidates(search = '') {
  const term = String(search || '').trim();
  const query = { status: { $in: ['Active', 'On Leave'] } };

  if (term) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { firstName: regex },
      { lastName: regex },
      { employeeId: regex },
      { email: regex },
    ];
  }

  const employees = await Employee.find(query)
    .select('employeeId firstName lastName department designation photo')
    .sort({ firstName: 1, lastName: 1 })
    .limit(20)
    .lean();

  return employees.map((employee) => ({
    _id: employee._id,
    employeeId: employee.employeeId,
    firstName: employee.firstName,
    lastName: employee.lastName,
    name: employeeDisplayName(employee),
    department: employee.department,
    designation: employee.designation,
    photo: employee.photo,
  }));
}

async function resolveMentionedEmployees(mentionedEmployeeIds = []) {
  const uniqueIds = [...new Set(
    (Array.isArray(mentionedEmployeeIds) ? mentionedEmployeeIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];

  if (uniqueIds.length === 0) return [];

  const employees = await Employee.find({
    _id: { $in: uniqueIds },
    status: { $in: ['Active', 'On Leave'] },
  })
    .select('_id firstName lastName email employeeId')
    .lean();

  const mentions = [];
  for (const employee of employees) {
    const user = await findUserForEmployee(employee);
    mentions.push({
      employee: employee._id,
      user: user?._id || null,
      name: employeeDisplayName(employee),
    });
  }
  return mentions;
}

async function getRecentMessages() {
  const messages = await EmployeeChatMessage.find({
    createdAt: { $gte: chatCutoffDate() },
  })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  return messages.map((message) => ({
    ...message,
    expiresAt: new Date(new Date(message.createdAt).getTime() + CHAT_TTL_MS).toISOString(),
  }));
}

async function postMessage(userId, body, mentionedEmployeeIds = []) {
  const context = await requireLinkedEmployee(userId);
  const trimmedBody = String(body || '').trim();
  if (!trimmedBody) {
    const error = new Error('Message cannot be empty');
    error.status = 400;
    throw error;
  }

  const mentions = await resolveMentionedEmployees(mentionedEmployeeIds);
  const senderName = employeeDisplayName(context.employee);

  const message = await EmployeeChatMessage.create({
    senderUser: userId,
    senderEmployee: context.employeeId,
    senderName,
    body: trimmedBody,
    mentions,
  });

  const bodyPreview = trimmedBody.length > 240 ? `${trimmedBody.slice(0, 237)}...` : trimmedBody;
  const notifications = mentions
    .filter((mention) => mention.user && String(mention.user) !== String(userId))
    .map((mention) => ({
      message: message._id,
      recipientUser: mention.user,
      recipientEmployee: mention.employee,
      senderName,
      bodyPreview,
      read: false,
    }));

  if (notifications.length > 0) {
    await EmployeeChatNotification.insertMany(notifications);
  }

  return {
    ...message.toObject(),
    expiresAt: new Date(message.createdAt.getTime() + CHAT_TTL_MS).toISOString(),
  };
}

async function getUnreadNotifications(userId) {
  return EmployeeChatNotification.find({
    recipientUser: userId,
    read: false,
    createdAt: { $gte: chatCutoffDate() },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

async function markNotificationRead(userId, notificationId) {
  const notification = await EmployeeChatNotification.findOneAndUpdate(
    { _id: notificationId, recipientUser: userId },
    { read: true },
    { new: true }
  );
  if (!notification) {
    const error = new Error('Notification not found');
    error.status = 404;
    throw error;
  }
  return notification;
}

async function markAllNotificationsRead(userId) {
  await EmployeeChatNotification.updateMany(
    { recipientUser: userId, read: false },
    { read: true }
  );
  return { success: true };
}

module.exports = {
  CHAT_TTL_MS,
  searchMentionCandidates,
  getRecentMessages,
  postMessage,
  getUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  requireLinkedEmployee,
};
