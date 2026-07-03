const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const Holiday = require('../models/Holiday');
const { dedupeHolidaysByDate } = require('../utils/holidayUtils');
const { startOfDay, endOfDay } = require('../utils/employeeId');

async function getDashboardStats() {
  const today = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [
    totalEmployees,
    presentToday,
    absentToday,
    onLeaveToday,
    monthlyPayrollAgg,
    pendingLeaves,
    attendanceTrend,
    departmentDistribution,
    recentLeaves,
    upcomingHolidays,
    newEmployees,
    birthdays,
  ] = await Promise.all([
    Employee.countDocuments({ status: { $in: ['Active', 'On Leave'] } }),
    Attendance.countDocuments({ date: { $gte: today, $lte: todayEnd }, status: 'Present' }),
    Attendance.countDocuments({ date: { $gte: today, $lte: todayEnd }, status: 'Absent' }),
    Leave.countDocuments({
      status: 'Approved',
      fromDate: { $lte: todayEnd },
      toDate: { $gte: today },
    }),
    Payroll.aggregate([
      { $match: { month, year } },
      { $group: { _id: null, total: { $sum: '$netSalary' } } },
    ]),
    Leave.countDocuments({ status: 'Pending' }),
    getAttendanceTrend(14),
    getDepartmentDistribution(),
    getRecentLeaves(8),
    getUpcomingHolidays(6),
    getNewEmployees(5),
    getBirthdayReminders(5),
  ]);

  return {
    kpis: {
      totalEmployees,
      presentToday,
      absentToday,
      employeesOnLeave: onLeaveToday,
      monthlyPayroll: monthlyPayrollAgg[0]?.total || 0,
      pendingLeaveRequests: pendingLeaves,
    },
    attendanceTrend,
    departmentDistribution,
    recentLeaveApplications: recentLeaves,
    upcomingHolidays,
    newEmployees,
    birthdayReminders: birthdays,
  };
}

async function getAttendanceTrend(days) {
  const result = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = startOfDay(d);
    const end = endOfDay(d);
    const [present, absent, leave] = await Promise.all([
      Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Present' }),
      Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Absent' }),
      Attendance.countDocuments({ date: { $gte: start, $lte: end }, status: 'Leave' }),
    ]);
    result.push({
      date: start.toISOString().slice(0, 10),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      present,
      absent,
      leave,
    });
  }
  return result;
}

async function getDepartmentDistribution() {
  const rows = await Employee.aggregate([
    { $match: { status: { $in: ['Active', 'On Leave'] } } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ name: r._id || 'Unassigned', value: r.count }));
}

async function getRecentLeaves(limit) {
  return Leave.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('employee', 'employeeId firstName lastName department')
    .lean();
}

async function getUpcomingHolidays(limit) {
  const today = startOfDay(new Date());
  const rows = await Holiday.find({ date: { $gte: today }, status: 'Active' })
    .sort({ date: 1 })
    .limit(limit * 4)
    .lean();
  return dedupeHolidaysByDate(rows).slice(0, limit);
}

async function getNewEmployees(limit) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return Employee.find({ joiningDate: { $gte: thirtyDaysAgo }, status: 'Active' })
    .sort({ joiningDate: -1 })
    .limit(limit)
    .select('employeeId firstName lastName department designation joiningDate photo')
    .lean();
}

async function getBirthdayReminders(limit) {
  const employees = await Employee.find({
    status: 'Active',
    'personalInfo.dateOfBirth': { $exists: true, $ne: null },
  })
    .select('employeeId firstName lastName department personalInfo.dateOfBirth photo')
    .lean();

  const today = new Date();
  const currentYear = today.getFullYear();

  const upcoming = employees
    .map((emp) => {
      const dob = new Date(emp.personalInfo.dateOfBirth);
      let nextBirthday = new Date(currentYear, dob.getMonth(), dob.getDate());
      if (nextBirthday < startOfDay(today)) {
        nextBirthday = new Date(currentYear + 1, dob.getMonth(), dob.getDate());
      }
      const daysUntil = Math.ceil((nextBirthday - today) / (1000 * 60 * 60 * 24));
      return { ...emp, nextBirthday, daysUntil };
    })
    .filter((e) => e.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, limit);

  return upcoming;
}

module.exports = { getDashboardStats };
