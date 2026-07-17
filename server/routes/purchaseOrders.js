const express = require('express');
const router = express.Router();
const multer = require('multer');
const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseRequisite = require('../models/PurchaseRequisite');
const Supplier = require('../models/Supplier');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const PURCHASE_ORDER_HEADERS = [
  { key: 'poRef', label: 'PO Reference *' },
  { key: 'supplier', label: 'Supplier Name *' },
  { key: 'orderDate', label: 'Order Date (YYYY-MM-DD)' },
  { key: 'expectedDeliveryDate', label: 'Expected Delivery Date (YYYY-MM-DD)' },
  { key: 'status', label: 'Status (pending/approved/received/cancelled)' },
  { key: 'sku', label: 'Product SKU *' },
  { key: 'quantity', label: 'Quantity *' },
  { key: 'unitPrice', label: 'Unit Price (Amount) *' },
  { key: 'tax', label: 'Tax' },
  { key: 'notes', label: 'Notes' }
];

const PO_POPULATE = [
  { path: 'supplier', select: 'name contactPerson email phone address gstin pan state' },
  { path: 'purchaseRequisite', select: 'prNumber status' },
  { path: 'items.product', select: 'name title sku hsnCode unit productUrl images category' },
];

async function buildPurchaseOrderSearchOr(search) {
  const term = search.trim();
  const regex = { $regex: term, $options: 'i' };

  const [matchingSuppliers, matchingPrs] = await Promise.all([
    Supplier.find({ name: regex }).select('_id').lean(),
    PurchaseRequisite.find({ prNumber: regex }).select('_id').lean(),
  ]);

  const or = [
    { poNumber: regex },
    { purchaseRequisitionNumber: regex },
    { notes: regex },
    { department: regex },
    { costCenter: regex },
  ];

  if (matchingSuppliers.length) {
    or.push({ supplier: { $in: matchingSuppliers.map((s) => s._id) } });
  }
  if (matchingPrs.length) {
    or.push({ purchaseRequisite: { $in: matchingPrs.map((p) => p._id) } });
  }

  return or;
}

// Helper function to generate PO number
async function generatePONumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${dateStr}-`;
  
  const lastPO = await PurchaseOrder.findOne({
    poNumber: { $regex: `^${prefix}` }
  }).sort({ poNumber: -1 });
  
  let sequence = 1;
  if (lastPO) {
    const lastSequence = parseInt(lastPO.poNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }
  
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// GET all purchase orders (with pagination)
router.get('/', async (req, res) => {
  try {
    const { status, supplier, search, page, limit } = req.query;
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (supplier) {
      query.supplier = supplier;
    }

    if (search?.trim()) {
      query.$or = await buildPurchaseOrderSearchOr(search);
    }
    
    if (page || limit) {
      const result = await paginate(PurchaseOrder, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: PO_POPULATE,
      });
      res.json(result);
    } else {
      const purchaseOrders = await PurchaseOrder.find(query)
        .populate(PO_POPULATE)
        .sort({ createdAt: -1 });
      res.json(purchaseOrders);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET purchase order import template
router.get('/template', (req, res) => {
  try {
    const sampleData = [
      {
        poRef: 'PO-1',
        supplier: 'Acme Supplies',
        orderDate: '2026-06-23',
        expectedDeliveryDate: '2026-06-30',
        status: 'pending',
        sku: 'PROD-001',
        quantity: 10,
        unitPrice: 250,
        tax: 0,
        notes: 'Rows that share the same PO Reference become one purchase order'
      },
      {
        poRef: 'PO-1',
        supplier: 'Acme Supplies',
        orderDate: '2026-06-23',
        expectedDeliveryDate: '2026-06-30',
        status: 'pending',
        sku: 'PROD-002',
        quantity: 5,
        unitPrice: 800,
        tax: 0,
        notes: ''
      }
    ];
    const buffer = generateTemplate(PURCHASE_ORDER_HEADERS, sampleData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchase_orders_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import purchase orders from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const Product = require('../models/Product');

    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Group rows into purchase orders by their PO Reference
    const groups = new Map();
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const ref = (row['PO Reference *'] || '').toString().trim();
      if (!ref) {
        errors.push({ row: rowNum, field: 'PO Reference *', message: 'PO Reference is required' });
        return;
      }
      if (!groups.has(ref)) {
        groups.set(ref, []);
      }
      groups.get(ref).push({ row, rowNum });
    });

    let imported = 0;
    let failed = 0;
    let skipped = 0;

    for (const [ref, entries] of groups) {
      const first = entries[0].row;
      try {
        const supplierName = (first['Supplier Name *'] || '').toString().trim();
        if (!supplierName) throw new Error('Supplier Name is required');

        const supplier = await Supplier.findOne({ name: supplierName });
        if (!supplier) throw new Error(`Supplier '${supplierName}' not found`);

        const items = [];
        for (const { row, rowNum } of entries) {
          const sku = (row['Product SKU *'] || '').toString().trim();
          const quantity = parseFloat(row['Quantity *']);
          const unitPrice = parseFloat(row['Unit Price (Amount) *']);

          if (!sku) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'Product SKU *',
              message: `PO '${ref}': Product SKU is required — line not added`,
            });
            continue;
          }

          if (!quantity || quantity <= 0) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'Quantity *',
              message: `PO '${ref}': SKU '${sku}' — quantity must be greater than 0 — line not added`,
            });
            continue;
          }

          if (isNaN(unitPrice) || unitPrice < 0) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'Unit Price (Amount) *',
              message: `PO '${ref}': SKU '${sku}' — unit price must be a valid number — line not added`,
            });
            continue;
          }

          const product = await Product.findOne({ sku });
          if (!product) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'Product SKU *',
              message: `Product not available — SKU '${sku}' was not added to PO '${ref}'`,
            });
            continue;
          }

          items.push({
            product: product._id,
            quantity,
            unitPrice,
            total: quantity * unitPrice,
          });
        }

        if (items.length === 0) {
          failed++;
          errors.push({
            row: entries[0].rowNum,
            field: `PO '${ref}'`,
            message: `PO '${ref}' was not created — no valid products found (all SKUs missing or invalid)`,
          });
          continue;
        }

        const statusRaw = (first['Status (pending/approved/received/cancelled)'] || 'pending')
          .toString()
          .trim()
          .toLowerCase();

        const poData = {
          poNumber: await generatePONumber(),
          supplier: supplier._id,
          orderDate: first['Order Date (YYYY-MM-DD)'] ? new Date(first['Order Date (YYYY-MM-DD)']) : new Date(),
          expectedDeliveryDate: first['Expected Delivery Date (YYYY-MM-DD)']
            ? new Date(first['Expected Delivery Date (YYYY-MM-DD)'])
            : undefined,
          status: statusRaw || 'pending',
          items,
          tax: parseFloat(first['Tax']) || 0,
          notes: first['Notes'] || '',
        };

        await new PurchaseOrder(poData).save();
        imported++;
      } catch (err) {
        failed++;
        errors.push({ row: entries[0].rowNum, field: `PO '${ref}'`, message: err.message });
      }
    }

    res.json({
      imported,
      updated: 0,
      failed,
      skipped,
      totalRows: rows.length,
      errors,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single purchase order
router.get('/:id', async (req, res) => {
  if (req.params.id === 'template' || req.params.id === 'import') {
    return res.status(404).json({ error: 'Route not found' });
  }
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate(PO_POPULATE);
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(purchaseOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase order
router.post('/', async (req, res) => {
  try {
    // Calculate item totals
    const items = req.body.items.map(item => ({
      ...item,
      total: item.quantity * item.unitPrice
    }));
    
    const poData = {
      ...req.body,
      items,
      poNumber: await generatePONumber()
    };
    
    const purchaseOrder = new PurchaseOrder(poData);
    await purchaseOrder.save();
    
    const populatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate(PO_POPULATE);
    
    res.status(201).json(populatedPO);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update purchase order
router.put('/:id', async (req, res) => {
  try {
    if (req.body.items) {
      req.body.items = req.body.items.map(item => ({
        ...item,
        total: item.quantity * item.unitPrice
      }));
    }

    if (req.body.supplier) {
      req.body.needsVendorAssignment = false;
    }
    
    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate(PO_POPULATE);
    
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    res.json(purchaseOrder);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST assign vendor(s) to a PO created without a designated supplier
router.post('/:id/assign-vendor', async (req, res) => {
  try {
    const { assignVendorsToPurchaseOrder } = require('../services/prToPurchaseOrderService');
    const purchaseOrders = await assignVendorsToPurchaseOrder(req.params.id, req.body);
    res.json({ purchaseOrders });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE purchase order
router.delete('/:id', async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findByIdAndDelete(req.params.id);
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

