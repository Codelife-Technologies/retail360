const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');
const Stock = require('../models/Stock');
const ShippingCharge = require('../models/ShippingCharge');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

// Helper function to generate shipment number
async function generateShipmentNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SHIP-${dateStr}-`;
  
  const lastShipment = await Shipment.findOne({
    shipmentNumber: { $regex: `^${prefix}` }
  }).sort({ shipmentNumber: -1 });
  
  let sequence = 1;
  if (lastShipment) {
    const lastSequence = parseInt(lastShipment.shipmentNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }
  
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// Helper function to calculate shipping cost
async function calculateShippingCostForItems(shippingChargeId, items) {
  if (!shippingChargeId || !items || items.length === 0) return 0;
  
  const charge = await ShippingCharge.findById(shippingChargeId);
  if (!charge) return 0;
  
  const totalWeight = items.reduce((sum, item) => {
    const itemWeight = item.weight || 0;
    return sum + (itemWeight * item.quantity);
  }, 0);
  
  let calculatedCharge = 0;
  if (charge.chargeType === 'perKg') {
    calculatedCharge = totalWeight * (charge.perKgRate || 0);
  } else if (charge.chargeType === 'weightRange') {
    const matchingRange = charge.weightRanges.find(range => {
      const maxWeight = range.maxWeight !== null ? range.maxWeight : Infinity;
      return totalWeight >= range.minWeight && totalWeight <= maxWeight;
    });
    if (matchingRange) calculatedCharge = matchingRange.rate;
  } else if (charge.chargeType === 'flat') {
    calculatedCharge = charge.flatRate || 0;
  }
  
  return Math.max(calculatedCharge, charge.minCharge || 0);
}

// GET all shipments
router.get('/', requirePermission('shipments.view'), async (req, res) => {
  try {
    const { fromLocation, toLocation, status, shipmentVendor, startDate, endDate, search, page, limit } = req.query;
    const query = {};
    
    if (fromLocation) {
      query.fromLocation = fromLocation;
    }
    
    if (toLocation) {
      query.toLocation = toLocation;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (shipmentVendor) {
      query.shipmentVendor = shipmentVendor;
    }
    
    if (startDate || endDate) {
      query.shipmentDate = {};
      if (startDate) {
        query.shipmentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.shipmentDate.$lte = new Date(endDate);
      }
    }
    
    if (search) {
      query.$or = [
        { shipmentNumber: { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(Shipment, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'shipmentVendor', select: 'name code' },
          { path: 'shippingCharge', select: 'name chargeType' },
          { path: 'fromLocation', select: 'name code' },
          { path: 'toLocation', select: 'name code' },
          { path: 'items.product', select: 'name sku weight' }
        ]
      });
      res.json(result);
    } else {
      const shipments = await Shipment.find(query)
        .populate('shipmentVendor', 'name code')
        .populate('shippingCharge', 'name chargeType type')
        .populate('fromLocation', 'name code')
        .populate('toLocation', 'name code')
        .populate('items.product', 'name sku weight')
        .sort({ createdAt: -1 });
      res.json(shipments);
    }
  } catch (error) {
    logger.backend.error('Error fetching shipments', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single shipment
router.get('/:id', requirePermission('shipments.view'), async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate('shipmentVendor')
      .populate('shippingCharge')
      .populate('fromLocation')
      .populate('toLocation')
      .populate('items.product');
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    res.json(shipment);
  } catch (error) {
    logger.backend.error('Error fetching shipment', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST create shipment
router.post('/', requirePermission('shipments.create'), async (req, res) => {
  try {
    const { items, fromLocation, toLocation } = req.body;
    
    // Validate stock availability at source location
    for (const item of items) {
      const stock = await Stock.findOne({
        product: item.product,
        location: fromLocation
      });
      
      if (!stock || stock.quantity < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for product ${item.product} at source location. Available: ${stock ? stock.quantity : 0}, Required: ${item.quantity}`
        });
      }
    }
    
    // Get product weights if not provided
    const Product = require('../models/Product');
    const itemsWithWeights = await Promise.all(items.map(async (item) => {
      if (!item.weight) {
        const product = await Product.findById(item.product);
        if (product && product.weight) {
          item.weight = product.weight;
        } else {
          item.weight = 0;
        }
      }
      return item;
    }));
    
    const shipmentData = {
      ...req.body,
      items: itemsWithWeights,
      shipmentNumber: await generateShipmentNumber()
    };
    
    const shipment = new Shipment(shipmentData);
    await shipment.save();
    
    // Deduct stock from source location
    for (const item of shipment.items) {
      await Stock.findOneAndUpdate(
        { product: item.product, location: shipment.fromLocation },
        { 
          $inc: { quantity: -item.quantity },
          $set: { lastUpdated: new Date() }
        },
        { upsert: false }
      );
    }
    
    // Add stock to destination location if status is 'shipped' or 'delivered'
    if (shipment.status === 'shipped' || shipment.status === 'delivered') {
      for (const item of shipment.items) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: shipment.toLocation },
          { 
            $inc: { quantity: item.quantity },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true, new: true }
        );
      }
    }
    
    const populatedShipment = await Shipment.findById(shipment._id)
      .populate('shipmentVendor', 'name code')
      .populate('shippingCharge', 'name chargeType type')
      .populate('fromLocation', 'name code')
      .populate('toLocation', 'name code')
      .populate('items.product', 'name sku weight');
    
    res.status(201).json(populatedShipment);
  } catch (error) {
    logger.backend.error('Error creating shipment', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// PUT update shipment
router.put('/:id', requirePermission('shipments.update'), async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const oldStatus = shipment.status;
    const newStatus = req.body.status;
    
    // If status is changing to 'shipped' or 'delivered', add stock to destination
    if ((oldStatus !== 'shipped' && oldStatus !== 'delivered') && 
        (newStatus === 'shipped' || newStatus === 'delivered')) {
      for (const item of shipment.items) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: shipment.toLocation },
          { 
            $inc: { quantity: item.quantity },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true, new: true }
        );
      }
    }
    
    // If status is changing from 'shipped'/'delivered' to something else, reverse stock
    if ((oldStatus === 'shipped' || oldStatus === 'delivered') && 
        (newStatus !== 'shipped' && newStatus !== 'delivered')) {
      for (const item of shipment.items) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: shipment.toLocation },
          { 
            $inc: { quantity: -item.quantity },
            $set: { lastUpdated: new Date() }
          },
          { upsert: false }
        );
      }
    }
    
    // If items are being updated, validate stock and recalculate charges
    if (req.body.items) {
      // Validate stock availability
      for (const item of req.body.items) {
        const stock = await Stock.findOne({
          product: item.product,
          location: shipment.fromLocation
        });
        
        // Calculate difference
        const oldItem = shipment.items.find(i => i.product.toString() === item.product.toString());
        const quantityDiff = item.quantity - (oldItem ? oldItem.quantity : 0);
        
        if (quantityDiff > 0 && (!stock || stock.quantity < quantityDiff)) {
          return res.status(400).json({
            error: `Insufficient stock for product ${item.product} at source location`
          });
        }
      }
      
      // Get product weights if not provided
      const Product = require('../models/Product');
      const itemsWithWeights = await Promise.all(req.body.items.map(async (item) => {
        if (!item.weight) {
          const product = await Product.findById(item.product);
          if (product && product.weight) {
            item.weight = product.weight;
          } else {
            item.weight = 0;
          }
        }
        return item;
      }));
      
      req.body.items = itemsWithWeights;
    }
    
    const updatedShipment = await Shipment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('shipmentVendor', 'name code')
      .populate('shippingCharge', 'name chargeType type')
      .populate('fromLocation', 'name code')
      .populate('toLocation', 'name code')
      .populate('items.product', 'name sku weight');
    
    res.json(updatedShipment);
  } catch (error) {
    logger.backend.error('Error updating shipment', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// DELETE shipment
router.delete('/:id', requirePermission('shipments.delete'), async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Reverse stock movements
    // Add back to source location
    for (const item of shipment.items) {
      await Stock.findOneAndUpdate(
        { product: item.product, location: shipment.fromLocation },
        { 
          $inc: { quantity: item.quantity },
          $set: { lastUpdated: new Date() }
        },
        { upsert: false }
      );
    }
    
    // Remove from destination location if it was added
    if (shipment.status === 'shipped' || shipment.status === 'delivered') {
      for (const item of shipment.items) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: shipment.toLocation },
          { 
            $inc: { quantity: -item.quantity },
            $set: { lastUpdated: new Date() }
          },
          { upsert: false }
        );
      }
    }
    
    await Shipment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Shipment deleted successfully' });
  } catch (error) {
    logger.backend.error('Error deleting shipment', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST calculate charges
router.post('/calculate-charges', requirePermission('shipments.view'), async (req, res) => {
  try {
    const { shippingChargeId, items } = req.body;
    
    if (!shippingChargeId || !items || items.length === 0) {
      return res.status(400).json({ error: 'shippingChargeId and items are required' });
    }
    
    // Get product weights if not provided
    const Product = require('../models/Product');
    const itemsWithWeights = await Promise.all(items.map(async (item) => {
      if (!item.weight && item.product) {
        const product = await Product.findById(item.product);
        if (product && product.weight) {
          item.weight = product.weight;
        } else {
          item.weight = 0;
        }
      }
      return item;
    }));
    
    const cost = await calculateShippingCostForItems(shippingChargeId, itemsWithWeights);
    
    // Calculate total weight
    const totalWeight = itemsWithWeights.reduce((sum, item) => {
      const itemWeight = item.weight || 0;
      return sum + (itemWeight * item.quantity);
    }, 0);
    
    res.json({ cost, totalWeight, items: itemsWithWeights });
  } catch (error) {
    logger.backend.error('Error calculating shipment charges', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

