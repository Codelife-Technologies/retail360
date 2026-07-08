const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const Group = require('../models/Group');
const { authenticate, JWT_SECRET, getEffectivePermissions } = require('../middleware/auth');
const { findUserByLoginIdentifier } = require('../utils/userEmployeeLink');
const {
  applyLoginToAttendanceSession,
  applyLogoutToAttendanceSession,
} = require('../utils/attendanceSession');

// POST /login - no auth required
router.post('/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ error: 'Username, email, or employee name and password are required' });
    }
    const user = await findUserByLoginIdentifier(usernameOrEmail);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    applyLoginToAttendanceSession(user);
    await user.save();
    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const permissions = await getEffectivePermissions(user._id);
    const { password: _, ...safeUser } = user.toObject();
    res.json({ token, user: { ...safeUser, permissions: Array.from(permissions) } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /me - requires auth
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('roles', 'name code')
      .populate('groups', 'name code')
      .select('-password')
      .lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const permissions = await getEffectivePermissions(req.user.id);
    res.json({ ...user, permissions: Array.from(permissions) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /logout - record checkout time from app session
router.post('/logout', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    applyLogoutToAttendanceSession(user);
    await user.save();
    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /seed - create super admin if no users exist (no auth)
router.post('/seed', async (req, res) => {
  try {
    const { seedSuperAdmin } = require('../utils/seedAdmin');
    const result = await seedSuperAdmin();
    if (result.skipped) {
      return res.json({ message: 'Seed skipped - users already exist' });
    }
    res.status(201).json({
      message: 'Super admin created',
      username: result.username,
      password: result.password
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
