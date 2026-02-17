const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requirePermission } = require('../middleware/auth');

// POST - Log frontend error (any authenticated user can log their session errors)
router.post('/frontend', (req, res) => {
  try {
    const { level = 'error', message, details = {} } = req.body;
    
    // Add browser/user info if available
    const logDetails = {
      ...details,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      url: details.url || 'unknown'
    };
    
    if (level === 'error') {
      logger.frontend.error(message, logDetails);
    } else if (level === 'warn') {
      logger.frontend.warn(message, logDetails);
    } else {
      logger.frontend.info(message, logDetails);
    }
    
    res.json({ success: true, message: 'Error logged successfully' });
  } catch (error) {
    console.error('Error logging frontend error:', error);
    res.status(500).json({ error: 'Failed to log error' });
  }
});

// GET - Get logs
router.get('/', requirePermission('logs.view'), (req, res) => {
  try {
    const { type = 'backend', lines = 100 } = req.query;
    const logs = logger.getLogs(type, parseInt(lines));
    res.json({ logs, type, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - Clear logs
router.delete('/', requirePermission('logs.delete'), (req, res) => {
  try {
    const { type = 'backend' } = req.query;
    logger.clearLogs(type);
    res.json({ success: true, message: `Logs cleared for ${type}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

