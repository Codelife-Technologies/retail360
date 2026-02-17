const express = require('express');
const router = express.Router();
const multer = require('multer');
const SalesLocation = require('../models/SalesLocation');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET all sales locations (with pagination)
router.get('/', requirePermission('salesLocations.view'), async (req, res) => {
  try {
    const { salesChannel, location, isActive, search, page, limit } = req.query;
    const query = {};
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    if (location) {
      query.location = location;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(SalesLocation, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'salesChannel', select: 'name code type' },
          { path: 'location', select: 'name code city' }
        ]
      });
      res.json(result);
    } else {
      const salesLocations = await SalesLocation.find(query)
        .populate('salesChannel', 'name code type')
        .populate('location', 'name code city')
        .sort({ createdAt: -1 });
      res.json(salesLocations);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET sales locations by channel
router.get('/channel/:channelId', requirePermission('salesLocations.view'), async (req, res) => {
  try {
    const salesLocations = await SalesLocation.find({ salesChannel: req.params.channelId })
      .populate('salesChannel', 'name code')
      .populate('location', 'name code city')
      .sort({ name: 1 });
    res.json(salesLocations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single sales location
router.get('/:id', requirePermission('salesLocations.view'), async (req, res) => {
  try {
    const salesLocation = await SalesLocation.findById(req.params.id)
      .populate('salesChannel', 'name code type')
      .populate('location', 'name code city address');
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json(salesLocation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create sales location
router.post('/', requirePermission('salesLocations.create'), async (req, res) => {
  try {
    const salesLocation = new SalesLocation(req.body);
    await salesLocation.save();
    
    const populated = await SalesLocation.findById(salesLocation._id)
      .populate('salesChannel', 'name code')
      .populate('location', 'name code');
    
    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    if (error.code === 11000) {
      if (error.keyPattern.code) {
        res.status(400).json({ error: 'Sales location code already exists' });
      } else {
        res.status(400).json({ error: 'This sales channel and location combination already exists' });
      }
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update sales location
router.put('/:id', requirePermission('salesLocations.update'), async (req, res) => {
  try {
    const salesLocation = await SalesLocation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('salesChannel', 'name code')
      .populate('location', 'name code');
    
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json(salesLocation);
  } catch (error) {
    console.error('Error updating sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesLocationId: req.params.id,
      body: req.body
    });
    if (error.code === 11000) {
      if (error.keyPattern.code) {
        res.status(400).json({ error: 'Sales location code already exists' });
      } else {
        res.status(400).json({ error: 'This sales channel and location combination already exists' });
      }
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE sales location (soft delete)
router.delete('/:id', requirePermission('salesLocations.delete'), async (req, res) => {
  try {
    const salesLocation = await SalesLocation.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json({ message: 'Sales location deactivated successfully', salesLocation });
  } catch (error) {
    console.error('Error deleting sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesLocationId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

