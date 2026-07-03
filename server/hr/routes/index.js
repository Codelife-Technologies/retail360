const express = require('express');
const router = express.Router();

const dashboardRoutes = require('./dashboard');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const leavesRoutes = require('./leaves');
const payrollRoutes = require('./payroll');
const holidaysRoutes = require('./holidays');

router.use('/dashboard', dashboardRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leavesRoutes);
router.use('/payroll', payrollRoutes);
router.use('/holidays', holidaysRoutes);

module.exports = router;
