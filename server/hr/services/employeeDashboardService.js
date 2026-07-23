const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const EmployeeTask = require('../models/EmployeeTask');
const Holiday = require('../models/Holiday');
const { getEmployeeLeaveBalances } = require('./leaveBalanceService');
const { dedupeHolidaysByDate } = require('../utils/holidayUtils');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const { getEmployeeIdForUser, withComputedWorkingHours } = require('../utils/attendanceAccess');

async function countActiveHolidaysInRange(rangeStart, rangeEnd) {
  const holidays = await Holiday.find({
    date: { $gte: rangeStart, $lte: rangeEnd },
    status: 'Active',
  }).lean();
  return dedupeHolidaysByDate(holidays).length;
}

async function getEmployeeContext(userId) {
  const employeeId = await getEmployeeIdForUser(userId);
  if (!employeeId) {
    return { linked: false, employee: null, employeeId: null };
  }

  const employee = await Employee.findById(employeeId)
    .select('employeeId firstName lastName department designation email photo status')
    .lean();

  return {
    linked: Boolean(employee),
    employeeId,
    employee,
  };
}

async function getEmployeeDashboard(userId) {
  const context = await getEmployeeContext(userId);
  if (!context.linked) {
    return {
      linked: false,
      employee: null,
      todayAttendance: null,
      tasksToday: [],
      recentLeaves: [],
      latestPayroll: null,
      leaveBalances: [],
      attendanceSummary: { present: 0, absent: 0, late: 0, leave: 0, holidays: 0 },
    };
  }

  const { employeeId } = context;
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Keep overdue pending work in Backlog; same-day deadlines stay Pending
  await EmployeeTask.updateMany(
    { employee: employeeId, status: 'Pending', dueDate: { $lt: todayStart } },
    { $set: { status: 'Backlog' } }
  );
  await EmployeeTask.updateMany(
    { employee: employeeId, status: 'Backlog', dueDate: { $gte: todayStart } },
    { $set: { status: 'Pending' } }
  );

  const [
    todayAttendance,
    tasksTodayRaw,
    recentLeaves,
    latestPayroll,
    leaveBalances,
    present,
    absent,
    late,
    leaveCount,
    holidaysInMonth,
  ] = await Promise.all([
    Attendance.findOne({
      employee: employeeId,
      date: { $gte: todayStart, $lte: todayEnd },
    }).lean(),
    EmployeeTask.find({
      employee: employeeId,
      status: { $nin: ['Completed', 'Cancelled', 'On Hold'] },
      $or: [
        { status: 'Backlog' },
        { dueDate: { $gte: todayStart, $lte: todayEnd } },
        { startDate: { $lte: todayEnd }, dueDate: { $gte: todayStart } },
      ],
    })
      .sort({ dueDate: 1, priority: -1, createdAt: 1 })
      .lean(),
    Leave.find({ employee: employeeId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Payroll.findOne({ employee: employeeId })
      .sort({ year: -1, month: -1 })
      .lean(),
    getEmployeeLeaveBalances(employeeId, year),
    Attendance.countDocuments({
      employee: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: 'Present',
    }),
    Attendance.countDocuments({
      employee: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: 'Absent',
    }),
    Attendance.countDocuments({
      employee: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: 'Half Day',
    }),
    Attendance.countDocuments({
      employee: employeeId,
      date: { $gte: monthStart, $lte: monthEnd },
      status: 'Leave',
    }),
    countActiveHolidaysInRange(monthStart, monthEnd),
  ]);

  const statusOrder = { Backlog: 0, Pending: 1, 'In Progress': 2 };
  const tasksToday = [...tasksTodayRaw].sort((a, b) => {
    const aRank = statusOrder[a.status] ?? 50;
    const bRank = statusOrder[b.status] ?? 50;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });

  return {
    linked: true,
    employee: context.employee,
    todayAttendance: todayAttendance ? withComputedWorkingHours(todayAttendance) : null,
    tasksToday,
    recentLeaves,
    latestPayroll,
    leaveBalances,
    attendanceSummary: {
      present,
      absent,
      late,
      leave: leaveCount,
      holidays: holidaysInMonth,
      month,
      year,
    },
  };
}

module.exports = {
  getEmployeeContext,
  getEmployeeDashboard,
};
