const express = require('express');
const router = express.Router();
const {
  getEmployeeContext,
  getEmployeeDashboard,
} = require('../services/employeeDashboardService');

router.get('/context', async (req, res) => {
  try {
    const context = await getEmployeeContext(req.user.id);
    res.json(context);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const dashboard = await getEmployeeDashboard(req.user.id);
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
