const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

// GET all users (password omitted via toJSON)
router.get('/', requirePermission('users.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    const populateOpts = [
      { path: 'roles', select: 'name code' },
      { path: 'groups', select: 'name code' }
    ];
    if (page || limit) {
      const result = await paginate(User, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { username: 1 },
        populate: populateOpts
      });
      res.json(result);
    } else {
      const users = await User.find(query)
        .populate('roles', 'name code')
        .populate('groups', 'name code')
        .sort({ username: 1 })
        .lean();
      const safe = users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
      res.json(safe);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single user
router.get('/:id', requirePermission('users.view'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('roles', 'name code')
      .populate('groups', 'name code')
      .select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create user
router.post('/', requirePermission('users.create'), async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    const populated = await User.findById(user._id)
      .populate('roles', 'name code')
      .populate('groups', 'name code')
      .select('-password');
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update user
router.put('/:id', requirePermission('users.update'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password, ...updateFields } = req.body;
    Object.assign(user, updateFields);
    if (password && String(password).trim()) {
      user.password = password;
    }
    await user.save();
    const populated = await User.findById(user._id)
      .populate('roles', 'name code')
      .populate('groups', 'name code')
      .select('-password');
    res.json(populated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE user
router.delete('/:id', requirePermission('users.delete'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
