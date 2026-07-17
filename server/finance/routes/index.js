const express = require('express');
const analyticsRoutes = require('./analytics');
const expenseRoutes = require('./expenses');
const otherIncomeRoutes = require('./otherIncome');

const router = express.Router();

router.use(analyticsRoutes);
router.use('/expenses', expenseRoutes);
router.use('/other-income', otherIncomeRoutes);

module.exports = router;
