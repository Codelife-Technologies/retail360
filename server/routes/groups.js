const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');
const { logFromRequest } = require('../utils/activityLogService');

// GET all groups
router.get('/', requirePermission('groups.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    const populateOpts = { path: 'roles', select: 'name code' };
    if (page || limit) {
      const result = await paginate(Group, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { name: 1 },
        populate: populateOpts
      });
      res.json(result);
    } else {
      const groups = await Group.find(query)
        .populate(populateOpts)
        .sort({ name: 1 });
      res.json(groups);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single group
router.get('/:id', requirePermission('groups.view'), async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('roles', 'name code');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create group
router.post('/', requirePermission('groups.create'), async (req, res) => {
  try {
    const group = new Group(req.body);
    await group.save();
    const populated = await Group.findById(group._id).populate('roles', 'name code');
    await logFromRequest(req, {
      action: 'group.create',
      module: 'groups',
      targetType: 'group',
      targetId: group._id,
      targetLabel: group.name || group.code,
      summary: `Created group "${group.name || group.code}"`,
    });
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update group
router.put('/:id', requirePermission('groups.update'), async (req, res) => {
  try {
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('roles', 'name code');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    await logFromRequest(req, {
      action: 'group.update',
      module: 'groups',
      targetType: 'group',
      targetId: group._id,
      targetLabel: group.name || group.code,
      summary: `Updated group "${group.name || group.code}"`,
      changes: {
        name: group.name,
        code: group.code,
        roles: (group.roles || []).map((r) => r.code || r._id),
      },
    });
    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE group
router.delete('/:id', requirePermission('groups.delete'), async (req, res) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    await logFromRequest(req, {
      action: 'group.delete',
      module: 'groups',
      targetType: 'group',
      targetId: group._id,
      targetLabel: group.name || group.code,
      summary: `Deleted group "${group.name || group.code}"`,
    });
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
