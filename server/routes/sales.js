const express = require('express');
const router = express.Router();
const multer = require('multer');
const Sale = require('../models/Sale');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { parseExcel, buildImportErrorSummary } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { computeCategoryTax } = require('../utils/taxRates');
const { isUaeSalesLocation } = require('../utils/locationCurrency');
const { deductSaleStockItems, restoreSaleStockItems } = require('../utils/saleStockUtils');

const SALES_CURRENCY = 'AED';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const SALES_LOCATION_POPULATE = {
  path: 'salesLocation',
  select: 'name code',
  populate: { path: 'location', select: 'name code city country' },
};

async function loadProductsForItems(items) {
  const Product = require('../models/Product');
  const ids = items.map((item) => item.product?._id || item.product).filter(Boolean);
  if (ids.length === 0) return [];
  return Product.find({ _id: { $in: ids } }).populate('category', 'name');
}

function computeSaleTax(salesLocation, items, productDocs, { defaultTaxRate = 0, taxOverride } = {}) {
  if (isUaeSalesLocation(salesLocation)) return 0;
  if (taxOverride !== undefined && taxOverride !== null && String(taxOverride).trim() !== '') {
    return parseFloat(taxOverride) || 0;
  }
  return computeCategoryTax(items, productDocs, defaultTaxRate);
}

function resolveMongoSalesSort(sortBy = 'salesDate', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  const allowed = {
    salesDate: { salesDate: dir },
    date: { salesDate: dir },
    total: { total: dir },
    salesNumber: { salesNumber: dir },
    paymentStatus: { paymentStatus: dir },
    orderStatus: { orderStatus: dir },
    amazonOrderId: { amazonOrderId: dir },
  };
  return allowed[sortBy] || { salesDate: dir };
}

function sortSalesRecords(sales, sortBy = 'salesDate', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...sales].sort((a, b) => {
    if (sortBy === 'channel') {
      const aName = (a.salesChannel?.name || '').toLowerCase();
      const bName = (b.salesChannel?.name || '').toLowerCase();
      return aName.localeCompare(bName) * dir;
    }
    if (sortBy === 'customer') {
      const aName = (a.customer?.name || '').toLowerCase();
      const bName = (b.customer?.name || '').toLowerCase();
      return aName.localeCompare(bName) * dir;
    }
    if (sortBy === 'salesDate' || sortBy === 'date') {
      return (new Date(a.salesDate) - new Date(b.salesDate)) * dir;
    }
    if (sortBy === 'total') {
      return ((a.total || 0) - (b.total || 0)) * dir;
    }
    if (sortBy === 'salesNumber') {
      return String(a.salesNumber || '').localeCompare(String(b.salesNumber || '')) * dir;
    }
    if (sortBy === 'amazonOrderId') {
      return String(a.amazonOrderId || '').localeCompare(String(b.amazonOrderId || '')) * dir;
    }
    return (new Date(b.salesDate) - new Date(a.salesDate));
  });
}

async function reverseSaleStock(saleDoc) {
  if (!saleDoc?.items?.length) return;

  const SalesLocation = require('../models/SalesLocation');

  const salesLocation = await SalesLocation.findById(saleDoc.salesLocation).populate('location');
  if (!salesLocation?.location) return;

  const warehouseLocation = salesLocation.location._id || salesLocation.location;
  await restoreSaleStockItems(saleDoc.items, warehouseLocation);
}

async function buildSalePayloadFromImportGroup(entries) {
  const SalesChannel = require('../models/SalesChannel');
  const SalesLocation = require('../models/SalesLocation');
  const Product = require('../models/Product');

  const first = entries[0].row;
  const channelCode = (first['Sales Channel Code *'] || '').toString().trim();
  const locationCode = (first['Sales Location Code *'] || '').toString().trim();

  const channel = await SalesChannel.findOne({ code: channelCode });
  if (!channel) {
    throw new Error(`Sales Channel code '${channelCode}' not found`);
  }

  const salesLocation = await SalesLocation.findOne({ code: locationCode }).populate(
    'location',
    'name code city country'
  );
  if (!salesLocation) {
    throw new Error(`Sales Location code '${locationCode}' not found`);
  }

  const items = [];
  const productDocs = [];
  for (const { row, rowNum } of entries) {
    const sku = (row['Product SKU *'] || '').toString().trim();
    const quantity = parseFloat(row['Quantity *']);
    const unitPrice = parseFloat(row['Unit Price *'] || row['Unit Price (Amount) *']);

    if (!sku) {
      throw new Error(`Row ${rowNum}: Product SKU is required`);
    }
    if (!quantity || quantity <= 0) {
      throw new Error(`Row ${rowNum}: Quantity must be greater than 0`);
    }
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      throw new Error(`Row ${rowNum}: Unit Price must be a valid number`);
    }

    const product = await Product.findOne({ sku }).populate('category', 'name');
    if (!product) {
      throw new Error(`Row ${rowNum}: Product SKU '${sku}' not found`);
    }

    productDocs.push(product);
    items.push({
      product: product._id,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    });
  }

  const defaultTaxRate = parseFloat(first['Default Tax Rate (%)']) || 0;
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discount = parseFloat(first['Discount']) || 0;
  const taxCell = first['Tax (optional — auto if blank)'] ?? first['Tax'];
  const taxProvided =
    taxCell !== undefined && taxCell !== null && String(taxCell).trim() !== '';
  const tax = taxProvided
    ? parseFloat(taxCell) || 0
    : computeSaleTax(salesLocation, items, productDocs, { defaultTaxRate });
  const taxFinal = isUaeSalesLocation(salesLocation) ? 0 : tax;
  const currency = SALES_CURRENCY;
  const salesDate = first['Sales Date (YYYY-MM-DD)']
    ? new Date(first['Sales Date (YYYY-MM-DD)'])
    : new Date();

  return {
    salesChannel: channel._id,
    salesLocation: salesLocation._id,
    warehouseLocation: salesLocation.location._id || salesLocation.location,
    currency,
    customer: {
      name: first['Customer Name'] || '',
      email: first['Customer Email'] || '',
      phone: first['Customer Phone'] || '',
      address: first['Customer Address'] || '',
    },
    amazonOrderId: (first['Amazon Order ID'] || '').toString().trim(),
    salesDate,
    items,
    subtotal,
    discount,
    defaultTaxRate,
    tax: taxFinal,
    total: subtotal - discount + taxFinal,
    paymentStatus: (first['Payment Status (pending/paid/partial)'] || 'pending')
      .toString()
      .trim()
      .toLowerCase(),
    orderStatus: (first['Order Status (pending/confirmed/shipped/delivered/cancelled)'] || 'pending')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ''),
    notes: first['Notes'] || '',
  };
}

// Helper function to generate sales number: SAL-YYYYMMDD-NNN (daily sequence)
const generateSalesNumber = async (salesDate) => {
  const date = salesDate ? new Date(salesDate) : new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SAL-${dateStr}-`;
  const last = await Sale.findOne({ salesNumber: { $regex: `^${prefix}` } })
    .sort({ salesNumber: -1 })
    .lean();
  let seq = 1;
  if (last) {
    const parts = last.salesNumber.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// GET all sales
router.get('/', async (req, res) => {
  try {
    const { salesChannel, salesLocation, paymentStatus, orderStatus, startDate, endDate, search, page, limit, sortBy = 'salesDate', sortDir = 'desc' } = req.query;
    const query = {};
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    if (salesLocation) {
      query.salesLocation = salesLocation;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    if (orderStatus) {
      query.orderStatus = orderStatus;
    }
    
    if (startDate || endDate) {
      query.salesDate = {};
      if (startDate) {
        query.salesDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.salesDate.$lte = new Date(endDate);
      }
    }
    
    if (search) {
      query.$or = [
        { salesNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
        { amazonOrderId: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Build base query
    let salesQuery = Sale.find(query);
    
    // Apply populate
    salesQuery = salesQuery
      .populate('salesChannel', 'name code type')
      .populate(SALES_LOCATION_POPULATE)
      .populate({
        path: 'items.product',
        select: 'name title sku'
      });
    
    // Apply sorting (channel/customer sorted after populate)
    const needsPostSort = sortBy === 'channel' || sortBy === 'customer';
    if (!needsPostSort) {
      salesQuery = salesQuery.sort(resolveMongoSalesSort(sortBy, sortDir));
    } else {
      salesQuery = salesQuery.sort({ salesDate: -1 });
    }
    
    if (page || limit) {
      // Paginated response
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 25;
      const skip = (pageNum - 1) * limitNum;
      
      const total = await Sale.countDocuments(query);
      let sales = await salesQuery.skip(skip).limit(limitNum);
      if (needsPostSort) {
        sales = sortSalesRecords(sales, sortBy, sortDir);
      }
      
      res.json({
        data: sales,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        }
      });
    } else {
      // Non-paginated response - return all sales
      let sales = await salesQuery;
      if (needsPostSort) {
        sales = sortSalesRecords(sales, sortBy, sortDir);
      }
      res.json(sales);
    }
  } catch (error) {
    logger.backend.error('Error fetching sales', { 
      error: error.message, 
      stack: error.stack,
      query: req.query 
    });
    console.error('Sales fetch error:', error);
    res.status(500).json({ error: error.message, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

// Column labels used by both the template and the importer (one row = one line item)
const SALES_IMPORT_HEADERS = [
  { key: 'saleRef', label: 'Sale Reference *' },
  { key: 'channelCode', label: 'Sales Channel Code *' },
  { key: 'locationCode', label: 'Sales Location Code *' },
  { key: 'sku', label: 'Product SKU *' },
  { key: 'quantity', label: 'Quantity *' },
  { key: 'unitPrice', label: 'Unit Price *' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'customerEmail', label: 'Customer Email' },
  { key: 'customerPhone', label: 'Customer Phone' },
  { key: 'customerAddress', label: 'Customer Address' },
  { key: 'amazonOrderId', label: 'Amazon Order ID' },
  { key: 'salesDate', label: 'Sales Date (YYYY-MM-DD)' },
  { key: 'discount', label: 'Discount' },
  { key: 'defaultTaxRate', label: 'Default Tax Rate (%)' },
  { key: 'tax', label: 'Tax (optional — auto if blank)' },
  { key: 'paymentStatus', label: 'Payment Status (pending/paid/partial)' },
  { key: 'orderStatus', label: 'Order Status (pending/confirmed/shipped/delivered/cancelled)' },
  { key: 'notes', label: 'Notes' },
];

// GET sales import template
router.get('/template', (req, res) => {
  try {
    const sampleData = [
      {
        saleRef: 'ORDER-1',
        channelCode: 'WEB',
        locationCode: 'WEB-01',
        sku: 'PROD-001',
        quantity: 2,
        unitPrice: 499,
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        customerPhone: '9999999999',
        customerAddress: '123 Main St',
        amazonOrderId: '123-1234567-1234567',
        salesDate: '2026-06-23',
        discount: 0,
        defaultTaxRate: 0,
        tax: '',
        paymentStatus: 'pending',
        orderStatus: 'pending',
        notes: 'Rows with the same Sale Reference become one sale. Tax auto-calculates from category if Tax is blank (Brass/Copper 12%, Gemstone 5%). Currency is AED.'
      },
      {
        saleRef: 'ORDER-1',
        channelCode: 'WEB',
        locationCode: 'WEB-01',
        sku: 'PROD-002',
        quantity: 1,
        unitPrice: 1299,
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        customerPhone: '9999999999',
        customerAddress: '123 Main St',
        amazonOrderId: '123-1234567-1234567',
        salesDate: '2026-06-23',
        discount: 0,
        defaultTaxRate: 0,
        tax: '',
        paymentStatus: 'pending',
        orderStatus: 'pending',
        notes: ''
      }
    ];
    const buffer = generateTemplate(SALES_IMPORT_HEADERS, sampleData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_template.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error generating sales template', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST import sales from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const mode = req.body.mode || 'both';

    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    const groups = new Map();
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const ref = (row['Sale Reference *'] || '').toString().trim();
      if (!ref) {
        errors.push({ row: rowNum, field: 'Sale Reference *', message: 'Sale Reference is required' });
        return;
      }
      if (!groups.has(ref)) {
        groups.set(ref, []);
      }
      groups.get(ref).push({ row, rowNum });
    });

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const fileAmazonOrderIds = new Map();

    for (const [ref, entries] of groups) {
      try {
        const payload = await buildSalePayloadFromImportGroup(entries);
        const amazonOrderId = payload.amazonOrderId;

        if (amazonOrderId && fileAmazonOrderIds.has(amazonOrderId)) {
          if (mode === 'create') {
            skipped += 1;
            errors.push({
              row: entries[0].rowNum,
              field: 'Amazon Order ID',
              message: `Duplicate Amazon Order ID in file (first used in sale '${fileAmazonOrderIds.get(amazonOrderId)}') — skipped`,
            });
            continue;
          }
        } else if (amazonOrderId) {
          fileAmazonOrderIds.set(amazonOrderId, ref);
        }

        let existing = null;
        if (amazonOrderId) {
          existing = await Sale.findOne({ amazonOrderId });
        }

        if (existing) {
          if (mode === 'create') {
            skipped += 1;
            continue;
          }

          await reverseSaleStock(existing);
          existing.salesChannel = payload.salesChannel;
          existing.salesLocation = payload.salesLocation;
          existing.currency = payload.currency;
          existing.customer = payload.customer;
          existing.amazonOrderId = payload.amazonOrderId;
          existing.salesDate = payload.salesDate;
          existing.items = payload.items;
          existing.subtotal = payload.subtotal;
          existing.discount = payload.discount;
          existing.defaultTaxRate = payload.defaultTaxRate;
          existing.tax = payload.tax;
          existing.total = payload.total;
          existing.paymentStatus = payload.paymentStatus;
          existing.orderStatus = payload.orderStatus;
          existing.notes = payload.notes;
          await existing.save();
          updated += 1;
          continue;
        }

        if (mode === 'update') {
          skipped += 1;
          continue;
        }

        const sale = new Sale({
          ...payload,
          salesNumber: await generateSalesNumber(payload.salesDate),
        });
        delete sale.warehouseLocation;
        await sale.save();
        imported += 1;
      } catch (err) {
        failed += 1;
        errors.push({ row: entries[0].rowNum, field: `Sale '${ref}'`, message: err.message });
      }
    }

    res.json({
      imported,
      updated,
      skipped,
      failed,
      totalRows: rows.length,
      processed: imported + updated + failed + skipped,
      errorSummary: buildImportErrorSummary(errors),
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    logger.backend.error('Error importing sales', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single sale
router.get('/:id', async (req, res) => {
  // Prevent special routes from being treated as an id
  if (req.params.id === 'template' || req.params.id === 'import') {
    return res.status(404).json({ error: 'Route not found' });
  }
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('salesChannel', 'name code type')
      .populate(SALES_LOCATION_POPULATE)
      .populate('items.product', 'name title sku images parentSkuOrAsin variation');
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create sale
router.post('/', async (req, res) => {
  try {
    // Calculate item totals
    const items = req.body.items.map(item => ({
      ...item,
      total: item.quantity * item.unitPrice
    }));
    
    const SalesLocation = require('../models/SalesLocation');
    
    const salesLocation = await SalesLocation.findById(req.body.salesLocation).populate(
      'location',
      'name code city country'
    );
    if (!salesLocation || !salesLocation.location) {
      return res.status(400).json({ error: 'Invalid sales location' });
    }

    const productDocs = await loadProductsForItems(items);
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const discount = parseFloat(req.body.discount) || 0;
    const defaultTaxRate = parseFloat(req.body.defaultTaxRate) || 0;
    const tax = computeSaleTax(salesLocation, items, productDocs, {
      defaultTaxRate,
      taxOverride: req.body.tax,
    });
    const total = subtotal - discount + tax;

    const saleData = {
      ...req.body,
      items,
      currency: SALES_CURRENCY,
      subtotal,
      discount,
      defaultTaxRate,
      tax,
      total,
      salesNumber: await generateSalesNumber(req.body.salesDate),
    };
    
    const sale = new Sale(saleData);
    await sale.save();
    
    const populatedSale = await Sale.findById(sale._id)
      .populate('salesChannel', 'name code type')
      .populate(SALES_LOCATION_POPULATE)
      .populate('items.product', 'name title sku images parentSkuOrAsin variation');
    
    res.status(201).json(populatedSale);
  } catch (error) {
    logger.backend.error('Error creating sale', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Sales number already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update sale
router.put('/:id', async (req, res) => {
  try {
    const existingSale = await Sale.findById(req.params.id);
    if (!existingSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    // If items are being updated, handle stock adjustments
    const locationId = req.body.salesLocation || existingSale.salesLocation;
    const SalesLocation = require('../models/SalesLocation');
    const salesLocation = await SalesLocation.findById(locationId).populate(
      'location',
      'name code city country'
    );

    if (!salesLocation?.location) {
      return res.status(400).json({ error: 'Invalid sales location' });
    }

    if (req.body.items) {
      const warehouseLocation = salesLocation.location._id || salesLocation.location;
      
      await restoreSaleStockItems(existingSale.items, warehouseLocation);
      
      const newItems = req.body.items.map(item => ({
        ...item,
        total: item.quantity * item.unitPrice
      }));

      await deductSaleStockItems(newItems, warehouseLocation);
      
      req.body.items = newItems;
    }

    const items = req.body.items || existingSale.items;
    const productDocs = await loadProductsForItems(items);
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);
    const discount =
      req.body.discount !== undefined ? parseFloat(req.body.discount) || 0 : existingSale.discount || 0;
    const defaultTaxRate =
      req.body.defaultTaxRate !== undefined
        ? parseFloat(req.body.defaultTaxRate) || 0
        : existingSale.defaultTaxRate || 0;
    const tax = computeSaleTax(salesLocation, items, productDocs, {
      defaultTaxRate,
      taxOverride: req.body.tax,
    });
    const total = subtotal - discount + tax;

    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        currency: SALES_CURRENCY,
        subtotal,
        discount,
        defaultTaxRate,
        tax,
        total,
      },
      { new: true, runValidators: true }
    )
      .populate('salesChannel', 'name code type')
      .populate(SALES_LOCATION_POPULATE)
      .populate('items.product', 'name title sku images parentSkuOrAsin variation');
    
    res.json(sale);
  } catch (error) {
    console.error('Error updating sale:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      saleId: req.params.id,
      body: req.body
    });
    res.status(400).json({ error: error.message });
  }
});

// POST remove sales with duplicate Amazon order IDs (keeps earliest record per ID)
router.post('/remove-amazon-order-duplicates', async (req, res) => {
  try {
    const duplicateGroups = await Sale.aggregate([
      {
        $match: {
          amazonOrderId: { $exists: true, $type: 'string', $ne: '' },
        },
      },
      {
        $addFields: {
          amazonOrderIdNorm: { $trim: { input: '$amazonOrderId' } },
        },
      },
      { $match: { amazonOrderIdNorm: { $ne: '' } } },
      {
        $group: {
          _id: '$amazonOrderIdNorm',
          records: {
            $push: {
              id: '$_id',
              createdAt: '$createdAt',
              salesNumber: '$salesNumber',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    const idsToDelete = [];
    for (const group of duplicateGroups) {
      const sorted = group.records.sort((a, b) => {
        const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
        if (dateDiff !== 0) return dateDiff;
        return String(a.salesNumber || '').localeCompare(String(b.salesNumber || ''));
      });
      idsToDelete.push(...sorted.slice(1).map((row) => row.id));
    }

    let deleted = 0;
    for (const id of idsToDelete) {
      const removed = await Sale.findByIdAndDelete(id);
      if (removed) deleted += 1;
    }

    res.json({
      duplicateAmazonOrderIds: duplicateGroups.length,
      deleted,
      kept: duplicateGroups.length,
    });
  } catch (error) {
    logger.backend.error('Error removing duplicate Amazon order sales', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: error.message });
  }
});

// DELETE sale
router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    await reverseSaleStock(sale);
    await Sale.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      saleId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

// GET sales summary
router.get('/summary/stats', async (req, res) => {
  try {
    const { startDate, endDate, salesChannel } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query.salesDate = {};
      if (startDate) query.salesDate.$gte = new Date(startDate);
      if (endDate) query.salesDate.$lte = new Date(endDate);
    }
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    const totalSales = await Sale.countDocuments(query);
    const totalRevenue = await Sale.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    
    const salesByChannel = await Sale.aggregate([
      { $match: query },
      { $group: { _id: '$salesChannel', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $lookup: { from: 'saleschannels', localField: '_id', foreignField: '_id', as: 'channel' } },
      { $unwind: '$channel' },
      { $project: { channelName: '$channel.name', count: 1, revenue: 1 } }
    ]);
    
    res.json({
      totalSales,
      totalRevenue: totalRevenue[0]?.total || 0,
      salesByChannel
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

