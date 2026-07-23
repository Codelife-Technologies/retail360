const express = require('express');
const router = express.Router();
const multer = require('multer');
const Purchase = require('../models/Purchase');
const PurchaseOrder = require('../models/PurchaseOrder');
const Price = require('../models/Price');
const Supplier = require('../models/Supplier');
const Location = require('../models/Location');
const Product = require('../models/Product');
const { paginate } = require('../utils/pagination');
const { applyDateRangeFilter } = require('../utils/dateRangeFilter');
const { requirePermission } = require('../middleware/auth');
const { generateTemplate, exportToExcel } = require('../utils/excelGenerator');
const { parseExcel, buildImportErrorSummary } = require('../utils/excelParser');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const { generatePurchaseNumber } = require('../utils/generatePurchaseNumber');

// GET all purchases (with pagination)
router.get('/', requirePermission('purchases.view'), async (req, res) => {
  try {
    const { supplier, location, paymentStatus, fromDate, toDate, page, limit } = req.query;
    const query = {};
    
    if (supplier) {
      query.supplier = supplier;
    }

    if (location) {
      query.location = location;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    applyDateRangeFilter(query, 'purchaseDate', fromDate, toDate);
    
    if (page || limit) {
      const result = await paginate(Purchase, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'supplier', select: 'name' },
          { path: 'location', select: 'name code' },
          { path: 'purchaseOrder', select: 'poNumber' },
          { path: 'items.product', select: 'name title sku' }
        ]
      });
      res.json(result);
    } else {
      const purchases = await Purchase.find(query)
        .populate('supplier', 'name')
        .populate('location', 'name code')
        .populate('purchaseOrder', 'poNumber')
        .populate('items.product', 'name title sku')
        .sort({ createdAt: -1 });
      res.json(purchases);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PURCHASE_TEMPLATE_HEADERS = [
  { key: 'purchaseRef', label: 'Purchase Reference *' },
  { key: 'supplier', label: 'Supplier Name *' },
  { key: 'locationCode', label: 'Location Code *' },
  { key: 'purchaseDate', label: 'Purchase Date (YYYY-MM-DD)' },
  { key: 'paymentStatus', label: 'Payment Status (pending/paid/partial)' },
  { key: 'sku', label: 'Product SKU *' },
  { key: 'quantity', label: 'Quantity *' },
  { key: 'unitPrice', label: 'Unit Price *' },
  { key: 'tax', label: 'Tax' },
  { key: 'notes', label: 'Notes' },
];

function parsePurchaseImportNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const cleaned = String(value).replace(/,/g, '').trim();
  return parseFloat(cleaned);
}

function isEmptyPurchaseImportRow(row) {
  return !Object.values(row || {}).some((value) => String(value ?? '').trim() !== '');
}

const PURCHASE_EXPORT_HEADERS = [
  { key: 'purchaseNumber', label: 'Purchase Number' },
  { key: 'purchaseDate', label: 'Purchase Date' },
  { key: 'supplier', label: 'Vendor' },
  { key: 'location', label: 'Location' },
  { key: 'poNumber', label: 'PO Number' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'sku', label: 'SKU' },
  { key: 'product', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unitPrice', label: 'Unit Price' },
  { key: 'lineTotal', label: 'Line Total' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'tax', label: 'Tax' },
  { key: 'total', label: 'Grand Total' },
  { key: 'notes', label: 'Notes' },
];

function formatExportDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function mapPurchasesToExcelRows(purchases) {
  const rows = [];
  (purchases || []).forEach((purchase) => {
    const items = purchase.items?.length ? purchase.items : [null];
    items.forEach((item) => {
      rows.push({
        purchaseNumber: purchase.purchaseNumber || '',
        purchaseDate: formatExportDate(purchase.purchaseDate),
        supplier: purchase.supplier?.name || '',
        location: purchase.location?.name || purchase.location?.code || '',
        poNumber: purchase.purchaseOrder?.poNumber || '',
        paymentStatus: purchase.paymentStatus || '',
        sku: item?.product?.sku || item?.sku || '',
        product: item?.product?.title || item?.product?.name || item?.productName || '',
        quantity: item?.quantity ?? '',
        unitPrice: item?.unitPrice ?? '',
        lineTotal: item?.total ?? '',
        subtotal: purchase.subtotal ?? '',
        tax: purchase.tax ?? '',
        total: purchase.total ?? '',
        notes: purchase.notes || '',
      });
    });
  });
  return rows;
}

function buildPurchaseListQuery(queryParams = {}) {
  const { supplier, location, paymentStatus, fromDate, toDate } = queryParams;
  const query = {};
  if (supplier) query.supplier = supplier;
  if (location) query.location = location;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  applyDateRangeFilter(query, 'purchaseDate', fromDate, toDate);
  return query;
}

const PURCHASE_POPULATE = [
  { path: 'supplier', select: 'name' },
  { path: 'location', select: 'name code' },
  { path: 'purchaseOrder', select: 'poNumber' },
  { path: 'items.product', select: 'name title sku' },
];

// GET Excel template (must be before /:id)
router.get('/template', requirePermission('purchases.view'), (req, res) => {
  try {
    const sampleData = [
      {
        purchaseRef: 'PUR-1',
        supplier: 'Acme Supplies',
        locationCode: 'WH-01',
        purchaseDate: '2026-07-16',
        paymentStatus: 'pending',
        sku: 'SKU-001',
        quantity: 10,
        unitPrice: 250,
        tax: 0,
        notes: 'Add one row per SKU. Rows with the same Purchase Reference become one purchase.',
      },
      {
        purchaseRef: 'PUR-1',
        supplier: 'Acme Supplies',
        locationCode: 'WH-01',
        purchaseDate: '2026-07-16',
        paymentStatus: 'pending',
        sku: 'SKU-002',
        quantity: 5,
        unitPrice: 800,
        tax: 0,
        notes: '',
      },
    ];

    const buffer = generateTemplate(PURCHASE_TEMPLATE_HEADERS, sampleData, {
      instructions: [
        'Use one row per SKU line in a purchase.',
        'Rows with the same Purchase Reference are grouped into one purchase record.',
        'Required columns: Purchase Reference, Supplier Name, Location Code, Product SKU, Quantity, Unit Price.',
        'Payment Status: pending, paid, or partial.',
        'Supplier, location code, and SKU must already exist in the system.',
      ],
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchases_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET export filtered purchases as Excel (must be before /:id)
router.get('/export', requirePermission('purchases.view'), async (req, res) => {
  try {
    const query = buildPurchaseListQuery(req.query);
    const purchases = await Purchase.find(query)
      .populate(PURCHASE_POPULATE)
      .sort({ purchaseDate: -1, createdAt: -1 });
    const rows = mapPurchasesToExcelRows(purchases);
    const buffer = exportToExcel(rows, PURCHASE_EXPORT_HEADERS);
    const filename = `purchases_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET export a single purchase as Excel
router.get('/:id/export', requirePermission('purchases.view'), async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id).populate(PURCHASE_POPULATE);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    const rows = mapPurchasesToExcelRows([purchase]);
    const buffer = exportToExcel(rows, PURCHASE_EXPORT_HEADERS);
    const safeName = String(purchase.purchaseNumber || req.params.id).replace(/[\\/:*?"<>|]/g, '_');
    const filename = `purchase_${safeName}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import purchases from Excel (must be before /:id)
router.post('/import', requirePermission('purchases.create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    const groups = new Map();
    let skipped = 0;
    let imported = 0;
    let failed = 0;
    const errors = [];

    rows.forEach((row, idx) => {
      if (isEmptyPurchaseImportRow(row)) {
        skipped += 1;
        return;
      }
      const ref = (row['Purchase Reference *'] || '').toString().trim();
      if (!ref) {
        errors.push({
          row: idx + 2,
          field: 'Purchase Reference *',
          message: 'Purchase Reference is required',
        });
        failed += 1;
        return;
      }
      if (!groups.has(ref)) {
        groups.set(ref, []);
      }
      groups.get(ref).push({ row, rowNum: idx + 2 });
    });

    for (const [ref, entries] of groups) {
      const first = entries[0].row;
      try {
        const supplierName = (first['Supplier Name *'] || '').toString().trim();
        if (!supplierName) throw new Error('Supplier Name is required');

        const locationCode = (first['Location Code *'] || '').toString().trim();
        if (!locationCode) throw new Error('Location Code is required');

        const supplier = await Supplier.findOne({ name: supplierName });
        if (!supplier) throw new Error(`Supplier '${supplierName}' not found`);

        const location = await Location.findOne({ code: locationCode });
        if (!location) throw new Error(`Location code '${locationCode}' not found`);

        const items = [];
        for (const { row, rowNum } of entries) {
          const sku = (row['Product SKU *'] || '').toString().trim();
          const quantity = parsePurchaseImportNumber(row['Quantity *']);
          const unitPrice = parsePurchaseImportNumber(row['Unit Price *']);

          if (!sku) throw new Error(`Row ${rowNum}: Product SKU is required`);
          if (!quantity || quantity <= 0) throw new Error(`Row ${rowNum}: Quantity must be greater than 0`);
          if (isNaN(unitPrice) || unitPrice < 0) throw new Error(`Row ${rowNum}: Unit Price must be a valid number`);

          const product = await Product.findOne({ sku });
          if (!product) throw new Error(`Row ${rowNum}: Product SKU '${sku}' not found`);

          items.push({
            product: product._id,
            quantity,
            unitPrice,
            total: quantity * unitPrice,
          });
        }

        const paymentStatusRaw = (first['Payment Status (pending/paid/partial)'] || 'pending')
          .toString()
          .trim()
          .toLowerCase();
        const paymentStatus = ['pending', 'paid', 'partial'].includes(paymentStatusRaw)
          ? paymentStatusRaw
          : 'pending';

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const tax = parsePurchaseImportNumber(first.Tax) || 0;

        const purchase = new Purchase({
          purchaseNumber: await generatePurchaseNumber(),
          supplier: supplier._id,
          location: location._id,
          purchaseDate: first['Purchase Date (YYYY-MM-DD)']
            ? new Date(first['Purchase Date (YYYY-MM-DD)'])
            : new Date(),
          items,
          subtotal,
          tax,
          total: subtotal + tax,
          paymentStatus,
          notes: (first.Notes || '').toString().trim(),
        });

        await purchase.save();
        imported += 1;
      } catch (error) {
        errors.push({ row: entries[0].rowNum, field: 'general', message: `${ref}: ${error.message}` });
        failed += 1;
      }
    }

    res.json({
      success: true,
      imported,
      updated: 0,
      failed,
      skipped,
      totalRows: rows.length - skipped,
      processed: imported + failed,
      errors: errors.slice(0, 100),
      errorSummary: buildImportErrorSummary(errors),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single purchase
router.get('/:id', requirePermission('purchases.view'), async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier')
      .populate('location')
      .populate('purchaseOrder')
      .populate('items.product');
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    res.json(purchase);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase
router.post('/', requirePermission('purchases.create'), async (req, res) => {
  try {
    // Calculate item totals
    const items = req.body.items.map(item => ({
      ...item,
      total: item.quantity * item.unitPrice
    }));
    
    const purchaseData = {
      ...req.body,
      items,
      purchaseNumber: await generatePurchaseNumber()
    };
    
    const purchase = new Purchase(purchaseData);
    await purchase.save();
    
    // Optionally update purchase prices in Price collection
    // This allows the purchase price to be updated based on actual purchase
    for (const item of purchase.items) {
      try {
        const existingPrice = await Price.findOne({
          product: item.product,
          isActive: true
        });
        
        if (existingPrice) {
          // Update purchase price if it's different (optional - can be disabled)
          if (existingPrice.purchasePrice !== item.unitPrice) {
            // Create new price entry with updated purchase price
            await Price.updateMany(
              { product: item.product, isActive: true },
              { isActive: false }
            );
            
            await Price.create({
              product: item.product,
              purchasePrice: item.unitPrice,
              salesPrice: existingPrice.salesPrice, // Keep existing sales price
              currency: 'INR',
              effectiveDate: new Date(),
              isActive: true,
              notes: `Purchase price updated from purchase ${purchase.purchaseNumber}`
            });
          }
        }
      } catch (error) {
        console.error(`Error updating price for product ${item.product}:`, error);
        // Don't fail the purchase if price update fails
      }
    }
    
    // Update purchase order status if linked
    if (purchase.purchaseOrder) {
      await PurchaseOrder.findByIdAndUpdate(
        purchase.purchaseOrder,
        { status: 'received' }
      );
    }
    
    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('supplier')
      .populate('location', 'name code')
      .populate('purchaseOrder', 'poNumber')
      .populate('items.product');
    
    res.status(201).json(populatedPurchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update purchase
router.put('/:id', requirePermission('purchases.update'), async (req, res) => {
  try {
    // Calculate item totals if items are being updated
    if (req.body.items) {
      req.body.items = req.body.items.map(item => ({
        ...item,
        total: item.quantity * item.unitPrice
      }));
    }
    
    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('supplier')
      .populate('location', 'name code')
      .populate('purchaseOrder', 'poNumber')
      .populate('items.product');
    
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    res.json(purchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE purchase
router.delete('/:id', requirePermission('purchases.delete'), async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    // Reverse stock updates in Stock collection
    const Stock = require('../models/Stock');
    for (const item of purchase.items) {
      await Stock.findOneAndUpdate(
        { product: item.product, location: purchase.location },
        { 
          $inc: { quantity: -item.quantity },
          $set: { lastUpdated: new Date() }
        }
      );
    }
    
    await Purchase.findByIdAndDelete(req.params.id);
    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

