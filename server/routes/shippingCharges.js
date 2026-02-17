const express = require('express');
const router = express.Router();
const multer = require('multer');
const ShippingCharge = require('../models/ShippingCharge');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper function to calculate shipping cost
function calculateShippingCost(charge, totalWeight) {
  if (!charge || totalWeight <= 0) return 0;
  
  let calculatedCharge = 0;
  
  if (charge.chargeType === 'perKg') {
    calculatedCharge = totalWeight * (charge.perKgRate || 0);
  } else if (charge.chargeType === 'weightRange') {
    // Find matching weight range
    const matchingRange = charge.weightRanges.find(range => {
      const maxWeight = range.maxWeight !== null ? range.maxWeight : Infinity;
      return totalWeight >= range.minWeight && totalWeight <= maxWeight;
    });
    
    if (matchingRange) {
      calculatedCharge = matchingRange.rate;
    }
  } else if (charge.chargeType === 'flat') {
    calculatedCharge = charge.flatRate || 0;
  }
  
  // Apply minimum charge
  return Math.max(calculatedCharge, charge.minCharge || 0);
}

// GET all charges (with pagination)
router.get('/', requirePermission('shippingCharges.view'), async (req, res) => {
  try {
    const { shipmentVendor, isActive, page, limit } = req.query;
    const query = {};
    
    if (shipmentVendor) {
      query.shipmentVendor = shipmentVendor;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (page || limit) {
      const result = await paginate(ShippingCharge, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: { path: 'shipmentVendor', select: 'name code' }
      });
      res.json(result);
    } else {
      const charges = await ShippingCharge.find(query)
        .populate('shipmentVendor', 'name code')
        .sort({ createdAt: -1 });
      res.json(charges);
    }
  } catch (error) {
    logger.backend.error('Error fetching shipping charges', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET charges by vendor
router.get('/vendor/:vendorId', requirePermission('shippingCharges.view'), async (req, res) => {
  try {
    const charges = await ShippingCharge.find({ 
      shipmentVendor: req.params.vendorId,
      isActive: true 
    })
      .populate('shipmentVendor', 'name code')
      .sort({ effectiveDate: -1 });
    res.json(charges);
  } catch (error) {
    logger.backend.error('Error fetching shipping charges by vendor', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single charge
router.get('/:id', requirePermission('shippingCharges.view'), async (req, res) => {
  try {
    const charge = await ShippingCharge.findById(req.params.id)
      .populate('shipmentVendor');
    if (!charge) {
      return res.status(404).json({ error: 'Shipping charge not found' });
    }
    res.json(charge);
  } catch (error) {
    logger.backend.error('Error fetching shipping charge', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST create charge
router.post('/', requirePermission('shippingCharges.create'), async (req, res) => {
  try {
    const charge = new ShippingCharge(req.body);
    await charge.save();
    const populatedCharge = await ShippingCharge.findById(charge._id)
      .populate('shipmentVendor', 'name code');
    res.status(201).json(populatedCharge);
  } catch (error) {
    logger.backend.error('Error creating shipping charge', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// PUT update charge
router.put('/:id', requirePermission('shippingCharges.update'), async (req, res) => {
  try {
    const charge = await ShippingCharge.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('shipmentVendor', 'name code');
    if (!charge) {
      return res.status(404).json({ error: 'Shipping charge not found' });
    }
    res.json(charge);
  } catch (error) {
    logger.backend.error('Error updating shipping charge', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// DELETE charge (soft delete)
router.delete('/:id', requirePermission('shippingCharges.delete'), async (req, res) => {
  try {
    const charge = await ShippingCharge.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!charge) {
      return res.status(404).json({ error: 'Shipping charge not found' });
    }
    res.json({ message: 'Shipping charge deactivated successfully' });
  } catch (error) {
    logger.backend.error('Error deleting shipping charge', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST calculate shipping cost
router.post('/calculate', requirePermission('shippingCharges.view'), async (req, res) => {
  try {
    const { shippingChargeId, totalWeight } = req.body;
    
    if (!shippingChargeId || !totalWeight) {
      return res.status(400).json({ error: 'shippingChargeId and totalWeight are required' });
    }
    
    const charge = await ShippingCharge.findById(shippingChargeId);
    if (!charge) {
      return res.status(404).json({ error: 'Shipping charge not found' });
    }
    
    const cost = calculateShippingCost(charge, totalWeight);
    res.json({ cost, charge });
  } catch (error) {
    logger.backend.error('Error calculating shipping cost', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

