const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Holiday = require('../models/Holiday');
const { startOfDay, endOfDay, formatTimeHHMM } = require('./employeeId');
const {
  APP_TIMEZONE,
  getZonedParts,
  getDateKeyInAppTz,
  zonedDateTimeToUtc,
} = require('../../utils/appTimezone');

/** Marking / presence deadline — after this wall-clock time counts as half day. */
const HALF_DAY_CUTOFF = '12:30';
const HALF_DAY_CUTOFF_MINUTES = 12 * 60 + 30;

function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const match = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isAtOrAfterHalfDayCutoff(hhmm, cutoff = HALF_DAY_CUTOFF) {
  const minutes = timeToMinutes(hhmm);
  const cutoffMinutes = timeToMinutes(cutoff) ?? HALF_DAY_CUTOFF_MINUTES;
  if (minutes == null) return false;
  return minutes >= cutoffMinutes;
}

function getNowHHMM(date = new Date()) {
  return formatTimeHHMM(date);
}

function isPastHalfDayCutoff(date = new Date()) {
  return isAtOrAfterHalfDayCutoff(getNowHHMM(date));
}

/**
 * Employee self-mark after 12:30 → Half Day.
 * Already Present/WFH/Half Day before cutoff stays as requested on later updates.
 * Auto-Absent upgraded when employee marks late → Half Day.
 */
function resolveSelfMarkStatus({ requestedStatus, existing, nowHHMM }) {
  const allowed = requestedStatus === 'Work From Home' ? 'Work From Home' : 'Present';
  const late = isAtOrAfterHalfDayCutoff(nowHHMM);

  if (existing) {
    // Auto-absent (or HR absent) upgraded when employee marks after cutoff → Half Day
    if (existing.status === 'Absent') {
      return late ? 'Half Day' : allowed;
    }
    // Keep half-day once applied; otherwise allow Office ↔ WFH updates
    if (existing.status === 'Half Day') return 'Half Day';
    if (existing.status === 'Present' || existing.status === 'Work From Home') {
      return allowed;
    }
    return existing.status;
  }

  if (late) return 'Half Day';
  return allowed;
}

function getSaturdayIndexInMonthAppTz(date = new Date()) {
  const parts = getZonedParts(date);
  if (!parts) return 0;
  let count = 0;
  for (let day = 1; day <= parts.day; day += 1) {
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const probe = zonedDateTimeToUtc(key, '12:00:00');
    const probeParts = getZonedParts(probe);
    // Saturday = 6 in JS; use weekday from en-US short in app tz
    const weekday = new Date(probe).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: APP_TIMEZONE,
    });
    if (weekday === 'Sat') count += 1;
  }
  return count;
}

function isNonWorkingDayAppTz(date = new Date()) {
  const weekday = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: APP_TIMEZONE,
  });
  if (weekday === 'Sun') return true;
  if (weekday === 'Sat') {
    const index = getSaturdayIndexInMonthAppTz(date);
    return index === 2 || index === 4;
  }
  return false;
}

async function isHolidayToday(date = new Date()) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const holiday = await Holiday.findOne({
    date: { $gte: dayStart, $lte: dayEnd },
    status: 'Active',
  }).lean();
  return Boolean(holiday);
}

/**
 * After 12:30 on a working day, create Absent for Active employees with no attendance row today.
 */
async function autoMarkAbsentAfterCutoff(now = new Date()) {
  if (!isPastHalfDayCutoff(now)) {
    return { skipped: true, reason: 'before_cutoff', created: 0 };
  }
  if (isNonWorkingDayAppTz(now)) {
    return { skipped: true, reason: 'non_working_day', created: 0 };
  }
  if (await isHolidayToday(now)) {
    return { skipped: true, reason: 'holiday', created: 0 };
  }

  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const dateKey = getDateKeyInAppTz(now);

  const activeEmployees = await Employee.find({ status: 'Active' }).select('_id').lean();
  if (!activeEmployees.length) {
    return { skipped: false, created: 0, dateKey };
  }

  const existing = await Attendance.find({
    date: { $gte: dayStart, $lte: dayEnd },
  })
    .select('employee')
    .lean();

  const markedIds = new Set(existing.map((row) => String(row.employee)));
  const missing = activeEmployees.filter((emp) => !markedIds.has(String(emp._id)));

  if (!missing.length) {
    return { skipped: false, created: 0, dateKey };
  }

  const docs = missing.map((emp) => ({
    employee: emp._id,
    date: dayStart,
    checkIn: '',
    checkOut: '',
    workingHours: 0,
    status: 'Absent',
    notes: 'Auto-marked absent (not marked present by 12:30)',
  }));

  try {
    const result = await Attendance.insertMany(docs, { ordered: false });
    return { skipped: false, created: result.length, dateKey };
  } catch (error) {
    // Partial success on duplicate key races
    const created = error?.insertedDocs?.length || 0;
    if (created > 0 || error?.code === 11000) {
      return { skipped: false, created, dateKey, partial: true };
    }
    throw error;
  }
}

let autoAbsentTimer = null;

function startAutoAbsentScheduler({ intervalMs = 60 * 1000 } = {}) {
  if (autoAbsentTimer) return;

  const run = async () => {
    try {
      const result = await autoMarkAbsentAfterCutoff();
      if (!result.skipped && result.created > 0) {
        console.log(
          `Attendance: auto-marked ${result.created} absent for ${result.dateKey} (cutoff ${HALF_DAY_CUTOFF})`
        );
      }
    } catch (error) {
      console.error('Attendance auto-absent job failed:', error.message);
    }
  };

  // Run shortly after boot, then on an interval
  setTimeout(run, 15 * 1000);
  autoAbsentTimer = setInterval(run, intervalMs);
  if (typeof autoAbsentTimer.unref === 'function') {
    autoAbsentTimer.unref();
  }
}

module.exports = {
  HALF_DAY_CUTOFF,
  isAtOrAfterHalfDayCutoff,
  isPastHalfDayCutoff,
  getNowHHMM,
  resolveSelfMarkStatus,
  autoMarkAbsentAfterCutoff,
  startAutoAbsentScheduler,
  isNonWorkingDayAppTz,
};
