const express = require('express');
const router = express.Router();
const Unit = require('../models/Unit');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const DEFAULT_UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'pack', 'pair', 'dozen', 'metre'];

// Seed default units if none exist
async function seedDefaultUnits() {
  const count = await Unit.countDocuments();
  if (count === 0) {
    for (const name of DEFAULT_UNITS) {
      await Unit.findOneAndUpdate(
        { name },
        { name, code: name.toUpperCase() },
        { upsert: true, new: true }
      );
    }
    logger.backend.info('Seeded default units', { count: DEFAULT_UNITS.length });
  }
}

// GET all units (with pagination)
router.get('/', requirePermission('units.view'), async (req, res) => {
  try {
    await seedDefaultUnits();
    const { search, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(Unit, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { name: 1 }
      });
      res.json(result);
    } else {
      const units = await Unit.find(query).sort({ name: 1 });
      res.json(units);
    }
  } catch (error) {
    logger.backend.error('Error fetching units', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single unit
router.get('/:id', requirePermission('units.view'), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    res.json(unit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create unit
router.post('/', requirePermission('units.create'), async (req, res) => {
  try {
    const unit = new Unit(req.body);
    await unit.save();
    res.status(201).json(unit);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Unit with this name already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update unit
router.put('/:id', requirePermission('units.update'), async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    res.json(unit);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Unit with this name already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE unit
router.delete('/:id', requirePermission('units.delete'), async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    
    const productCount = await Product.countDocuments({ unit: unit.name });
    if (productCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete unit. It is used by ${productCount} product(s).` 
      });
    }
    
    await Unit.findByIdAndDelete(req.params.id);
    res.json({ message: 'Unit deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
