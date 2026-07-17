const express = require('express');
const router = express.Router();
const Permission = require('../models/Permission');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');
const { logFromRequest } = require('../utils/activityLogService');

// GET all permissions
router.get('/', requirePermission('permissions.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { module: { $regex: search, $options: 'i' } }
      ];
    }
    if (page || limit) {
      const result = await paginate(Permission, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { module: 1, code: 1 }
      });
      res.json(result);
    } else {
      const permissions = await Permission.find(query).sort({ module: 1, code: 1 });
      res.json(permissions);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single permission
router.get('/:id', requirePermission('permissions.view'), async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    res.json(permission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create permission
router.post('/', requirePermission('permissions.create'), async (req, res) => {
  try {
    const permission = new Permission(req.body);
    await permission.save();
    await logFromRequest(req, {
      action: 'permission.create',
      module: 'permissions',
      targetType: 'permission',
      targetId: permission._id,
      targetLabel: permission.code || permission.name,
      summary: `Created permission "${permission.code || permission.name}"`,
    });
    res.status(201).json(permission);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update permission
router.put('/:id', requirePermission('permissions.update'), async (req, res) => {
  try {
    const permission = await Permission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    await logFromRequest(req, {
      action: 'permission.update',
      module: 'permissions',
      targetType: 'permission',
      targetId: permission._id,
      targetLabel: permission.code || permission.name,
      summary: `Updated permission "${permission.code || permission.name}"`,
    });
    res.json(permission);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE permission
router.delete('/:id', requirePermission('permissions.delete'), async (req, res) => {
  try {
    const permission = await Permission.findByIdAndDelete(req.params.id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    await logFromRequest(req, {
      action: 'permission.delete',
      module: 'permissions',
      targetType: 'permission',
      targetId: permission._id,
      targetLabel: permission.code || permission.name,
      summary: `Deleted permission "${permission.code || permission.name}"`,
    });
    res.json({ message: 'Permission deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
