const express = require('express');
const router = express.Router();
const multer = require('multer');
const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseRequisite = require('../models/PurchaseRequisite');
const Supplier = require('../models/Supplier');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { linkPurchaseOrderProductsToSupplier } = require('../utils/productSuppliers');
const { findProductBySkuForImport } = require('../utils/saleImportUtils');
const {
  generatePONumber,
  createPoNumberAllocator,
} = require('../utils/generatePoNumber');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const PURCHASE_ORDER_HEADERS = [
  { key: 'poRef', label: 'PO Reference *' },
  { key: 'supplier', label: 'Supplier Name *' },
  { key: 'orderDate', label: 'Order Date (YYYY-MM-DD)' },
  { key: 'expectedDeliveryDate', label: 'Expected Delivery Date (YYYY-MM-DD)' },
  { key: 'status', label: 'Status (pending/approved/received/closed/cancelled)' },
  { key: 'sku', label: 'Product SKU' },
  { key: 'productName', label: 'Product Name' },
  { key: 'quantity', label: 'Quantity *' },
  { key: 'unitPrice', label: 'Unit Price (Amount) *' },
  { key: 'tax', label: 'Tax' },
  { key: 'notes', label: 'Notes' }
];

const PO_STATUS_ENUM = [
  'draft', 'pending', 'pending_approval', 'approved',
  'partially_received', 'fully_received', 'received',
  'closed', 'cancelled',
];

const PO_STATUS_ALIASES = {
  done: 'closed',
  complete: 'closed',
  completed: 'closed',
  finish: 'closed',
  finished: 'closed',
  'fully received': 'fully_received',
  'partially received': 'partially_received',
  'pending approval': 'pending_approval',
  cancel: 'cancelled',
  canceled: 'cancelled',
};

function normalizePoStatus(raw) {
  const value = String(raw || 'pending').trim().toLowerCase();
  if (!value) return 'pending';
  if (PO_STATUS_ALIASES[value]) return PO_STATUS_ALIASES[value];
  if (PO_STATUS_ENUM.includes(value)) return value;
  return null;
}

function pushValidationErrors(errors, row, field, err) {
  if (err?.name === 'ValidationError' && err.errors) {
    Object.values(err.errors).forEach((ve) => {
      errors.push({
        row,
        field: ve.path || field,
        message: ve.message || err.message,
      });
    });
    return;
  }
  errors.push({ row, field, message: err?.message || String(err) });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseImportPoDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(epoch.getTime() + value * 86400000);
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmyOrMdy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmyOrMdy) {
    const a = Number(dmyOrMdy[1]);
    const b = Number(dmyOrMdy[2]);
    const y = Number(dmyOrMdy[3]);
    if (a > 12) return new Date(y, b - 1, a);
    if (b > 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(epoch.getTime() + serial * 86400000);
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

function dateGroupKey(value) {
  const d = parseImportPoDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPoImportCell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
}

function buildPoImportGroupKey(row) {
  const ref = String(getPoImportCell(row, 'PO Reference *', 'PO Reference')).trim();
  const supplierName = String(getPoImportCell(row, 'Supplier Name *', 'Supplier Name')).trim();
  const orderDateKey = dateGroupKey(getPoImportCell(row, 'Order Date (YYYY-MM-DD)', 'Order Date'));
  const deliveryKey = dateGroupKey(
    getPoImportCell(row, 'Expected Delivery Date (YYYY-MM-DD)', 'Expected Delivery Date')
  );
  return `${supplierName.toLowerCase()}||${ref.toLowerCase()}||${orderDateKey}||${deliveryKey}`;
}

async function findSupplierByName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const exact = await Supplier.findOne({ name: trimmed });
  if (exact) return exact;
  return Supplier.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
  });
}

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
    { 'items.sku': regex },
    { 'items.itemName': regex },
  ];

  if (matchingSuppliers.length) {
    or.push({ supplier: { $in: matchingSuppliers.map((s) => s._id) } });
  }
  if (matchingPrs.length) {
    or.push({ purchaseRequisite: { $in: matchingPrs.map((p) => p._id) } });
  }

  return or;
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
        productName: '',
        quantity: 10,
        unitPrice: 250,
        tax: 0,
        notes: 'Same vendor + same PO Reference = one PO with multiple lines'
      },
      {
        poRef: 'PO-1',
        supplier: 'Acme Supplies',
        orderDate: '2026-06-23',
        expectedDeliveryDate: '2026-06-30',
        status: 'pending',
        sku: 'PROD-002',
        productName: '',
        quantity: 5,
        unitPrice: 800,
        tax: 0,
        notes: ''
      },
      {
        poRef: 'PO-2',
        supplier: 'Global Traders',
        orderDate: '2026-07-01',
        expectedDeliveryDate: '2026-07-10',
        status: 'pending',
        sku: 'PROD-003',
        productName: '',
        quantity: 8,
        unitPrice: 150,
        tax: 0,
        notes: 'Different vendor + PO ref + dates = separate purchase order'
      },
      {
        poRef: 'PO-3',
        supplier: 'Acme Supplies',
        orderDate: '2026-07-15',
        expectedDeliveryDate: '2026-07-25',
        status: 'approved',
        sku: 'PROD-001',
        productName: 'New item without SKU example',
        quantity: 4,
        unitPrice: 260,
        tax: 0,
        notes: 'Same vendor but different PO ref or dates = another PO'
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

    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Group rows: one PO per unique vendor + PO reference + order/delivery dates
    const groups = new Map();
    const errors = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const ref = String(getPoImportCell(row, 'PO Reference *', 'PO Reference')).trim();
      const supplierName = String(getPoImportCell(row, 'Supplier Name *', 'Supplier Name')).trim();

      if (!ref) {
        errors.push({ row: rowNum, field: 'PO Reference *', message: 'PO Reference is required' });
        return;
      }
      if (!supplierName) {
        errors.push({
          row: rowNum,
          field: 'Supplier Name *',
          message: `PO '${ref}': Supplier Name is required`,
        });
        return;
      }

      const key = buildPoImportGroupKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          ref,
          supplierName,
          orderDateKey: dateGroupKey(getPoImportCell(row, 'Order Date (YYYY-MM-DD)', 'Order Date')),
          deliveryDateKey: dateGroupKey(
            getPoImportCell(row, 'Expected Delivery Date (YYYY-MM-DD)', 'Expected Delivery Date')
          ),
          entries: [],
        });
      }
      groups.get(key).entries.push({ row, rowNum });
    });

    let imported = 0;
    let failed = 0;
    let skipped = 0;
    const readyToSave = [];

    // Phase 1: validate every vendor PO / line and collect ALL errors together
    for (const [, group] of groups) {
      const { ref, supplierName, entries } = group;
      const first = entries[0].row;
      const firstRowNum = entries[0].rowNum;
      const label = `PO '${ref}' / Vendor '${supplierName}'`;
      const poErrors = [];
      let supplier = null;

      try {
        supplier = await findSupplierByName(supplierName);
        if (!supplier) {
          poErrors.push({
            row: firstRowNum,
            field: 'Supplier Name *',
            message: `${label}: Supplier '${supplierName}' not found in master`,
          });
        }

        const headerOrderDate = parseImportPoDate(
          getPoImportCell(first, 'Order Date (YYYY-MM-DD)', 'Order Date')
        );
        const headerDeliveryDate = parseImportPoDate(
          getPoImportCell(first, 'Expected Delivery Date (YYYY-MM-DD)', 'Expected Delivery Date')
        );

        for (const { row, rowNum } of entries) {
          const rowSupplier = String(getPoImportCell(row, 'Supplier Name *', 'Supplier Name')).trim();
          if (rowSupplier && rowSupplier.toLowerCase() !== supplierName.toLowerCase()) {
            poErrors.push({
              row: rowNum,
              field: 'Supplier Name *',
              message: `${label}: mixed vendor '${rowSupplier}' in the same PO group`,
            });
          }

          const rowOrderKey = dateGroupKey(getPoImportCell(row, 'Order Date (YYYY-MM-DD)', 'Order Date'));
          const rowDeliveryKey = dateGroupKey(
            getPoImportCell(row, 'Expected Delivery Date (YYYY-MM-DD)', 'Expected Delivery Date')
          );
          if (group.orderDateKey && rowOrderKey && rowOrderKey !== group.orderDateKey) {
            poErrors.push({
              row: rowNum,
              field: 'Order Date (YYYY-MM-DD)',
              message: `${label}: order date must match other lines in this PO group`,
            });
          }
          if (group.deliveryDateKey && rowDeliveryKey && rowDeliveryKey !== group.deliveryDateKey) {
            poErrors.push({
              row: rowNum,
              field: 'Expected Delivery Date (YYYY-MM-DD)',
              message: `${label}: expected delivery date must match other lines in this PO group`,
            });
          }
        }

        const statusRaw = (
          first['Status (pending/approved/received/closed/cancelled)']
          || first['Status (pending/approved/received/cancelled)']
          || first['Status']
          || 'pending'
        );
        const status = normalizePoStatus(statusRaw);
        if (!status) {
          poErrors.push({
            row: firstRowNum,
            field: 'Status',
            message: `${label}: status '${String(statusRaw).trim()}' is invalid. Use one of: ${PO_STATUS_ENUM.join(', ')}`,
          });
        }

        const items = [];
        for (const { row, rowNum } of entries) {
          const sku = String(getPoImportCell(row, 'Product SKU', 'Product SKU *', 'SKU') || '').trim();
          const productName = String(
            getPoImportCell(row, 'Product Name', 'Item Name', 'Product Title') || ''
          ).trim();
          const quantity = parseFloat(row['Quantity *']);
          const unitPrice = parseFloat(row['Unit Price (Amount) *']);

          if (!sku && !productName) {
            skipped++;
            poErrors.push({
              row: rowNum,
              field: 'Product SKU / Product Name',
              message: `${label}: provide Product SKU or Product Name — line not added`,
            });
            continue;
          }

          if (!quantity || quantity <= 0) {
            skipped++;
            poErrors.push({
              row: rowNum,
              field: 'Quantity *',
              message: `${label}: ${sku || productName} — quantity must be greater than 0 — line not added`,
            });
            continue;
          }

          if (isNaN(unitPrice) || unitPrice < 0) {
            skipped++;
            poErrors.push({
              row: rowNum,
              field: 'Unit Price (Amount) *',
              message: `${label}: ${sku || productName} — unit price must be a valid number — line not added`,
            });
            continue;
          }

          if (sku) {
            const product = await findProductBySkuForImport(sku);
            if (!product) {
              skipped++;
              poErrors.push({
                row: rowNum,
                field: 'Product SKU',
                message: `Product not available — SKU '${sku}' was not added to ${label} (not found in Product Master; check spelling, leading zeros, or use Product Name for a new item)`,
              });
              continue;
            }
            items.push({
              product: product._id,
              sku: product.sku || sku,
              itemName: productName || product.title || product.name || '',
              quantity,
              unitPrice,
              total: quantity * unitPrice,
            });
          } else {
            items.push({
              itemName: productName,
              sku: '',
              quantity,
              unitPrice,
              total: quantity * unitPrice,
            });
          }
        }

        if (items.length === 0) {
          poErrors.push({
            row: firstRowNum,
            field: label,
            message: `${label} was not created — no valid line items found (need Product SKU or Product Name with qty/price)`,
          });
        }

        if (poErrors.length > 0) {
          failed++;
          errors.push(...poErrors);
          continue;
        }

        const noteParts = [
          first['Notes'] ? String(first['Notes']).trim() : '',
          `Excel ref: ${ref}`,
          `Vendor: ${supplierName}`,
        ].filter(Boolean);

        readyToSave.push({
          ref: label,
          rowNum: firstRowNum,
          poData: {
            purchaseRequisitionNumber: ref,
            supplier: supplier._id,
            orderDate: headerOrderDate || new Date(),
            expectedDeliveryDate: headerDeliveryDate || undefined,
            status,
            items,
            tax: parseFloat(first['Tax']) || 0,
            notes: noteParts.join(' | '),
          },
        });
      } catch (err) {
        failed++;
        pushValidationErrors(errors, firstRowNum, label, err);
      }
    }

    // Phase 2: save only fully-valid POs (errors from phase 1 already listed together)
    const allocatePoNumber = createPoNumberAllocator();
    for (const item of readyToSave) {
      try {
        item.poData.poNumber = await allocatePoNumber(); 
        const saved = await new PurchaseOrder(item.poData).save();
        await linkPurchaseOrderProductsToSupplier(saved).catch(() => {});
        imported++;
      } catch (err) {
        failed++;
        pushValidationErrors(errors, item.rowNum, `PO '${item.ref}'`, err);
      }
    }

    res.json({
      imported,
      updated: 0,
      failed,
      skipped,
      totalRows: rows.length,
      purchaseOrdersCreated: imported,
      groupsProcessed: groups.size,
      errors,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function normalizePurchaseOrderItems(rawItems = []) {
  return (rawItems || []).map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const productId = item.product?._id || item.product || null;
    const itemName = String(item.itemName || item.productName || '').trim();
    const sku = String(item.sku || '').trim();

    if (!itemName) {
      const err = new Error(`Item ${index + 1}: title is required (SKU is optional)`);
      err.status = 400;
      throw err;
    }

    const normalized = {
      ...item,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      sku,
      itemName,
    };

    if (productId) {
      normalized.product = productId;
    } else {
      delete normalized.product;
    }

    return normalized;
  });
}

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
    const items = normalizePurchaseOrderItems(req.body.items || []);

    const poData = {
      ...req.body,
      items,
      poNumber: await generatePONumber()
    };

    const purchaseOrder = new PurchaseOrder(poData);
    await purchaseOrder.save();
    await linkPurchaseOrderProductsToSupplier(purchaseOrder).catch((err) => {
      console.warn('Could not link PO products to supplier:', err.message);
    });

    const populatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate(PO_POPULATE);

    res.status(201).json(populatedPO);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

// PUT update purchase order
router.put('/:id', async (req, res) => {
  try {
    if (req.body.items) {
      req.body.items = normalizePurchaseOrderItems(req.body.items);
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

    if (purchaseOrder.supplier) {
      await linkPurchaseOrderProductsToSupplier(purchaseOrder).catch((err) => {
        console.warn('Could not link PO products to supplier:', err.message);
      });
    }

    res.json(purchaseOrder);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
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

