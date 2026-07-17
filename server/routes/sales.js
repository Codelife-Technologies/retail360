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
const { requireAdminOrRole } = require('../middleware/auth');
const { resolveSaleCurrency } = require('../currency/utils/saleCurrency');
const {
  SKU_COLUMN_KEYS,
  QUANTITY_COLUMN_KEYS,
  UNIT_PRICE_COLUMN_KEYS,
  getImportCellValue,
  parseExcelNumber,
  resolveProductForImport,
  mergeSaleItems,
  parseImportSaleDate,
} = require('../utils/saleImportUtils');

const adminOnlyAccess = requireAdminOrRole('admin');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const SALES_LOCATION_POPULATE = {
  path: 'salesLocation',
  select: 'name code salesChannels country currency',
  populate: { path: 'location', select: 'name code city country' },
};

function locationHasChannel(salesLocation, salesChannelId) {
  if (!salesLocation || !salesChannelId) return false;
  const channelId = String(salesChannelId);
  const channels = salesLocation.salesChannels || [];
  return channels.some((ch) => String(ch?._id || ch) === channelId);
}

function assertChannelBelongsToLocation(salesLocation, salesChannelId) {
  if (!locationHasChannel(salesLocation, salesChannelId)) {
    throw new Error('Selected sales channel is not linked to this sales location');
  }
}

async function resolveCurrencyForSaleRefs(salesChannelId, salesLocationDoc) {
  const SalesChannel = require('../models/SalesChannel');
  const channel =
    salesChannelId && typeof salesChannelId === 'object' && salesChannelId.defaultCurrency != null
      ? salesChannelId
      : await SalesChannel.findById(salesChannelId).select('country defaultCurrency').lean();
  return resolveSaleCurrency({
    salesChannel: channel,
    salesLocation: salesLocationDoc,
  });
}

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

async function buildSalePayloadFromImportGroup(entries, importContext = {}) {
  const SalesChannel = require('../models/SalesChannel');
  const SalesLocation = require('../models/SalesLocation');

  const first = entries[0].row;
  const channelCode = (first['Sales Channel Code *'] || first['Sales Channel Code'] || '').toString().trim();
  const locationCode = (first['Sales Location Code *'] || first['Sales Location Code'] || '').toString().trim();

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

  assertChannelBelongsToLocation(salesLocation, channel._id);

  const items = [];
  const productDocs = [];
  const rowErrors = [];
  let productsCreated = 0;
  const createdSkus = importContext.createdSkus || new Set();

  for (const { row, rowNum } of entries) {
    const sku = getImportCellValue(row, SKU_COLUMN_KEYS).toString().trim();
    const quantity = parseExcelNumber(getImportCellValue(row, QUANTITY_COLUMN_KEYS));
    const unitPrice = parseExcelNumber(getImportCellValue(row, UNIT_PRICE_COLUMN_KEYS));

    if (!sku) {
      rowErrors.push({ row: rowNum, field: 'Product SKU', message: 'Product SKU is required — row skipped' });
      continue;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      rowErrors.push({
        row: rowNum,
        field: 'Quantity',
        message: `Invalid quantity "${getImportCellValue(row, QUANTITY_COLUMN_KEYS)}" for SKU '${sku}' — row skipped`,
      });
      continue;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      rowErrors.push({
        row: rowNum,
        field: 'Unit Price',
        message: `Invalid unit price for SKU '${sku}' — row skipped`,
      });
      continue;
    }

    const { product, created } = await resolveProductForImport(sku, {
      autoCreate: importContext.autoCreateProducts !== false,
      createdSkus,
    });

    if (!product) {
      rowErrors.push({
        row: rowNum,
        field: 'Product SKU',
        message: `Product SKU '${sku}' not found — row skipped`,
      });
      continue;
    }

    if (created) {
      productsCreated += 1;
    }

    productDocs.push(product);
    items.push({
      product: product._id,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    });
  }

  if (items.length === 0) {
    throw new Error('No valid line items in this sale group');
  }

  const mergedItems = mergeSaleItems(items);
  const mergedProductIds = new Set(mergedItems.map((item) => String(item.product)));
  const mergedProductDocs = productDocs.filter(
    (product, index, list) =>
      mergedProductIds.has(String(product._id)) &&
      list.findIndex((candidate) => String(candidate._id) === String(product._id)) === index
  );

  const defaultTaxRate = parseExcelNumber(first['Default Tax Rate (%)']) || 0;
  const subtotal = mergedItems.reduce((sum, item) => sum + item.total, 0);
  const discount = parseExcelNumber(first['Discount']) || 0;
  const taxCell = first['Tax (optional — auto if blank)'] ?? first['Tax'];
  const taxProvided =
    taxCell !== undefined && taxCell !== null && String(taxCell).trim() !== '';
  const tax = taxProvided
    ? parseExcelNumber(taxCell) || 0
    : computeSaleTax(salesLocation, mergedItems, mergedProductDocs, { defaultTaxRate });
  const taxFinal = isUaeSalesLocation(salesLocation) ? 0 : tax;
  const currency = resolveSaleCurrency({
    salesChannel: channel,
    salesLocation,
  });
  const salesDate = parseImportSaleDate(first['Sales Date (YYYY-MM-DD)'] || first['Sales Date']);

  return {
    payload: {
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
      items: mergedItems,
      subtotal,
      discount,
      defaultTaxRate,
      tax: taxFinal,
      total: subtotal - discount + taxFinal,
      paymentStatus: (first['Payment Status (pending/paid/partial)'] || first['Payment Status'] || 'pending')
        .toString()
        .trim()
        .toLowerCase(),
      orderStatus: (first['Order Status (pending/confirmed/shipped/delivered/cancelled)'] || first['Order Status'] || 'pending')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ''),
      notes: first['Notes'] || '',
    },
    rowErrors,
    productsCreated,
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
      .populate('salesChannel', 'name code type country defaultCurrency')
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
        notes: 'Rows with the same Sale Reference become one sale. Tax auto-calculates from category if Tax is blank (Brass/Copper 12%, Gemstone 5%). Currency follows the sales channel country (e.g. INR for India, AED for UAE).'
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

    let fileQuantityTotal = 0;
    rows.forEach((row) => {
      const quantity = parseExcelNumber(getImportCellValue(row, QUANTITY_COLUMN_KEYS));
      if (Number.isFinite(quantity) && quantity > 0) {
        fileQuantityTotal += quantity;
      }
    });

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const ref = (row['Sale Reference *'] || row['Sale Reference'] || '').toString().trim();
      const amazonId = (row['Amazon Order ID'] || '').toString().trim();
      // Group by Amazon Order ID when present so multi-line orders (same order,
      // several product rows) combine into ONE sale instead of overwriting each
      // other. Fall back to Sale Reference when there is no Amazon Order ID.
      const groupKey = amazonId || ref;
      if (!groupKey) {
        errors.push({
          row: rowNum,
          field: 'Sale Reference *',
          message: 'Sale Reference or Amazon Order ID is required',
        });
        return;
      }
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push({ row, rowNum });
    });

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let productsCreated = 0;
    let lineItemsSkipped = 0;
    let importedQuantityTotal = 0;
    const fileAmazonOrderIds = new Map();
    const createdSkus = new Set();

    for (const [ref, entries] of groups) {
      try {
        const { payload, rowErrors, productsCreated: groupProductsCreated } =
          await buildSalePayloadFromImportGroup(entries, { createdSkus });
        productsCreated += groupProductsCreated;
        if (rowErrors.length > 0) {
          lineItemsSkipped += rowErrors.length;
          errors.push(...rowErrors.map((entry) => ({
            row: entry.row,
            field: entry.field,
            message: `Sale '${ref}': ${entry.message}`,
          })));
        }

        const saleItemQuantity = payload.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
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
          importedQuantityTotal += saleItemQuantity;
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
        importedQuantityTotal += saleItemQuantity;
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
      productsCreated,
      lineItemsSkipped,
      fileQuantityTotal,
      importedQuantityTotal,
      missingQuantity: Math.max(0, fileQuantityTotal - importedQuantityTotal),
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
      .populate('salesChannel', 'name code type country defaultCurrency')
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
    try {
      assertChannelBelongsToLocation(salesLocation, req.body.salesChannel);
    } catch (err) {
      return res.status(400).json({ error: err.message });
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
    const currency = await resolveCurrencyForSaleRefs(req.body.salesChannel, salesLocation);

    const saleData = {
      ...req.body,
      items,
      currency,
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
      .populate('salesChannel', 'name code type country defaultCurrency')
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

    const channelId = req.body.salesChannel || existingSale.salesChannel;
    try {
      assertChannelBelongsToLocation(salesLocation, channelId);
    } catch (err) {
      return res.status(400).json({ error: err.message });
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
    const currency = await resolveCurrencyForSaleRefs(channelId, salesLocation);

    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        currency,
        subtotal,
        discount,
        defaultTaxRate,
        tax,
        total,
      },
      { new: true, runValidators: true }
    )
      .populate('salesChannel', 'name code type country defaultCurrency')
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

// DELETE all sales — must be before /:id (admin only)
router.delete('/all', adminOnlyAccess, async (req, res) => {
  try {
    if (req.query.confirm !== 'yes') {
      return res.status(400).json({ error: 'Confirmation required. Pass ?confirm=yes' });
    }

    const sales = await Sale.find();
    let deleted = 0;

    for (const sale of sales) {
      await reverseSaleStock(sale);
      await Sale.findByIdAndDelete(sale._id);
      deleted += 1;
    }

    res.json({
      message: 'All sales records deleted successfully',
      deletedCount: deleted,
    });
  } catch (error) {
    console.error('Error deleting all sales:', error);
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

