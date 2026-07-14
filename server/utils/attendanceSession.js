const { getDateKeyInAppTz } = require('./appTimezone');

function getDateKey(date = new Date()) {
  return getDateKeyInAppTz(date);
}

function pickEarlierTime(timeA, timeB) {
  if (!timeA) return timeB || '';
  if (!timeB) return timeA;
  const minutesA = parseTimeToMinutes(timeA);
  const minutesB = parseTimeToMinutes(timeB);
  if (minutesA == null) return timeB;
  if (minutesB == null) return timeA;
  return minutesA <= minutesB ? timeA : timeB;
}

function pickLaterTime(timeA, timeB) {
  if (!timeA) return timeB || '';
  if (!timeB) return timeA;
  const minutesA = parseTimeToMinutes(timeA);
  const minutesB = parseTimeToMinutes(timeB);
  if (minutesA == null) return timeB;
  if (minutesB == null) return timeA;
  return minutesA >= minutesB ? timeA : timeB;
}

function applyLoginToAttendanceSession(user) {
  const now = new Date();
  const todayKey = getDateKey(now);
  const session = user.attendanceSession || {};

  if (session.date !== todayKey) {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: now,
      checkOutAt: null,
      lastLoginAt: now,
    };
  } else {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: session.checkInAt || now,
      checkOutAt: session.checkOutAt || null,
      lastLoginAt: now,
    };
  }

  user.lastLoginAt = now;
  if (typeof user.markModified === 'function') {
    user.markModified('attendanceSession');
  }
}

function applyLogoutToAttendanceSession(user) {
  const now = new Date();
  const todayKey = getDateKey(now);
  const session = user.attendanceSession || {};

  if (session.date === todayKey) {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: session.checkInAt || now,
      checkOutAt: now,
      lastLoginAt: session.lastLoginAt || now,
    };
  } else {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: null,
      checkOutAt: now,
      lastLoginAt: null,
    };
  }

  user.lastLogoutAt = now;
  if (typeof user.markModified === 'function') {
    user.markModified('attendanceSession');
  }
}

function ensureTodayAttendanceSession(user, { allowCurrentTime = false } = {}) {
  const now = new Date();
  const todayKey = getDateKey(now);
  const session = user.attendanceSession || {};

  if (session.date === todayKey && session.checkInAt) {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: session.checkInAt,
      checkOutAt: session.checkOutAt || null,
      lastLoginAt: session.lastLoginAt || session.checkInAt,
    };
    user.lastLoginAt = user.lastLoginAt || session.checkInAt;
    if (typeof user.markModified === 'function') {
      user.markModified('attendanceSession');
    }
    return false;
  }

  if (user.lastLoginAt && getDateKey(user.lastLoginAt) === todayKey) {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: session.date === todayKey && session.checkInAt ? session.checkInAt : user.lastLoginAt,
      checkOutAt: session.date === todayKey ? session.checkOutAt || null : null,
      lastLoginAt: user.lastLoginAt,
    };
    if (typeof user.markModified === 'function') {
      user.markModified('attendanceSession');
    }
    return true;
  }

  if (allowCurrentTime) {
    applyLoginToAttendanceSession(user);
    return true;
  }

  return false;
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1];
}

function calcWorkingHoursFromTimes(checkIn, checkOut) {
  const inMinutes = parseTimeToMinutes(checkIn);
  const outMinutes = parseTimeToMinutes(checkOut);
  if (inMinutes == null || outMinutes == null) return 0;

  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes === 0) return 0;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }
  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
}

module.exports = {
  getDateKey,
  applyLoginToAttendanceSession,
  applyLogoutToAttendanceSession,
  ensureTodayAttendanceSession,
  parseTimeToMinutes,
  calcWorkingHoursFromTimes,
  pickEarlierTime,
  pickLaterTime,
};
