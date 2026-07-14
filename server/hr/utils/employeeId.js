const Employee = require('../models/Employee');
const {
  APP_TIMEZONE,
  startOfDayInAppTz,
  endOfDayInAppTz,
  formatTimeHHMMInAppTz,
  getDateKeyInAppTz,
} = require('../../utils/appTimezone');

async function generateNextEmployeeId() {
  const employees = await Employee.find({ employeeId: /^EMP-/i }).select('employeeId').lean();
  let maxNum = 0;
  for (const emp of employees) {
    const match = String(emp.employeeId || '').match(/^EMP-(\d+)$/i);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `EMP-${String(maxNum + 1).padStart(4, '0')}`;
}

function startOfDay(d) {
  return startOfDayInAppTz(d || new Date());
}

function endOfDay(d) {
  const end = endOfDayInAppTz(d || new Date());
  end.setMilliseconds(999);
  return end;
}

function dayName(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: APP_TIMEZONE,
  });
}

function calcLeaveDays(fromDate, toDate) {
  const start = startOfDay(fromDate);
  const end = startOfDay(toDate);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 1);
}

function formatTimeHHMM(date) {
  return formatTimeHHMMInAppTz(date);
}

function getLocalDateKey(date = new Date()) {
  return getDateKeyInAppTz(date);
}

module.exports = {
  generateNextEmployeeId,
  startOfDay,
  endOfDay,
  dayName,
  calcLeaveDays,
  formatTimeHHMM,
  getLocalDateKey,
};
