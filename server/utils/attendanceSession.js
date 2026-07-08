function getDateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    user.attendanceSession.lastLoginAt = now;
    if (!user.attendanceSession.checkInAt) {
      user.attendanceSession.checkInAt = now;
    }
  }

  user.lastLoginAt = now;
}

function applyLogoutToAttendanceSession(user) {
  const now = new Date();
  const todayKey = getDateKey(now);
  const session = user.attendanceSession || {};

  if (session.date === todayKey) {
    user.attendanceSession.checkOutAt = now;
    user.attendanceSession.lastLoginAt = user.attendanceSession.lastLoginAt || now;
  } else {
    user.attendanceSession = {
      date: todayKey,
      checkInAt: null,
      checkOutAt: now,
      lastLoginAt: null,
    };
  }

  user.lastLogoutAt = now;
}

function calcWorkingHoursFromTimes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);
  const minutes = outH * 60 + outM - (inH * 60 + inM);
  if (minutes <= 0) return 0;
  return Math.round((minutes / 60) * 10) / 10;
}

module.exports = {
  getDateKey,
  applyLoginToAttendanceSession,
  applyLogoutToAttendanceSession,
  calcWorkingHoursFromTimes,
};
