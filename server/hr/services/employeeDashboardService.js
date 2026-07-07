const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const EmployeeTask = require('../models/EmployeeTask');
const { getEmployeeLeaveBalances } = require('./leaveBalanceService');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const { getEmployeeIdForUser } = require('../utils/attendanceAccess');

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
      attendanceSummary: { present: 0, absent: 0, late: 0, leave: 0 },
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

  const [
    todayAttendance,
    tasksToday,
    recentLeaves,
    latestPayroll,
    leaveBalances,
    present,
    absent,
    late,
    leaveCount,
  ] = await Promise.all([
    Attendance.findOne({
      employee: employeeId,
      date: { $gte: todayStart, $lte: todayEnd },
    }).lean(),
    EmployeeTask.find({
      employee: employeeId,
      dueDate: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: 'Completed' },
    })
      .sort({ priority: -1, createdAt: 1 })
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
  ]);

  return {
    linked: true,
    employee: context.employee,
    todayAttendance,
    tasksToday,
    recentLeaves,
    latestPayroll,
    leaveBalances,
    attendanceSummary: {
      present,
      absent,
      late,
      leave: leaveCount,
      month,
      year,
    },
  };
}

module.exports = {
  getEmployeeContext,
  getEmployeeDashboard,
};
