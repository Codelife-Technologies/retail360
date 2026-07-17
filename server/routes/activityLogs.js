const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { listActivityLogs } = require('../utils/activityLogService');

// GET /api/activity-logs
router.get('/', requirePermission('logs.view'), async (req, res) => {
  try {
    const result = await listActivityLogs({
      page: req.query.page,
      limit: req.query.limit,
      module: req.query.module || undefined,
      action: req.query.action || undefined,
      search: req.query.search || undefined,
      actor: req.query.actor || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
