const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const {
  APP_TIMEZONE,
  getDateKeyInAppTz,
  getZonedParts,
  zonedDateTimeToUtc,
} = require('../../utils/appTimezone');

function getSaturdayIndexInMonthAppTz(date = new Date()) {
  const parts = getZonedParts(date);
  if (!parts) return 0;
  let count = 0;
  for (let day = 1; day <= parts.day; day += 1) {
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const probe = zonedDateTimeToUtc(key, '12:00:00');
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

function listDateKeysInclusive(fromDate, toDate) {
  const keys = [];
  let key = getDateKeyInAppTz(fromDate);
  const endKey = getDateKeyInAppTz(toDate);
  if (!key || !endKey) return keys;

  while (key <= endKey) {
    keys.push(key);
    const [y, m, d] = key.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    key = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }
  return keys;
}

async function isHolidayOnDateKey(dateKey) {
  const dayStart = startOfDay(dateKey);
  const dayEnd = endOfDay(dateKey);
  const holiday = await Holiday.findOne({
    date: { $gte: dayStart, $lte: dayEnd },
    status: 'Active',
  })
    .select('_id')
    .lean();
  return Boolean(holiday);
}

/**
 * Employees with an Approved leave covering the given calendar day.
 */
async function getApprovedLeaveEmployeeIdsForDate(date = new Date()) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const leaves = await Leave.find({
    status: 'Approved',
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('employee')
    .lean();

  return new Set(leaves.map((row) => String(row.employee)));
}

/**
 * Mark attendance as Leave for each working day in an approved leave range.
 * Converts existing Absent rows to Leave; does not overwrite Present / WFH / Half Day.
 */
async function syncAttendanceForApprovedLeave(leave) {
  if (!leave || leave.status !== 'Approved') {
    return { updated: 0, created: 0 };
  }

  const employeeId = leave.employee?._id || leave.employee;
  if (!employeeId) {
    return { updated: 0, created: 0 };
  }

  const dateKeys = listDateKeysInclusive(leave.fromDate, leave.toDate);
  let created = 0;
  let updated = 0;
  const note = `Approved leave (${leave.leaveType || 'Leave'})`;

  for (const dateKey of dateKeys) {
    const dayProbe = zonedDateTimeToUtc(dateKey, '12:00:00');
    if (isNonWorkingDayAppTz(dayProbe)) continue;
    if (await isHolidayOnDateKey(dateKey)) continue;

    const dayStart = startOfDay(dateKey);
    const dayEnd = endOfDay(dateKey);
    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: dayStart, $lte: dayEnd },
    });

    if (!existing) {
      await Attendance.create({
        employee: employeeId,
        date: dayStart,
        checkIn: '',
        checkOut: '',
        workingHours: 0,
        status: 'Leave',
        notes: note,
      });
      created += 1;
      continue;
    }

    if (existing.status === 'Absent' || existing.status === 'Leave') {
      existing.status = 'Leave';
      if (!existing.notes || /auto-marked absent/i.test(existing.notes)) {
        existing.notes = note;
      }
      existing.checkIn = existing.checkIn || '';
      existing.checkOut = existing.checkOut || '';
      await existing.save();
      updated += 1;
    }
  }

  return { created, updated };
}

module.exports = {
  listDateKeysInclusive,
  getApprovedLeaveEmployeeIdsForDate,
  syncAttendanceForApprovedLeave,
};
