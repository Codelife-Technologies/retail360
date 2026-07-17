const express = require('express');
const router = express.Router();
const multer = require('multer');
const Shipment = require('../models/Shipment');
const Stock = require('../models/Stock');
const ShippingCharge = require('../models/ShippingCharge');
const ShipmentVendor = require('../models/ShipmentVendor');
const Location = require('../models/Location');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');
const { parseExcel, buildImportErrorSummary } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

function pickCell(row, ...keys) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function parseDateCell(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function normalizeShipmentImportRow(row) {
  const sku = pickCell(row, 'SKU *', 'SKU', 'Product SKU');
  const quantity = Number(pickCell(row, 'Quantity *', 'Quantity'));
  const vendorCode = pickCell(row, 'Vendor Code', 'Shipment Vendor Code');
  const vendorName = pickCell(row, 'Vendor Name *', 'Vendor Name', 'Shipment Vendor');
  const chargeName = pickCell(row, 'Shipping Charge *', 'Shipping Charge', 'Charge Name');
  const fromCode = pickCell(row, 'From Location Code', 'From Code');
  const fromName = pickCell(row, 'From Location *', 'From Location');
  const toCode = pickCell(row, 'To Location Code', 'To Code');
  const toName = pickCell(row, 'To Location *', 'To Location');

  const product = await Product.findOne({
    $or: [{ sku }, { name: sku }],
  }).select('_id sku name weight');
  if (!product) throw new Error(`Product not found for SKU ${sku || '(blank)'}`);

  let vendor = null;
  if (vendorCode) {
    vendor = await ShipmentVendor.findOne({ code: vendorCode });
  }
  if (!vendor && vendorName) {
    vendor = await ShipmentVendor.findOne({ name: vendorName });
  }
  if (!vendor) throw new Error(`Shipment vendor not found for ${vendorCode || vendorName || '(blank)'}`);

  let fromLocation = null;
  if (fromCode) fromLocation = await Location.findOne({ code: fromCode });
  if (!fromLocation && fromName) fromLocation = await Location.findOne({ name: fromName });
  if (!fromLocation) throw new Error(`From location not found for ${fromCode || fromName || '(blank)'}`);

  let toLocation = null;
  if (toCode) toLocation = await Location.findOne({ code: toCode });
  if (!toLocation && toName) toLocation = await Location.findOne({ name: toName });
  if (!toLocation) throw new Error(`To location not found for ${toCode || toName || '(blank)'}`);

  const shippingCharge = await ShippingCharge.findOne({
    shipmentVendor: vendor._id,
    name: chargeName,
  }).select('_id');
  if (!shippingCharge) throw new Error(`Shipping charge not found for ${chargeName || '(blank)'}`);

  return {
    shipmentKey: pickCell(row, 'Shipment Number', 'Shipment Ref', 'Shipment Group') || null,
    shipmentDate: parseDateCell(pickCell(row, 'Shipment Date *', 'Shipment Date')) || new Date(),
    expectedDeliveryDate: parseDateCell(pickCell(row, 'Expected Delivery Date', 'Expected Delivery')),
    status: pickCell(row, 'Status') || 'pending',
    trackingNumber: pickCell(row, 'Tracking Number', 'Tracking #'),
    notes: pickCell(row, 'Notes'),
    shipmentVendor: vendor._id,
    shippingCharge: shippingCharge._id,
    fromLocation: fromLocation._id,
    toLocation: toLocation._id,
    item: {
      product: product._id,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      weight: Number(product.weight) || 0,
    },
  };
}

async function validateShipmentItemsStock(items, fromLocation) {
  for (const item of items) {
    const stock = await Stock.findOne({ product: item.product, location: fromLocation });
    if (!stock || stock.quantity < item.quantity) {
      throw new Error(`Insufficient stock for product ${item.product}. Available: ${stock ? stock.quantity : 0}, Required: ${item.quantity}`);
    }
  }
}

// GET shipment import template
router.get('/template', requirePermission('shipments.view'), (req, res) => {
  try {
    const headers = [
      { key: 'shipmentNumber', label: 'Shipment Number' },
      { key: 'vendorCode', label: 'Vendor Code' },
      { key: 'vendorName', label: 'Vendor Name *' },
      { key: 'shippingCharge', label: 'Shipping Charge *' },
      { key: 'fromLocationCode', label: 'From Location Code' },
      { key: 'fromLocation', label: 'From Location *' },
      { key: 'toLocationCode', label: 'To Location Code' },
      { key: 'toLocation', label: 'To Location *' },
      { key: 'shipmentDate', label: 'Shipment Date *' },
      { key: 'expectedDeliveryDate', label: 'Expected Delivery Date' },
      { key: 'sku', label: 'SKU *' },
      { key: 'quantity', label: 'Quantity *' },
      { key: 'status', label: 'Status' },
      { key: 'trackingNumber', label: 'Tracking Number' },
      { key: 'notes', label: 'Notes' },
    ];

    const sampleData = [
      {
        shipmentNumber: 'SHIP-20260716-001',
        vendorCode: 'DELHIVERY',
        vendorName: 'Delhivery',
        shippingCharge: 'Standard Outward',
        fromLocationCode: 'WH-NDLS',
        fromLocation: 'Noida Warehouse',
        toLocationCode: 'STORE-GGN',
        toLocation: 'Gurgaon Store',
        shipmentDate: '2026-07-16',
        expectedDeliveryDate: '2026-07-18',
        sku: 'SKU-001',
        quantity: 12,
        status: 'preparing',
        trackingNumber: 'TRK123456',
        notes: 'Add one row per SKU. Same shipment number groups multiple rows into one shipment.',
      },
      {
        shipmentNumber: 'SHIP-20260716-001',
        vendorCode: 'DELHIVERY',
        vendorName: 'Delhivery',
        shippingCharge: 'Standard Outward',
        fromLocationCode: 'WH-NDLS',
        fromLocation: 'Noida Warehouse',
        toLocationCode: 'STORE-GGN',
        toLocation: 'Gurgaon Store',
        shipmentDate: '2026-07-16',
        expectedDeliveryDate: '2026-07-18',
        sku: 'SKU-002',
        quantity: 4,
        status: 'preparing',
        trackingNumber: 'TRK123456',
        notes: 'Second SKU line for the same shipment.',
      },
    ];

    const buffer = generateTemplate(headers, sampleData, {
      instructions: [
        'Use one row per SKU in a shipment.',
        'Rows with the same Shipment Number are grouped into one shipment with multiple SKU lines.',
        'If Shipment Number is blank, a new shipment is created for that row.',
        'Required columns: Vendor Name, Shipping Charge, From Location, To Location, Shipment Date, SKU, Quantity.',
      ],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=shipments_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// POST import shipments from Excel
router.post('/import', requirePermission('shipments.create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mode = 'both' } = req.body;
    const rows = parseExcel(req.file.buffer);
    if (!rows.length) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    const grouped = new Map();
    let imported = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const normalized = await normalizeShipmentImportRow(row);
        if (!normalized.item.quantity) {
          errors.push({ row: rowNum, field: 'Quantity', message: 'Quantity must be greater than zero' });
          failed += 1;
          continue;
        }

        const groupKey = normalized.shipmentKey || `__new__${rowNum}`;
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            ...normalized,
            items: [normalized.item],
            rowNums: [rowNum],
          });
        } else {
          const group = grouped.get(groupKey);
          group.items.push(normalized.item);
          group.rowNums.push(rowNum);
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message });
        failed += 1;
      }
    }

    for (const [groupKey, group] of grouped.entries()) {
      try {
        const existing = group.shipmentKey
          ? await Shipment.findOne({ shipmentNumber: group.shipmentKey })
          : null;

        if (existing && mode === 'create') {
          errors.push({
            row: group.rowNums[0],
            field: 'Shipment Number',
            message: `Shipment ${group.shipmentKey} already exists`,
          });
          failed += group.rowNums.length;
          continue;
        }

        if (!existing && mode === 'update') {
          errors.push({
            row: group.rowNums[0],
            field: 'Shipment Number',
            message: `Shipment ${group.shipmentKey || '(blank)'} not found for update`,
          });
          failed += group.rowNums.length;
          continue;
        }

        await validateShipmentItemsStock(group.items, group.fromLocation);

        const shipmentData = {
          shipmentVendor: group.shipmentVendor,
          shippingCharge: group.shippingCharge,
          fromLocation: group.fromLocation,
          toLocation: group.toLocation,
          shipmentDate: group.shipmentDate,
          expectedDeliveryDate: group.expectedDeliveryDate || undefined,
          items: group.items,
          status: group.status || 'pending',
          trackingNumber: group.trackingNumber,
          notes: group.notes,
        };

        if (existing) {
          await Shipment.findByIdAndUpdate(existing._id, shipmentData, { runValidators: true });
          updated += 1;
        } else {
          const shipment = new Shipment({
            ...shipmentData,
            shipmentNumber: group.shipmentKey || await generateShipmentNumber(),
          });
          await shipment.save();

          for (const item of shipment.items) {
            await Stock.findOneAndUpdate(
              { product: item.product, location: shipment.fromLocation },
              { $inc: { quantity: -item.quantity }, $set: { lastUpdated: new Date() } },
              { upsert: false }
            );
          }

          if (shipment.status === 'shipped' || shipment.status === 'delivered') {
            for (const item of shipment.items) {
              await Stock.findOneAndUpdate(
                { product: item.product, location: shipment.toLocation },
                { $inc: { quantity: item.quantity }, $set: { lastUpdated: new Date() } },
                { upsert: true, new: true }
              );
            }
          }

          imported += 1;
        }
      } catch (error) {
        errors.push({ row: group.rowNums[0], field: 'general', message: error.message });
        failed += group.rowNums.length;
      }
    }

    res.json({
      success: true,
      imported,
      updated,
      failed,
      skipped,
      totalRows: rows.length,
      processed: imported + updated + failed,
      errors: errors.slice(0, 100),
      errorSummary: buildImportErrorSummary(errors),
    });
  } catch (error) {
    logger.backend.error('Error importing shipments', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
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

