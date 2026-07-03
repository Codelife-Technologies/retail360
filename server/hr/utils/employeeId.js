const Employee = require('../models/Employee');

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
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(d) {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
  return date;
}

function dayName(date) {
  return new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
}

function calcLeaveDays(fromDate, toDate) {
  const start = startOfDay(fromDate);
  const end = startOfDay(toDate);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(diff, 1);
}

module.exports = { generateNextEmployeeId, startOfDay, endOfDay, dayName, calcLeaveDays };
