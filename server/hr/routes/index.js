const express = require('express');
const router = express.Router();

const dashboardRoutes = require('./dashboard');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const leavesRoutes = require('./leaves');
const payrollRoutes = require('./payroll');
const holidaysRoutes = require('./holidays');
const employeeDashboardRoutes = require('./employeeDashboard');
const tasksRoutes = require('./tasks');
const workLogsRoutes = require('./workLogs');
const chatRoutes = require('./chat');

router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/office-locations', require('./officeLocations'));
router.use('/leaves', leavesRoutes);
router.use('/payroll', payrollRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/masters', require('./hrMasters'));
router.use('/employee-dashboard', employeeDashboardRoutes);
router.use('/tasks', tasksRoutes);
router.use('/work-logs', workLogsRoutes);
router.use('/chat', chatRoutes);

module.exports = router;
