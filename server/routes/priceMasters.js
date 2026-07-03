const express = require('express');
const router = express.Router();
const PriceMaster = require('../models/PriceMaster');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

// GET all price masters (with pagination)
router.get('/', requirePermission('priceMasters.view'), async (req, res) => {
  try {
    const { location, isActive, page, limit } = req.query;
    const query = {};

    if (location !== undefined) {
      query.location = location === '' || location === 'null' ? null : location;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const populateOpts = { path: 'location', select: 'name code city' };

    if (page || limit) {
      const result = await paginate(PriceMaster, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { minPrice: 1, createdAt: -1 },
        populate: populateOpts
      });
      res.json(result);
    } else {
      const masters = await PriceMaster.find(query)
        .populate(populateOpts)
        .sort({ minPrice: 1, createdAt: -1 });
      res.json(masters);
    }
  } catch (error) {
    logger.backend.error('Error fetching price masters', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET price masters by location
router.get('/location/:locationId', requirePermission('priceMasters.view'), async (req, res) => {
  try {
    const { locationId } = req.params;
    const loc = locationId === 'null' || locationId === 'default' ? null : locationId;
    const masters = await PriceMaster.find({
      $or: [{ location: loc }, { location: null }],
      isActive: true
    })
      .populate('location', 'name code city')
      .sort({ minPrice: 1 });
    res.json(masters);
  } catch (error) {
    logger.backend.error('Error fetching price masters by location', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST lookup - find matching master for product price and location
router.post('/lookup', requirePermission('priceMasters.view'), async (req, res) => {
  try {
    const { productPrice, locationId } = req.body;
    if (productPrice == null || productPrice === '') {
      return res.status(400).json({ error: 'productPrice is required' });
    }
    const price = parseFloat(productPrice);
    const loc = locationId && locationId !== 'null' ? locationId : null;

    const rangeMatch = {
      isActive: true,
      minPrice: { $lte: price },
      $or: [{ maxPrice: null }, { maxPrice: { $gt: price } }]
    };

    // 1. Try location-specific first
    if (loc) {
      const locationMatch = await PriceMaster.findOne({
        ...rangeMatch,
        location: loc
      })
        .populate('location', 'name code city')
        .sort({ minPrice: -1 });
      if (locationMatch) {
        return res.json(locationMatch);
      }
    }

    // 2. Fallback to default (location null)
    const defaultMatch = await PriceMaster.findOne({
      ...rangeMatch,
      location: null
    })
      .populate('location', 'name code city')
      .sort({ minPrice: -1 });

    if (!defaultMatch) {
      return res.status(404).json({ error: 'No matching price master found' });
    }
    res.json(defaultMatch);
  } catch (error) {
    logger.backend.error('Error looking up price master', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single price master
router.get('/:id', requirePermission('priceMasters.view'), async (req, res) => {
  try {
    const master = await PriceMaster.findById(req.params.id)
      .populate('location', 'name code city');
    if (!master) {
      return res.status(404).json({ error: 'Price master not found' });
    }
    res.json(master);
  } catch (error) {
    logger.backend.error('Error fetching price master', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST create price master
router.post('/', requirePermission('priceMasters.create'), async (req, res) => {
  try {
    const master = new PriceMaster(req.body);
    await master.save();
    const populated = await PriceMaster.findById(master._id)
      .populate('location', 'name code city');
    res.status(201).json(populated);
  } catch (error) {
    logger.backend.error('Error creating price master', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// PUT update price master
router.put('/:id', requirePermission('priceMasters.update'), async (req, res) => {
  try {
    const master = await PriceMaster.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('location', 'name code city');
    if (!master) {
      return res.status(404).json({ error: 'Price master not found' });
    }
    res.json(master);
  } catch (error) {
    logger.backend.error('Error updating price master', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// DELETE price master (soft delete)
router.delete('/:id', requirePermission('priceMasters.delete'), async (req, res) => {
  try {
    const master = await PriceMaster.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!master) {
      return res.status(404).json({ error: 'Price master not found' });
    }
    res.json({ message: 'Price master deactivated successfully' });
  } catch (error) {
    logger.backend.error('Error deleting price master', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
