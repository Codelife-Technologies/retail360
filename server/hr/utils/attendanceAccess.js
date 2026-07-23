const User = require('../../models/User');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const { getEffectivePermissions } = require('../../middleware/auth');
const { findUserForEmployee } = require('../../utils/userEmployeeLink');
const {
  getDateKey,
  ensureTodayAttendanceSession,
  calcWorkingHoursFromTimes,
  pickEarlierTime,
  pickLaterTime,
} = require('../../utils/attendanceSession');
const { startOfDay, endOfDay, formatTimeHHMM } = require('./employeeId');

const ATTENDANCE_ADMIN_ROLE_CODES = new Set(['admin', 'super_admin', 'hr']);
const ATTENDANCE_ADMIN_PERMISSIONS = new Set([
  'admin.all',
  'hr.access',
  'hr.full',
  'hr.attendance.manage',
]);

function permissionSetHas(permissions, code) {
  const wanted = String(code || '').toLowerCase();
  return [...permissions].some((entry) => String(entry || '').toLowerCase() === wanted);
}

async function userCanManageAllAttendance(userId) {
  const permissions = await getEffectivePermissions(userId);
  if ([...ATTENDANCE_ADMIN_PERMISSIONS].some((code) => permissionSetHas(permissions, code))) {
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
  const dayStart = startOfDay(forDate);
  const dayEnd = endOfDay(forDate);

  let checkIn = '';
  let checkOut = '';

  if (session?.date === dateKey) {
    if (session.checkInAt) {
      checkIn = formatTimeHHMM(session.checkInAt);
    }
    if (session.checkOutAt) {
      checkOut = formatTimeHHMM(session.checkOutAt);
    }
  }

  if (user.lastLoginAt) {
    const loginAt = new Date(user.lastLoginAt);
    if (loginAt >= dayStart && loginAt <= dayEnd) {
      const loginTime = formatTimeHHMM(loginAt);
      checkIn = checkIn ? pickEarlierTime(checkIn, loginTime) : loginTime;
    }
  }

  if (user.lastLogoutAt) {
    const logoutAt = new Date(user.lastLogoutAt);
    if (logoutAt >= dayStart && logoutAt <= dayEnd) {
      const logoutTime = formatTimeHHMM(logoutAt);
      checkOut = checkOut ? pickLaterTime(checkOut, logoutTime) : logoutTime;
    }
  }

  // Still logged in (login more recent than logout) — no check-out yet
  if (user.lastLoginAt) {
    const loginAt = new Date(user.lastLoginAt);
    if (loginAt >= dayStart && loginAt <= dayEnd) {
      const logoutAt = user.lastLogoutAt ? new Date(user.lastLogoutAt) : null;
      if (!logoutAt || logoutAt < loginAt) {
        checkOut = '';
      }
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

function applyEmployeeScope(query, scope, requestedEmployeeId, options = {}) {
  const forceSelf = Boolean(options.forceSelf);
  if (forceSelf) {
    if (!scope.employeeId) {
      query.employee = { $in: [] };
      return query;
    }
    query.employee = scope.employeeId;
    return query;
  }

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

/** Always scope to the linked employee (used by Employee Dashboard). */
function applySelfEmployeeScope(query, scope) {
  return applyEmployeeScope(query, scope, null, { forceSelf: true });
}

function wantsSelfService(req) {
  const flag = req?.query?.forSelf ?? req?.body?.forSelf;
  return flag === true || flag === 'true' || flag === '1';
}

function recordMatchesScope(recordEmployeeId, scope, options = {}) {
  if (options.forceSelf) {
    if (!scope.employeeId) return false;
    return String(recordEmployeeId) === String(scope.employeeId);
  }
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
  const actualCheckOut = plain.checkOut || '';
  const isToday = getDateKey(plain.date) === getDateKey(new Date());

  let checkOutForHours = actualCheckOut;
  if (allowLiveNow && isToday && plain.checkIn && !actualCheckOut) {
    checkOutForHours = formatTimeHHMM(new Date());
    plain.hoursInProgress = true;
  }

  // Keep stored checkOut empty until a real logout; only hours use live "now"
  plain.checkOut = actualCheckOut;
  plain.workingHours = calcWorkingHoursFromTimes(plain.checkIn, checkOutForHours);
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

  if (times.checkIn) {
    existing.checkIn = existing.checkIn
      ? pickEarlierTime(existing.checkIn, times.checkIn)
      : times.checkIn;
  }
  if (times.checkOut) {
    existing.checkOut = existing.checkOut
      ? pickLaterTime(existing.checkOut, times.checkOut)
      : times.checkOut;
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
  applySelfEmployeeScope,
  wantsSelfService,
  recordMatchesScope,
  withComputedWorkingHours,
  syncAttendanceRecordOnLogout,
};
