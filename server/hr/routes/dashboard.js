const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../services/hrDashboardService');

router.get('/', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
