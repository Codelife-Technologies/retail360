const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');
const { logFromRequest } = require('../utils/activityLogService');

// GET all roles
router.get('/', requirePermission('roles.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    const populateOpts = { path: 'permissions', select: 'name code module' };
    if (page || limit) {
      const result = await paginate(Role, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { name: 1 },
        populate: populateOpts
      });
      res.json(result);
    } else {
      const roles = await Role.find(query)
        .populate(populateOpts)
        .sort({ name: 1 });
      res.json(roles);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single role
router.get('/:id', requirePermission('roles.view'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id)
      .populate('permissions', 'name code module');
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json(role);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create role
router.post('/', requirePermission('roles.create'), async (req, res) => {
  try {
    const role = new Role(req.body);
    await role.save();
    const populated = await Role.findById(role._id).populate('permissions', 'name code module');
    await logFromRequest(req, {
      action: 'role.create',
      module: 'roles',
      targetType: 'role',
      targetId: role._id,
      targetLabel: role.name || role.code,
      summary: `Created role "${role.name || role.code}"`,
    });
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update role
router.put('/:id', requirePermission('roles.update'), async (req, res) => {
  try {
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('permissions', 'name code module');
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    await logFromRequest(req, {
      action: 'role.update',
      module: 'roles',
      targetType: 'role',
      targetId: role._id,
      targetLabel: role.name || role.code,
      summary: `Updated role "${role.name || role.code}"`,
      changes: {
        name: role.name,
        code: role.code,
        permissions: (role.permissions || []).map((p) => p.code || p._id),
      },
    });
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE role
router.delete('/:id', requirePermission('roles.delete'), async (req, res) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    await logFromRequest(req, {
      action: 'role.delete',
      module: 'roles',
      targetType: 'role',
      targetId: role._id,
      targetLabel: role.name || role.code,
      summary: `Deleted role "${role.name || role.code}"`,
    });
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
