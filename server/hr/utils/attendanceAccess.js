const User = require('../../models/User');
const Employee = require('../models/Employee');
const { getEffectivePermissions } = require('../../middleware/auth');

const ATTENDANCE_ADMIN_ROLE_CODES = new Set(['admin', 'super_admin', 'hr']);

async function userCanManageAllAttendance(userId) {
  const permissions = await getEffectivePermissions(userId);
  if (permissions.has('admin.all')) {
    return true;
  }

  const user = await User.findById(userId)
    .populate('roles', 'code')
    .populate({ path: 'groups', populate: { path: 'roles', select: 'code' } })
    .lean();

  if (!user) {
    return false;
  }

  const roleCodes = [];
  (user.roles || []).forEach((role) => {
    if (role?.code) roleCodes.push(String(role.code).toLowerCase());
  });
  (user.groups || []).forEach((group) => {
    (group.roles || []).forEach((role) => {
      if (role?.code) roleCodes.push(String(role.code).toLowerCase());
    });
  });

  return roleCodes.some((code) => ATTENDANCE_ADMIN_ROLE_CODES.has(code));
}

async function getEmployeeIdForUser(userId) {
  const user = await User.findById(userId).select('email').lean();
  if (!user?.email) {
    return null;
  }
  const employee = await Employee.findOne({ email: user.email.toLowerCase() }).select('_id').lean();
  return employee?._id?.toString() || null;
}

async function resolveAttendanceScope(req) {
  const canManageAll = await userCanManageAllAttendance(req.user.id);
  if (canManageAll) {
    return { canManageAll: true, employeeId: null };
  }
  const employeeId = await getEmployeeIdForUser(req.user.id);
  return { canManageAll: false, employeeId };
}

function applyEmployeeScope(query, scope, requestedEmployeeId) {
  if (scope.canManageAll) {
    if (requestedEmployeeId) {
      query.employee = requestedEmployeeId;
    }
    return query;
  }
  if (!scope.employeeId) {
    query.employee = { $in: [] };
    return query;
  }
  query.employee = scope.employeeId;
  return query;
}

function recordMatchesScope(recordEmployeeId, scope) {
  if (scope.canManageAll) {
    return true;
  }
  if (!scope.employeeId) {
    return false;
  }
  return String(recordEmployeeId) === String(scope.employeeId);
}

module.exports = {
  userCanManageAllAttendance,
  getEmployeeIdForUser,
  resolveAttendanceScope,
  applyEmployeeScope,
  recordMatchesScope,
};
