const express = require('express');
const router = express.Router();
const {
  searchMentionCandidates,
  getRecentMessages,
  postMessage,
  getUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../services/employeeChatService');

router.get('/messages', async (req, res) => {
  try {
    const messages = await getRecentMessages();
    res.json(messages);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/messages', async (req, res) => {
  try {
    const { body, mentionedEmployeeIds } = req.body || {};
    const message = await postMessage(req.user.id, body, mentionedEmployeeIds);
    res.status(201).json(message);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/mention-candidates', async (req, res) => {
  try {
    const candidates = await searchMentionCandidates(req.query.search);
    res.json(candidates);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await getUnreadNotifications(req.user.id);
    res.json(notifications);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    const result = await markAllNotificationsRead(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await markNotificationRead(req.user.id, req.params.id);
    res.json(notification);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
