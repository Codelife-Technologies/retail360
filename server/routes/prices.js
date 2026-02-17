const express = require('express');
const router = express.Router();
const multer = require('multer');
const Price = require('../models/Price');
const Product = require('../models/Product');
const SalesChannel = require('../models/SalesChannel');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET all prices with filters (with pagination)
router.get('/', requirePermission('prices.view'), async (req, res) => {
  try {
    const { product, isActive, salesChannel, page, limit } = req.query;
    const query = {};
    
    if (product) {
      query.product = product;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (salesChannel !== undefined) {
      query.salesChannel = salesChannel === '' || salesChannel === 'null' ? null : salesChannel;
    }
    
    const populateOpts = [
      { path: 'product', select: 'name title sku brandName' },
      { path: 'salesChannel', select: 'name code country defaultCurrency' }
    ];
    
    if (page || limit) {
      const result = await paginate(Price, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { effectiveDate: -1 },
        populate: populateOpts
      });
      res.json(result);
    } else {
      const prices = await Price.find(query)
        .populate(populateOpts[0])
        .populate(populateOpts[1])
        .sort({ effectiveDate: -1 });
      res.json(prices);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET current active price for a product (optional ?salesChannel=id for channel-specific lookup)
router.get('/product/:productId', requirePermission('prices.view'), async (req, res) => {
  try {
    const { salesChannel: salesChannelParam } = req.query;
    let price = null;
    
    if (salesChannelParam && salesChannelParam !== 'null') {
      price = await Price.findOne({
        product: req.params.productId,
        salesChannel: salesChannelParam,
        isActive: true
      }).populate('product', 'name title sku').populate('salesChannel', 'name code country defaultCurrency');
    }
    if (!price) {
      price = await Price.findOne({
        product: req.params.productId,
        salesChannel: null,
        isActive: true
      }).populate('product', 'name title sku').populate('salesChannel', 'name code country defaultCurrency');
    }
    
    if (!price) {
      return res.status(404).json({ error: 'No active price found for this product' });
    }
    res.json(price);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET price history for a product (optional ?salesChannel=id to filter by channel)
router.get('/product/:productId/history', requirePermission('prices.view'), async (req, res) => {
  try {
    const { salesChannel: salesChannelParam } = req.query;
    const query = { product: req.params.productId };
    if (salesChannelParam !== undefined) {
      query.salesChannel = salesChannelParam === '' || salesChannelParam === 'null' ? null : salesChannelParam;
    }
    const prices = await Price.find(query)
      .populate('product', 'name title sku')
      .populate('salesChannel', 'name code country defaultCurrency')
      .sort({ effectiveDate: -1 });
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET current prices for multiple products (optional salesChannel in body for channel-specific prices)
router.post('/bulk-current', requirePermission('prices.view'), async (req, res) => {
  try {
    const { productIds, salesChannel } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: 'productIds must be an array' });
    }
    
    const query = {
      product: { $in: productIds },
      isActive: true
    };
    if (salesChannel !== undefined && salesChannel !== null && salesChannel !== '') {
      query.salesChannel = salesChannel;
    } else {
      query.salesChannel = null;
    }
    
    const prices = await Price.find(query)
      .populate('product', 'name title sku')
      .populate('salesChannel', 'name code country defaultCurrency');
    
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new price (deactivates old active price for same product+channel)
router.post('/', requirePermission('prices.create'), async (req, res) => {
  try {
    const { product, purchasePrice, salesPrice, mrp, currency, effectiveDate, notes, isActive, salesChannel } = req.body;
    
    const activeFlag = isActive !== undefined ? isActive : true;
    if (activeFlag) {
      const deactivateQuery = { product, isActive: true };
      deactivateQuery.salesChannel = salesChannel || null;
      await Price.updateMany(deactivateQuery, { isActive: false });
    }
    
    const price = new Price({
      product,
      purchasePrice,
      salesPrice,
      mrp: mrp != null && mrp !== '' ? parseFloat(mrp) : null,
      currency: currency || 'INR',
      effectiveDate: effectiveDate || new Date(),
      isActive: activeFlag,
      notes,
      salesChannel: salesChannel || null
    });
    
    await price.save();
    
    const populatedPrice = await Price.findById(price._id)
      .populate('product', 'name title sku')
      .populate('salesChannel', 'name code country defaultCurrency');
    
    res.status(201).json(populatedPrice);
  } catch (error) {
    console.error('Error creating price:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(400).json({ error: error.message });
  }
});

// PUT update price
router.put('/:id', requirePermission('prices.update'), async (req, res) => {
  try {
    const { purchasePrice, salesPrice, mrp, currency, effectiveDate, isActive, notes } = req.body;
    
    if (isActive === true) {
      const existingPrice = await Price.findById(req.params.id);
      if (existingPrice) {
        const deactivateQuery = {
          product: existingPrice.product,
          isActive: true,
          _id: { $ne: req.params.id }
        };
        deactivateQuery.salesChannel = existingPrice.salesChannel || null;
        await Price.updateMany(deactivateQuery, { isActive: false });
      }
    }
    
    const updateData = {};
    if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice;
    if (salesPrice !== undefined) updateData.salesPrice = salesPrice;
    if (mrp !== undefined) updateData.mrp = mrp != null && mrp !== '' ? parseFloat(mrp) : null;
    if (currency !== undefined) updateData.currency = currency;
    if (effectiveDate !== undefined) updateData.effectiveDate = effectiveDate;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (notes !== undefined) updateData.notes = notes;
    
    const price = await Price.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('product', 'name title sku')
      .populate('salesChannel', 'name code country defaultCurrency');
    
    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }
    
    res.json(price);
  } catch (error) {
    console.error('Error updating price:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      priceId: req.params.id,
      body: req.body
    });
    res.status(400).json({ error: error.message });
  }
});

// DELETE price (soft delete by setting isActive to false)
router.delete('/:id', requirePermission('prices.delete'), async (req, res) => {
  try {
    const price = await Price.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }
    
    res.json({ message: 'Price deactivated successfully', price });
  } catch (error) {
    console.error('Error deleting price:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      priceId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

// POST bulk update prices
router.post('/bulk', requirePermission('prices.update'), async (req, res) => {
  try {
    const { prices } = req.body; // Array of { product, purchasePrice, salesPrice, ... }
    
    if (!Array.isArray(prices)) {
      return res.status(400).json({ error: 'prices must be an array' });
    }
    
    const results = [];
    
    for (const priceData of prices) {
      try {
        const deactivateQuery = { product: priceData.product, isActive: true };
        deactivateQuery.salesChannel = priceData.salesChannel || null;
        await Price.updateMany(deactivateQuery, { isActive: false });
        
        const price = new Price({
          product: priceData.product,
          purchasePrice: priceData.purchasePrice,
          salesPrice: priceData.salesPrice,
          mrp: priceData.mrp != null && priceData.mrp !== '' ? parseFloat(priceData.mrp) : null,
          currency: priceData.currency || 'INR',
          effectiveDate: priceData.effectiveDate || new Date(),
          isActive: true,
          notes: priceData.notes,
          salesChannel: priceData.salesChannel || null
        });
        
        await price.save();
        results.push({ success: true, price });
      } catch (error) {
        results.push({ success: false, product: priceData.product, error: error.message });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Error bulk updating prices:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(400).json({ error: error.message });
  }
});

// GET Excel template
router.get('/template', requirePermission('prices.view'), (req, res) => {
  try {
    const headers = [
      { key: 'product', label: 'Product SKU/Name *' },
      { key: 'salesChannel', label: 'Sales Channel (code/name, blank for Default)' },
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'salesPrice', label: 'Sales Price *' },
      { key: 'mrp', label: 'MRP' },
      { key: 'currency', label: 'Currency' },
      { key: 'effectiveDate', label: 'Effective Date' },
      { key: 'isActive', label: 'Is Active' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=prices_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import prices from Excel
router.post('/import', requirePermission('prices.create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mode = 'both' } = req.body;
    const fileBuffer = req.file.buffer;
    const excelData = parseExcel(fileBuffer);
    
    if (excelData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const rowNum = i + 2;

      try {
        const productSku = row['Product SKU/Name *'] || '';
        const salesChannelCode = (row['Sales Channel (code/name, blank for Default)'] || '').trim();
        const purchasePrice = row['Purchase Price'] ? parseFloat(row['Purchase Price']) : undefined;
        const salesPrice = parseFloat(row['Sales Price *']);
        const mrp = row['MRP'] ? parseFloat(row['MRP']) : null;
        const currency = row['Currency'] || 'INR';
        const effectiveDate = row['Effective Date'] ? new Date(row['Effective Date']) : new Date();
        const isActive = row['Is Active'] === 'true' || row['Is Active'] === true || row['Is Active'] === 'TRUE';

        if (!productSku || isNaN(salesPrice)) {
          errors.push({ row: rowNum, field: 'product/salesPrice', message: 'Product and Sales Price are required', data: row });
          failed++;
          continue;
        }

        const product = await Product.findOne({
          $or: [
            { sku: productSku },
            { name: productSku }
          ]
        });

        if (!product) {
          errors.push({ row: rowNum, field: 'product', message: `Product not found: ${productSku}`, data: row });
          failed++;
          continue;
        }

        let salesChannelId = null;
        if (salesChannelCode) {
          const salesChannel = await SalesChannel.findOne({
            $or: [
              { code: { $regex: new RegExp(`^${salesChannelCode}$`, 'i') } },
              { name: { $regex: new RegExp(salesChannelCode, 'i') } }
            ]
          });
          if (!salesChannel) {
            errors.push({ row: rowNum, field: 'salesChannel', message: `Sales channel not found: ${salesChannelCode}`, data: row });
            failed++;
            continue;
          }
          salesChannelId = salesChannel._id;
        }

        const deactivateQuery = { product: product._id, isActive: true };
        deactivateQuery.salesChannel = salesChannelId;
        if (isActive) {
          await Price.updateMany(deactivateQuery, { isActive: false });
        }

        const priceData = {
          product: product._id,
          salesChannel: salesChannelId,
          purchasePrice: purchasePrice !== undefined ? purchasePrice : 0,
          salesPrice: salesPrice,
          mrp: mrp != null && !isNaN(mrp) ? mrp : null,
          currency: currency,
          effectiveDate: effectiveDate,
          isActive: isActive
        };

        const price = new Price(priceData);
        await price.save();
        imported++;
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message, data: row });
        failed++;
      }
    }

    res.json({ success: true, imported, updated, failed, errors: errors.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

