const User = require('../../models/User');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { getEffectivePermissions } = require('../../middleware/auth');
const { findUserForEmployee } = require('../../utils/userEmployeeLink');
const {
  getDateKey,
  ensureTodayAttendanceSession,
  calcWorkingHoursFromTimes,
} = require('../../utils/attendanceSession');
const { startOfDay, endOfDay, formatTimeHHMM } = require('./employeeId');

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
  const { getEmployeeIdForUser: resolveEmployeeId } = require('../../utils/userEmployeeLink');
  return resolveEmployeeId(userId);
}

function readSessionTimes(user, forDate = new Date()) {
  if (!user) {
    return { checkIn: '', checkOut: '' };
  }

  const dateKey = getDateKey(forDate);
  const session = user.attendanceSession;

  if (session?.date === dateKey) {
    const checkIn = session.checkInAt ? formatTimeHHMM(session.checkInAt) : '';
    let checkOut = session.checkOutAt ? formatTimeHHMM(session.checkOutAt) : '';

    if (!checkOut && session.lastLoginAt && session.checkInAt) {
      const lastLogin = new Date(session.lastLoginAt);
      const firstLogin = new Date(session.checkInAt);
      if (lastLogin > firstLogin) {
        checkOut = formatTimeHHMM(lastLogin);
      }
    }

    return { checkIn, checkOut };
  }

  const dayStart = startOfDay(forDate);
  const dayEnd = endOfDay(forDate);
  let checkIn = '';
  let checkOut = '';

  if (user.lastLoginAt) {
    const loginAt = new Date(user.lastLoginAt);
    if (loginAt >= dayStart && loginAt <= dayEnd) {
      checkIn = formatTimeHHMM(loginAt);
    }
  }

  if (user.lastLogoutAt) {
    const logoutAt = new Date(user.lastLogoutAt);
    if (logoutAt >= dayStart && logoutAt <= dayEnd) {
      checkOut = formatTimeHHMM(logoutAt);
    }
  }

  return { checkIn, checkOut };
}

async function getAttendanceTimesForUser(userId, forDate = new Date()) {
  const user = await User.findById(userId)
    .select('lastLoginAt lastLogoutAt attendanceSession')
    .lean();
  return readSessionTimes(user, forDate);
}

async function ensureUserAttendanceSession(userId, options = {}) {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }
  const changed = ensureTodayAttendanceSession(user, options);
  if (changed) {
    await user.save();
  }
  return user;
}

async function getEmployeeAttendanceTimes(employeeId, forDate = new Date()) {
  const employee = await Employee.findById(employeeId)
    .select('email firstName lastName employeeId')
    .lean();
  if (!employee) {
    return { checkIn: '', checkOut: '' };
  }

  let user = await findUserForEmployee(employee);
  if (user?._id) {
    await ensureUserAttendanceSession(user._id, { allowCurrentTime: false });
    user = await User.findById(user._id)
      .select('lastLoginAt lastLogoutAt attendanceSession')
      .lean();
  }

  return readSessionTimes(user, forDate);
}

async function getEmployeeCheckInTime(employeeId, forDate = new Date()) {
  const times = await getEmployeeAttendanceTimes(employeeId, forDate);
  return times.checkIn;
}

async function resolveAttendanceScope(req) {
  const canManageAll = await userCanManageAllAttendance(req.user.id);
  const employeeId = await getEmployeeIdForUser(req.user.id);
  return { canManageAll, employeeId };
}

function isSelfAttendanceRequest(scope, employeeId) {
  return Boolean(
    scope.employeeId &&
    employeeId &&
    String(scope.employeeId) === String(employeeId)
  );
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

function withComputedWorkingHours(record, { allowLiveNow = true } = {}) {
  if (!record) return record;
  const plain = typeof record.toObject === 'function' ? record.toObject() : { ...record };
  let checkOut = plain.checkOut;
  const isToday = getDateKey(plain.date) === getDateKey(new Date());

  if (allowLiveNow && isToday && plain.checkIn && !checkOut) {
    checkOut = formatTimeHHMM(new Date());
    plain.hoursInProgress = true;
  }

  plain.workingHours = calcWorkingHoursFromTimes(plain.checkIn, checkOut);
  return plain;
}

async function syncAttendanceRecordOnLogout(userId) {
  const employeeId = await getEmployeeIdForUser(userId);
  if (!employeeId) return null;

  const user = await User.findById(userId)
    .select('lastLoginAt lastLogoutAt attendanceSession')
    .lean();
  if (!user) return null;

  const today = startOfDay(new Date());
  const times = readSessionTimes(user, today);
  if (!times.checkIn && !times.checkOut) return null;

  const existing = await Attendance.findOne({
    employee: employeeId,
    date: { $gte: today, $lte: endOfDay(today) },
  });

  if (!existing) return null;

  if (times.checkIn && !existing.checkIn) {
    existing.checkIn = times.checkIn;
  }
  if (times.checkOut) {
    existing.checkOut = times.checkOut;
  }
  await existing.save();
  return existing;
}

module.exports = {
  userCanManageAllAttendance,
  getEmployeeIdForUser,
  getEmployeeCheckInTime,
  getEmployeeAttendanceTimes,
  getAttendanceTimesForUser,
  ensureUserAttendanceSession,
  resolveAttendanceScope,
  isSelfAttendanceRequest,
  applyEmployeeScope,
  recordMatchesScope,
  withComputedWorkingHours,
  syncAttendanceRecordOnLogout,
};
