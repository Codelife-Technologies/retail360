const express = require('express');
const router = express.Router();
const Department = require('../models/Department');
const Designation = require('../models/Designation');
const PayrollComponent = require('../models/PayrollComponent');
const Employee = require('../models/Employee');
const { seedIfEmpty, syncMissingDefaults } = require('../utils/hrMasterSeed');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchFilter(search, fields) {
  if (!search?.trim()) return {};
  const term = escapeRegex(search.trim());
  return {
    $or: fields.map((field) => ({ [field]: { $regex: term, $options: 'i' } })),
  };
}

router.get('/summary', async (req, res) => {
  try {
    await seedIfEmpty();
    const [departments, designations, payrollComponents] = await Promise.all([
      Department.countDocuments({ isActive: true }),
      Designation.countDocuments({ isActive: true }),
      PayrollComponent.countDocuments({ isActive: true }),
    ]);
    res.json({ departments, designations, payrollComponents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/seed', async (req, res) => {
  try {
    if (req.body?.force === true) {
      const added = await syncMissingDefaults();
      return res.json({ message: 'Default HR masters synced', ...added });
    }
    const seeded = await seedIfEmpty();
    res.json({ message: 'HR masters ready', ...seeded });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/departments', async (req, res) => {
  try {
    await seedIfEmpty();
    const { search, activeOnly } = req.query;
    const query = { ...buildSearchFilter(search, ['code', 'name', 'description']) };
    if (activeOnly === 'true') query.isActive = true;
    const rows = await Department.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/departments', async (req, res) => {
  try {
    const payload = {
      code: String(req.body.code || '').trim().toUpperCase(),
      name: String(req.body.name || '').trim(),
      description: String(req.body.description || '').trim(),
      isActive: req.body.isActive !== false,
      sortOrder: Number(req.body.sortOrder) || 0,
    };
    if (!payload.code || !payload.name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }
    const row = await Department.create(payload);
    res.status(201).json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Department code or name already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.put('/departments/:id', async (req, res) => {
  try {
    const payload = {};
    if (req.body.code != null) payload.code = String(req.body.code).trim().toUpperCase();
    if (req.body.name != null) payload.name = String(req.body.name).trim();
    if (req.body.description != null) payload.description = String(req.body.description).trim();
    if (req.body.isActive != null) payload.isActive = Boolean(req.body.isActive);
    if (req.body.sortOrder != null) payload.sortOrder = Number(req.body.sortOrder) || 0;
    const row = await Department.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ error: 'Department not found' });
    res.json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Department code or name already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/departments/:id', async (req, res) => {
  try {
    const row = await Department.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Department not found' });
    const inUse = await Employee.countDocuments({ department: row.name });
    if (inUse > 0) {
      row.isActive = false;
      await row.save();
      return res.json({ message: `Department deactivated (used by ${inUse} employee(s))`, row });
    }
    await row.deleteOne();
    res.json({ message: 'Department deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/designations', async (req, res) => {
  try {
    await seedIfEmpty();
    const { search, department, activeOnly } = req.query;
    const query = { ...buildSearchFilter(search, ['name', 'department', 'grade', 'description']) };
    if (department) query.department = department;
    if (activeOnly === 'true') query.isActive = true;
    const rows = await Designation.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/designations', async (req, res) => {
  try {
    const payload = {
      name: String(req.body.name || '').trim(),
      department: String(req.body.department || '').trim(),
      grade: String(req.body.grade || '').trim(),
      description: String(req.body.description || '').trim(),
      isActive: req.body.isActive !== false,
      sortOrder: Number(req.body.sortOrder) || 0,
    };
    if (!payload.name) return res.status(400).json({ error: 'Designation name is required' });
    const row = await Designation.create(payload);
    res.status(201).json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Designation already exists for this department' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.put('/designations/:id', async (req, res) => {
  try {
    const payload = {};
    if (req.body.name != null) payload.name = String(req.body.name).trim();
    if (req.body.department != null) payload.department = String(req.body.department).trim();
    if (req.body.grade != null) payload.grade = String(req.body.grade).trim();
    if (req.body.description != null) payload.description = String(req.body.description).trim();
    if (req.body.isActive != null) payload.isActive = Boolean(req.body.isActive);
    if (req.body.sortOrder != null) payload.sortOrder = Number(req.body.sortOrder) || 0;
    const row = await Designation.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ error: 'Designation not found' });
    res.json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Designation already exists for this department' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/designations/:id', async (req, res) => {
  try {
    const row = await Designation.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Designation not found' });
    const inUse = await Employee.countDocuments({ designation: row.name });
    if (inUse > 0) {
      row.isActive = false;
      await row.save();
      return res.json({ message: `Designation deactivated (used by ${inUse} employee(s))`, row });
    }
    await row.deleteOne();
    res.json({ message: 'Designation deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/payroll-components', async (req, res) => {
  try {
    await seedIfEmpty();
    const { search, category, activeOnly } = req.query;
    const query = { ...buildSearchFilter(search, ['code', 'name', 'description']) };
    if (category) query.category = category;
    if (activeOnly === 'true') query.isActive = true;
    const rows = await PayrollComponent.find(query).sort({ sortOrder: 1, name: 1 });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/payroll-components', async (req, res) => {
  try {
    const payload = {
      code: String(req.body.code || '').trim().toUpperCase(),
      name: String(req.body.name || '').trim(),
      category: req.body.category,
      calculationType: req.body.calculationType || 'fixed',
      defaultValue: Number(req.body.defaultValue) || 0,
      isStatutory: Boolean(req.body.isStatutory),
      isTaxable: req.body.isTaxable !== false,
      isActive: req.body.isActive !== false,
      description: String(req.body.description || '').trim(),
      sortOrder: Number(req.body.sortOrder) || 0,
    };
    if (!payload.code || !payload.name || !payload.category) {
      return res.status(400).json({ error: 'Code, name, and category are required' });
    }
    const row = await PayrollComponent.create(payload);
    res.status(201).json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Payroll component code already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.put('/payroll-components/:id', async (req, res) => {
  try {
    const payload = {};
    ['code', 'name', 'category', 'calculationType', 'defaultValue', 'isStatutory', 'isTaxable', 'isActive', 'description', 'sortOrder']
      .forEach((key) => {
        if (req.body[key] != null) payload[key] = req.body[key];
      });
    if (payload.code != null) payload.code = String(payload.code).trim().toUpperCase();
    if (payload.name != null) payload.name = String(payload.name).trim();
    if (payload.description != null) payload.description = String(payload.description).trim();
    if (payload.defaultValue != null) payload.defaultValue = Number(payload.defaultValue) || 0;
    if (payload.sortOrder != null) payload.sortOrder = Number(payload.sortOrder) || 0;
    if (payload.isStatutory != null) payload.isStatutory = Boolean(payload.isStatutory);
    if (payload.isTaxable != null) payload.isTaxable = Boolean(payload.isTaxable);
    if (payload.isActive != null) payload.isActive = Boolean(payload.isActive);
    const row = await PayrollComponent.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!row) return res.status(404).json({ error: 'Payroll component not found' });
    res.json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Payroll component code already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

router.delete('/payroll-components/:id', async (req, res) => {
  try {
    const row = await PayrollComponent.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Payroll component not found' });
    if (row.isStatutory) {
      row.isActive = false;
      await row.save();
      return res.json({ message: 'Statutory component deactivated (cannot delete)', row });
    }
    await row.deleteOne();
    res.json({ message: 'Payroll component deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
