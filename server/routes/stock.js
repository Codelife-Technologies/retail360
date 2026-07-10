const express = require('express');
const router = express.Router();
const multer = require('multer');
const Stock = require('../models/Stock');
const Product = require('../models/Product');
const Location = require('../models/Location');
const { paginate } = require('../utils/pagination');
const { parseExcel, buildImportErrorSummary } = require('../utils/excelParser');
const { generateTemplate, exportToExcel } = require('../utils/excelGenerator');
const logger = require('../utils/logger');
const {
  getCurrentMonthRange,
  buildSoldCurrentMonthMap,
  enrichStockWithSoldCurrentMonth,
} = require('../utils/stockSalesUtils');
const { requireAdminOrRole } = require('../middleware/auth');

const stockEditAccess = requireAdminOrRole('admin', 'warehouse');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PRODUCT_POPULATE_FIELDS = 'name title sku brandName images';

async function attachSoldCurrentMonth(stockRecords) {
  const records = Array.isArray(stockRecords) ? stockRecords : [stockRecords];
  const salesMap = await buildSoldCurrentMonthMap();
  const enriched = enrichStockWithSoldCurrentMonth(records, salesMap);
  return Array.isArray(stockRecords) ? enriched : enriched[0];
}

function aggregateStockByProduct(stockRecords = []) {
  const grouped = new Map();

  for (const record of stockRecords) {
    const productId = String(record.product?._id || record.product || '');
    if (!productId) continue;

    if (!grouped.has(productId)) {
      grouped.set(productId, {
        productId,
        product: record.product,
        totalQuantity: 0,
        totalReserved: 0,
        soldCurrentMonth: 0,
        totalMinStockLevel: 0,
        locationCount: 0,
        lastUpdated: record.lastUpdated,
        records: [],
      });
    }

    const row = grouped.get(productId);
    row.totalQuantity += record.quantity || 0;
    row.totalReserved += record.reservedQuantity || 0;
    row.soldCurrentMonth += record.soldCurrentMonth || 0;
    row.totalMinStockLevel += record.minStockLevel || 0;
    row.locationCount += 1;
    row.records.push(record);
    if (record.lastUpdated && new Date(record.lastUpdated) > new Date(row.lastUpdated || 0)) {
      row.lastUpdated = record.lastUpdated;
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    String(a.product?.title || a.product?.name || '').localeCompare(
      String(b.product?.title || b.product?.name || '')
    )
  );
}

// GET all stock with filters (with pagination)
router.get('/', async (req, res) => {
  try {
    const { product, location, page, limit } = req.query;
    const query = {};
    
    if (product) {
      query.product = product;
    }
    
    if (location) {
      query.location = location;
    }
    
    if (page || limit) {
      const result = await paginate(Stock, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'product', select: PRODUCT_POPULATE_FIELDS },
          { path: 'location', select: 'name code city' }
        ]
      });
      result.data = await attachSoldCurrentMonth(result.data);
      res.json({
        ...result,
        currentMonthLabel: getCurrentMonthRange().label,
      });
    } else {
      const stock = await Stock.find(query)
        .populate('product', PRODUCT_POPULATE_FIELDS)
        .populate('location', 'name code city')
        .sort({ createdAt: -1 });
      res.json(await attachSoldCurrentMonth(stock));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET stock by product (all locations)
router.get('/product/:productId', async (req, res) => {
  try {
    const stock = await Stock.find({ product: req.params.productId })
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .populate('location', 'name code city')
      .sort({ location: 1 });
    res.json(await attachSoldCurrentMonth(stock));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET stock by location (all products)
router.get('/location/:locationId', async (req, res) => {
  try {
    const stock = await Stock.find({ location: req.params.locationId })
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .sort({ product: 1 });
    res.json(await attachSoldCurrentMonth(stock));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET specific stock record (product + location)
router.get('/:productId/:locationId', async (req, res) => {
  try {
    const stock = await Stock.findOne({
      product: req.params.productId,
      location: req.params.locationId
    })
      .populate('product')
      .populate('location');
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock record not found' });
    }
    res.json(await attachSoldCurrentMonth(stock));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET low stock alerts
router.get('/alerts/low-stock', async (req, res) => {
  try {
    // Fetch all stock records and filter in memory to handle null values safely
    const allStock = await Stock.find({})
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .populate('location', 'name code city')
      .lean(); // Use lean() for better performance
    
    // Filter for low stock: quantity <= minStockLevel (treat null minStockLevel as 0)
    const lowStock = allStock.filter(item => {
      const quantity = item.quantity || 0;
      const minStockLevel = item.minStockLevel || 0;
      return quantity <= minStockLevel;
    });
    
    // Sort by quantity ascending
    lowStock.sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
    
    res.json(lowStock);
  } catch (error) {
    logger.backend.error('Error fetching low stock alerts', { 
      error: error.message, 
      stack: error.stack 
    });
    console.error('Low stock alerts error:', error);
    res.status(500).json({ error: error.message });
  }
});

const STOCK_EXPORT_HEADERS = [
  { key: 'product', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'location', label: 'Location' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'soldCurrentMonth', label: 'Sold (Current Month)' },
  { key: 'minStockLevel', label: 'Min Level' },
  { key: 'lastUpdated', label: 'Last Updated' },
];

const STOCK_BY_PRODUCT_EXPORT_HEADERS = [
  { key: 'product', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'locationCount', label: 'Locations' },
  { key: 'totalQuantity', label: 'Total Available' },
  { key: 'soldCurrentMonth', label: 'Sold (Current Month)' },
  { key: 'totalMinStockLevel', label: 'Min Level (Total)' },
  { key: 'lastUpdated', label: 'Last Updated' },
];

function mapStockByProductExportRows(rows = []) {
  return rows.map((row) => ({
    product: row.product?.title || row.product?.name || 'Unknown',
    sku: row.product?.sku || '',
    locationCount: row.locationCount ?? 0,
    totalQuantity: row.totalQuantity ?? 0,
    soldCurrentMonth: row.soldCurrentMonth ?? 0,
    totalMinStockLevel: row.totalMinStockLevel ?? 0,
    lastUpdated: row.lastUpdated
      ? new Date(row.lastUpdated).toISOString().slice(0, 10)
      : '',
  }));
}

function mapStockToExportRows(stockRecords = []) {
  const monthLabel = getCurrentMonthRange().label;
  return stockRecords.map((record) => ({
    product: record.product?.title || record.product?.name || 'Unknown',
    sku: record.product?.sku || '',
    location: record.location?.code
      ? `${record.location.name} (${record.location.code})`
      : (record.location?.name || ''),
    quantity: record.quantity ?? 0,
    soldCurrentMonth: record.soldCurrentMonth ?? 0,
    minStockLevel: record.minStockLevel ?? 0,
    lastUpdated: record.lastUpdated
      ? new Date(record.lastUpdated).toISOString().slice(0, 10)
      : '',
    _monthLabel: monthLabel,
  }));
}

function filterStockForExport(records, search = '') {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return records;
  return records.filter((record) => {
    const product = record.product || {};
    const location = record.location || {};
    return (
      (product.title && product.title.toLowerCase().includes(term)) ||
      (product.name && product.name.toLowerCase().includes(term)) ||
      (product.sku && product.sku.toLowerCase().includes(term)) ||
      (location.name && location.name.toLowerCase().includes(term)) ||
      (location.code && location.code.toLowerCase().includes(term))
    );
  });
}

function filterAggregatedStockByProduct(rows, search = '') {
  const term = String(search || '').trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => {
    const product = row.product || {};
    return (
      (product.title && product.title.toLowerCase().includes(term)) ||
      (product.name && product.name.toLowerCase().includes(term)) ||
      (product.sku && product.sku.toLowerCase().includes(term))
    );
  });
}

// GET export stock report as Excel
router.get('/export', async (req, res) => {
  try {
    const { product, search = '', groupBy } = req.query;
    const query = {};
    if (product) query.product = product;

    const stock = await Stock.find(query)
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .populate('location', 'name code city')
      .sort({ createdAt: -1 });

    const enriched = await attachSoldCurrentMonth(stock);
    const monthLabel = getCurrentMonthRange().label;

    if (groupBy === 'product') {
      const aggregated = aggregateStockByProduct(enriched);
      const filtered = filterAggregatedStockByProduct(aggregated, search);
      const exportRows = mapStockByProductExportRows(filtered);
      const headers = STOCK_BY_PRODUCT_EXPORT_HEADERS.map((header) =>
        header.key === 'soldCurrentMonth'
          ? { ...header, label: `Sold (${monthLabel})` }
          : header
      );
      const buffer = exportToExcel(exportRows, headers);
      const filename = `stock_by_product_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      return res.send(buffer);
    }

    const filtered = filterStockForExport(enriched, search);
    const exportRows = mapStockToExportRows(filtered).map(({ _monthLabel, ...row }) => row);
    const headers = STOCK_EXPORT_HEADERS.map((header) =>
      header.key === 'soldCurrentMonth'
        ? { ...header, label: `Sold (${monthLabel})` }
        : header
    );

    const buffer = exportToExcel(exportRows, headers);
    const filename = `stock_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting stock report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST create/update stock
router.post('/', stockEditAccess, async (req, res) => {
  try {
    const { product, location, quantity, minStockLevel } = req.body;
    
    const stock = await Stock.findOneAndUpdate(
      { product, location },
      {
        product,
        location,
        quantity: quantity || 0,
        minStockLevel: minStockLevel || 0,
        lastUpdated: new Date()
      },
      { new: true, upsert: true, runValidators: true }
    )
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .populate('location', 'name code');
    
    res.status(201).json(stock);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update stock quantity
router.put('/:id', stockEditAccess, async (req, res) => {
  try {
    const { quantity, minStockLevel, reservedQuantity } = req.body;
    const updateData = { lastUpdated: new Date() };
    
    if (quantity !== undefined) updateData.quantity = quantity;
    if (minStockLevel !== undefined) updateData.minStockLevel = minStockLevel;
    if (reservedQuantity !== undefined) updateData.reservedQuantity = reservedQuantity;
    
    const stock = await Stock.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('product', PRODUCT_POPULATE_FIELDS)
      .populate('location', 'name code');
    
    if (!stock) {
      return res.status(404).json({ error: 'Stock record not found' });
    }
    res.json(stock);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE all stock (optional filters: product, location) — must be before /:id
router.delete('/all', stockEditAccess, async (req, res) => {
  try {
    if (req.query.confirm !== 'yes') {
      return res.status(400).json({ error: 'Confirmation required' });
    }

    const query = {};
    if (req.query.product) query.product = req.query.product;
    if (req.query.location) query.location = req.query.location;

    const result = await Stock.deleteMany(query);
    res.json({
      message: 'Stock data removed successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE stock record
router.delete('/:id', stockEditAccess, async (req, res) => {
  try {
    const stock = await Stock.findByIdAndDelete(req.params.id);
    if (!stock) {
      return res.status(404).json({ error: 'Stock record not found' });
    }
    res.json({ message: 'Stock record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template
router.get('/template', (req, res) => {
  try {
    const headers = [
      { key: 'product', label: 'Product SKU/Name *' },
      { key: 'location', label: 'Location Code/Name *' },
      { key: 'quantity', label: 'Quantity *' },
      { key: 'minStockLevel', label: 'Min Stock Level' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=stock_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import stock from Excel
router.post('/import', stockEditAccess, upload.single('file'), async (req, res) => {
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
        const locationCode = row['Location Code/Name *'] || '';
        const quantity = parseFloat(row['Quantity *']);
        const minStockLevel = parseFloat(row['Min Stock Level']) || 0;

        if (!productSku || !locationCode || isNaN(quantity)) {
          errors.push({ row: rowNum, field: 'product/location/quantity', message: 'Product, Location, and Quantity are required', data: row });
          failed++;
          continue;
        }

        // Find product by SKU or name
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

        // Find location by code or name
        const location = await Location.findOne({
          $or: [
            { code: locationCode.toUpperCase() },
            { name: locationCode }
          ]
        });

        if (!location) {
          errors.push({ row: rowNum, field: 'location', message: `Location not found: ${locationCode}`, data: row });
          failed++;
          continue;
        }

        const stockData = {
          product: product._id,
          location: location._id,
          quantity: quantity,
          minStockLevel: minStockLevel,
          lastUpdated: new Date()
        };

        const existingStock = await Stock.findOne({
          product: product._id,
          location: location._id
        });

        if (existingStock) {
          if (mode === 'create') {
            errors.push({ row: rowNum, field: 'stock', message: 'Stock record already exists', data: row });
            failed++;
            continue;
          }
          await Stock.findByIdAndUpdate(existingStock._id, stockData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({ row: rowNum, field: 'stock', message: 'Stock record not found for update', data: row });
            failed++;
            continue;
          }
          const stock = new Stock(stockData);
          await stock.save();
          imported++;
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message, data: row });
        failed++;
      }
    }

    res.json({
      success: true,
      totalRows: excelData.length,
      imported,
      updated,
      failed,
      skipped: 0,
      processed: imported + updated + failed,
      errorSummary: buildImportErrorSummary(errors),
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

