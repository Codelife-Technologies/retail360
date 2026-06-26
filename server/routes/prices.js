const express = require('express');
const router = express.Router();
const multer = require('multer');
const Price = require('../models/Price');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');

const PRODUCT_POPULATE = { path: 'product', select: 'name title sku brandName' };
const SUPPLIER_POPULATE = { path: 'supplier', select: 'name supplierCode contactPerson' };

function buildActivePriceQuery(product, supplier, currency, excludeId) {
  const query = {
    product,
    isActive: true,
    currency: (currency || 'INR').toUpperCase(),
  };
  if (supplier) {
    query.supplier = supplier;
  } else {
    query.$or = [{ supplier: null }, { supplier: { $exists: false } }];
  }
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return query;
}

async function deactivateActivePrices({ product, supplier, currency, excludeId }) {
  await Price.updateMany(buildActivePriceQuery(product, supplier, currency, excludeId), {
    isActive: false,
  });
}

async function getLatestPoVendorPriceMap() {
  const rows = await PurchaseOrder.aggregate([
    { $match: { supplier: { $exists: true, $ne: null } } },
    { $sort: { orderDate: -1, createdAt: -1 } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { product: '$items.product', supplier: '$supplier' },
        unitPrice: { $first: '$items.unitPrice' },
        currency: { $first: '$currency' },
        poNumber: { $first: '$poNumber' },
        orderDate: { $first: '$orderDate' },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    map.set(`${row._id.product}-${row._id.supplier}`, row);
  }
  return map;
}
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET all prices with filters (with pagination)
router.get('/', async (req, res) => {
  try {
    const { product, supplier, isActive, page, limit } = req.query;
    const query = {};
    
    if (product) {
      query.product = product;
    }

    if (supplier) {
      query.supplier = supplier;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (page || limit) {
      const result = await paginate(Price, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { effectiveDate: -1 },
        populate: [PRODUCT_POPULATE, SUPPLIER_POPULATE],
      });
      res.json(result);
    } else {
      const prices = await Price.find(query)
        .populate(PRODUCT_POPULATE)
        .populate(SUPPLIER_POPULATE)
        .sort({ effectiveDate: -1 });
      res.json(prices);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET vendor catalog — every product–vendor link with quoted price
router.get('/vendor-catalog', async (req, res) => {
  try {
    const { supplier: supplierFilter, search } = req.query;
    const searchTerm = search?.trim().toLowerCase() || '';

    const [products, vendorPrices, poPriceMap] = await Promise.all([
      Product.find({ 'suppliers.0': { $exists: true } })
        .populate('suppliers.supplier', 'name supplierCode contactPerson')
        .select('name title sku suppliers unit images')
        .lean(),
      Price.find({ supplier: { $ne: null } })
        .populate(SUPPLIER_POPULATE)
        .sort({ effectiveDate: -1 })
        .lean(),
      getLatestPoVendorPriceMap(),
    ]);

    const activeVendorPriceMap = new Map();
    const latestVendorPriceMap = new Map();
    for (const price of vendorPrices) {
      const key = `${price.product}-${price.supplier?._id || price.supplier}`;
      if (!latestVendorPriceMap.has(key)) {
        latestVendorPriceMap.set(key, price);
      }
      if (price.isActive && !activeVendorPriceMap.has(key)) {
        activeVendorPriceMap.set(key, price);
      }
    }

    const rows = [];

    for (const product of products) {
      for (const link of product.suppliers || []) {
        const supplierDoc = link.supplier;
        const supplierId = supplierDoc?._id || link.supplier;
        if (!supplierId) continue;

        if (supplierFilter && String(supplierId) !== String(supplierFilter)) {
          continue;
        }

        const vendorName = supplierDoc?.name || 'Unknown vendor';
        const productTitle = product.title || product.name || 'Unknown product';
        const productSku = product.sku || '';

        if (searchTerm) {
          const haystack = `${productTitle} ${productSku} ${vendorName}`.toLowerCase();
          if (!haystack.includes(searchTerm)) continue;
        }

        const key = `${product._id}-${supplierId}`;
        const activePrice = activeVendorPriceMap.get(key);
        const latestPrice = latestVendorPriceMap.get(key);
        const poPrice = poPriceMap.get(key);

        const purchasePrice =
          activePrice?.purchasePrice ??
          latestPrice?.purchasePrice ??
          poPrice?.unitPrice ??
          null;

        let priceSource = null;
        if (activePrice?.purchasePrice != null) priceSource = 'price_master';
        else if (poPrice?.unitPrice != null) priceSource = 'purchase_order';

        rows.push({
          rowKey: key,
          priceId: activePrice?._id || latestPrice?._id || null,
          product: {
            _id: product._id,
            title: productTitle,
            name: product.name,
            sku: productSku,
            images: product.images || [],
          },
          supplier: {
            _id: supplierId,
            name: vendorName,
            supplierCode: supplierDoc?.supplierCode,
          },
          vendorSku: link.sku || '',
          vendorUnit: link.unit || product.unit || 'pcs',
          purchasePrice,
          effectiveDate: activePrice?.effectiveDate || latestPrice?.effectiveDate || poPrice?.orderDate,
          isActive: activePrice?.isActive ?? false,
          hasPriceRecord: Boolean(activePrice || latestPrice),
          priceSource,
          poNumber: poPrice?.poNumber,
          notes: activePrice?.notes || latestPrice?.notes || '',
        });
      }
    }

    rows.sort((a, b) => {
      const vendorCmp = (a.supplier?.name || '').localeCompare(b.supplier?.name || '');
      if (vendorCmp !== 0) return vendorCmp;
      return (a.product?.title || '').localeCompare(b.product?.title || '');
    });

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET current active price for a product
router.get('/product/:productId', async (req, res) => {
  try {
    const price = await Price.findOne({
      product: req.params.productId,
      isActive: true,
      $or: [{ supplier: null }, { supplier: { $exists: false } }],
    })
      .populate(PRODUCT_POPULATE);
    
    if (!price) {
      return res.status(404).json({ error: 'No active price found for this product' });
    }
    res.json(price);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET price history for a product
router.get('/product/:productId/history', async (req, res) => {
  try {
    const prices = await Price.find({ product: req.params.productId })
      .populate(PRODUCT_POPULATE)
      .populate(SUPPLIER_POPULATE)
      .sort({ effectiveDate: -1 });
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET current prices for multiple products
router.post('/bulk-current', async (req, res) => {
  try {
    const { productIds, currency } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: 'productIds must be an array' });
    }

    const query = {
      product: { $in: productIds },
      isActive: true,
      $or: [{ supplier: null }, { supplier: { $exists: false } }],
    };
    if (currency) {
      query.currency = currency.toUpperCase();
    }
    
    const prices = await Price.find(query)
      .populate(PRODUCT_POPULATE);
    
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create new price (deactivates old active price)
router.post('/', async (req, res) => {
  try {
    const { product, supplier, purchasePrice, salesPrice, currency, effectiveDate, notes, isActive } = req.body;
    
    const activeFlag = isActive !== undefined ? isActive : true;
    if (activeFlag) {
      await deactivateActivePrices({
        product,
        supplier: supplier || null,
        currency: currency || 'INR',
      });
    }
    
    const price = new Price({
      product,
      supplier: supplier || undefined,
      purchasePrice,
      salesPrice: salesPrice ?? purchasePrice ?? 0,
      currency: currency || 'INR',
      effectiveDate: effectiveDate || new Date(),
      isActive: activeFlag,
      notes
    });
    
    await price.save();
    
    const populatedPrice = await Price.findById(price._id)
      .populate(PRODUCT_POPULATE)
      .populate(SUPPLIER_POPULATE);
    
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
router.put('/:id', async (req, res) => {
  try {
    const { purchasePrice, salesPrice, currency, effectiveDate, isActive, notes, supplier } = req.body;
    
    const existingPrice = await Price.findById(req.params.id);
    if (!existingPrice) {
      return res.status(404).json({ error: 'Price not found' });
    }

    if (isActive === true) {
      await deactivateActivePrices({
        product: existingPrice.product,
        supplier: supplier !== undefined ? supplier : existingPrice.supplier,
        currency: currency || existingPrice.currency,
        excludeId: req.params.id,
      });
    }
    
    const updateData = {};
    if (purchasePrice !== undefined) updateData.purchasePrice = purchasePrice;
    if (salesPrice !== undefined) updateData.salesPrice = salesPrice;
    if (currency !== undefined) updateData.currency = currency;
    if (effectiveDate !== undefined) updateData.effectiveDate = effectiveDate;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (notes !== undefined) updateData.notes = notes;
    if (supplier !== undefined) updateData.supplier = supplier || undefined;
    
    const price = await Price.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate(PRODUCT_POPULATE)
      .populate(SUPPLIER_POPULATE);
    
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
router.delete('/:id', async (req, res) => {
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
router.post('/bulk', async (req, res) => {
  try {
    const { prices } = req.body; // Array of { product, purchasePrice, salesPrice, ... }
    
    if (!Array.isArray(prices)) {
      return res.status(400).json({ error: 'prices must be an array' });
    }
    
    const results = [];
    
    for (const priceData of prices) {
      try {
        // Deactivate old active prices for this product
        await deactivateActivePrices({
          product: priceData.product,
          supplier: priceData.supplier || null,
          currency: priceData.currency || 'INR',
        });
        
        const price = new Price({
          product: priceData.product,
          supplier: priceData.supplier || undefined,
          purchasePrice: priceData.purchasePrice,
          salesPrice: priceData.salesPrice,
          currency: priceData.currency || 'INR',
          effectiveDate: priceData.effectiveDate || new Date(),
          isActive: true,
          notes: priceData.notes
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
router.get('/template', (req, res) => {
  try {
    const headers = [
      { key: 'product', label: 'Product SKU/Name *' },
      { key: 'vendor', label: 'Vendor Name' },
      { key: 'purchasePrice', label: 'Vendor Price *' },
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
router.post('/import', upload.single('file'), async (req, res) => {
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
        const vendorName = (row['Vendor Name'] || '').trim();
        const purchasePrice = row['Vendor Price *'] != null && row['Vendor Price *'] !== ''
          ? parseFloat(row['Vendor Price *'])
          : row['Vendor Price (Purchase)'] != null && row['Vendor Price (Purchase)'] !== ''
            ? parseFloat(row['Vendor Price (Purchase)'])
            : row['Purchase Price'] != null && row['Purchase Price'] !== ''
              ? parseFloat(row['Purchase Price'])
              : undefined;
        const currency = row['Currency'] || 'INR';
        const effectiveDate = row['Effective Date'] ? new Date(row['Effective Date']) : new Date();
        const isActive = row['Is Active'] === 'true' || row['Is Active'] === true || row['Is Active'] === 'TRUE';

        if (!productSku || purchasePrice == null || isNaN(purchasePrice)) {
          errors.push({ row: rowNum, field: 'product/purchasePrice', message: 'Product and Vendor Price are required', data: row });
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

        let supplierId;
        if (vendorName) {
          const supplier = await Supplier.findOne({
            name: { $regex: new RegExp(`^${vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          });
          if (!supplier) {
            errors.push({ row: rowNum, field: 'vendor', message: `Vendor not found: ${vendorName}`, data: row });
            failed++;
            continue;
          }
          supplierId = supplier._id;
        }

        if (isActive) {
          await deactivateActivePrices({
            product: product._id,
            supplier: supplierId || null,
            currency,
          });
        }

        const priceData = {
          product: product._id,
          supplier: supplierId,
          purchasePrice,
          salesPrice: purchasePrice,
          currency: currency,
          effectiveDate: effectiveDate,
          isActive: isActive
        };

        // Create new price record
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

