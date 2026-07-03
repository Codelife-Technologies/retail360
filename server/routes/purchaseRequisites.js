const express = require('express');
const router = express.Router();
const PurchaseRequisite = require('../models/PurchaseRequisite');
const Product = require('../models/Product');
const Location = require('../models/Location');
const Supplier = require('../models/Supplier');
const Stock = require('../models/Stock');
const Price = require('../models/Price');
const { paginate } = require('../utils/pagination');
const logger = require('../utils/logger');
const {
  resolveLineSupplier,
  enrichLineWithSupplier,
  enrichLinesWithSupplier,
  hydratePrSupplierNames,
} = require('../utils/prSupplierUtils');
const { createPurchaseOrdersFromPr } = require('../services/prToPurchaseOrderService');

const UNAPPROVED_PR_STATUSES = ['draft', 'pending'];

function isUnapprovedPrStatus(status) {
  return UNAPPROVED_PR_STATUSES.includes(status);
}

async function generatePRNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PR-${dateStr}-`;

  const lastPR = await PurchaseRequisite.findOne({
    prNumber: { $regex: `^${prefix}` },
  }).sort({ prNumber: -1 });

  let sequence = 1;
  if (lastPR) {
    const parts = lastPR.prNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSequence)) sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

function mapReplenishItemToLine(item, unitPrice = 0, supplierInfo = {}) {
  const reorderQty = Math.max(
    0,
    item.reorderQty ??
      item.suggestedReorder ??
      item.suggestedQty ??
      0
  );

  const requestedQty =
    item.requestedQty != null && item.requestedQty > 0 ? item.requestedQty : reorderQty;

  if (requestedQty <= 0) {
    return null;
  }

  return {
    product: item.product._id || item.product,
    location: item.location._id || item.location,
    sku: item.product.sku || '',
    productTitle: item.product.title || item.product.name || '',
    locationName: item.location.name || '',
    currentStock: item.inventory?.currentStock ?? 0,
    minStock: item.inventory?.minStock ?? 0,
    suggestedQty: reorderQty || requestedQty,
    requestedQty,
    replenishStatus: item.replenishStatus || 'REORDER',
    supplier: supplierInfo.supplier || null,
    supplierName: supplierInfo.supplierName || '',
    unitPrice,
    notes: item.refillQty > 0 ? `Refill ${item.refillQty} from home` : '',
  };
}

async function getProductUnitPrice(productId) {
  const price = await Price.findOne({ product: productId, isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  return price?.purchasePrice || 0;
}

function lineKey(productId, locationId) {
  return `${productId.toString()}-${locationId.toString()}`;
}

function mergePrItems(existingItems, incomingItems) {
  const map = new Map();

  const addLine = (line) => {
    const productId = line.product?._id || line.product;
    const locationId = line.location?._id || line.location;
    if (!productId || !locationId) return;

    const key = lineKey(productId, locationId);
    const normalized = {
      ...line,
      product: productId,
      location: locationId,
      requestedQty: Math.max(1, line.requestedQty || 1),
    };

    const existing = map.get(key);
    if (existing) {
      existing.requestedQty += normalized.requestedQty;
      existing.suggestedQty = Math.max(existing.suggestedQty || 0, normalized.suggestedQty || 0);
      if (normalized.currentStock != null) existing.currentStock = normalized.currentStock;
      if (normalized.minStock != null) existing.minStock = normalized.minStock;
      if (normalized.unitPrice) existing.unitPrice = normalized.unitPrice;
      if (normalized.supplier) existing.supplier = normalized.supplier;
      if (normalized.supplierName) existing.supplierName = normalized.supplierName;
    } else {
      map.set(key, normalized);
    }
  };

  (existingItems || []).forEach((line) => addLine(line.toObject?.() || line));
  incomingItems.forEach(addLine);
  return Array.from(map.values());
}

async function buildLineFromManual({ productId, locationId, requestedQty = 1 }) {
  const product = await Product.findById(productId).lean();
  const location = await Location.findById(locationId).lean();
  if (!product) throw new Error('Product not found');
  if (!location) throw new Error('Location not found');

  const stock = await Stock.findOne({ product: productId, location: locationId }).lean();
  const currentStock = stock?.quantity ?? 0;
  const minStock = stock?.minStockLevel ?? 0;
  const qty = Math.max(1, Number(requestedQty) || 1);
  let replenishStatus = 'OK';
  if (currentStock <= minStock) replenishStatus = 'REORDER';
  else if (minStock > 0 && currentStock <= minStock * 1.5) replenishStatus = 'LOW';

  const unitPrice = await getProductUnitPrice(productId);
  const supplierInfo = await resolveLineSupplier(productId);

  return {
    product: productId,
    location: locationId,
    sku: product.sku || '',
    productTitle: product.title || product.name || '',
    locationName: location.name || '',
    currentStock,
    minStock,
    suggestedQty: qty,
    requestedQty: qty,
    replenishStatus,
    supplier: supplierInfo.supplier,
    supplierName: supplierInfo.supplierName,
    unitPrice,
    notes: '',
  };
}

async function buildIncomingLines(items = [], manualItems = []) {
  const incoming = [];

  for (const item of items) {
    const productId = item.product?._id || item.product;
    const locationId = item.location?._id || item.location;
    if (!productId || !locationId) continue;
    const unitPrice = await getProductUnitPrice(productId);
    const supplierInfo = await resolveLineSupplier(productId);
    const line = mapReplenishItemToLine(item, unitPrice, supplierInfo);
    if (line) incoming.push(line);
  }

  for (const manual of manualItems) {
    incoming.push(await buildLineFromManual(manual));
  }

  return incoming;
}

const POPULATE_LIST = [
  {
    path: 'items.product',
    select: 'name title sku hsnCode category suppliers',
    populate: { path: 'suppliers.supplier', select: 'name' },
  },
  { path: 'items.location', select: 'name code city' },
  { path: 'items.supplier', select: 'name' },
  { path: 'purchaseOrder', select: 'poNumber status' },
];

// GET all purchase requisites
router.get('/', async (req, res) => {
  try {
    const { status, search, unapproved, page, limit } = req.query;
    const query = {};

    if (unapproved === 'true') {
      query.status = { $in: UNAPPROVED_PR_STATUSES };
    } else if (status) {
      if (String(status).includes(',')) {
        query.status = { $in: String(status).split(',').map((s) => s.trim()).filter(Boolean) };
      } else {
        query.status = status;
      }
    }
    if (search) {
      query.$or = [
        { prNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { requestedBy: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { purchaseOrderNumber: { $regex: search, $options: 'i' } },
      ];
    }

    if (page || limit) {
      const result = await paginate(PurchaseRequisite, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: POPULATE_LIST,
      });
      result.data = result.data.map(hydratePrSupplierNames);
      res.json(result);
    } else {
      const records = await PurchaseRequisite.find(query)
        .populate(POPULATE_LIST)
        .sort({ createdAt: -1 });
      res.json(records.map(hydratePrSupplierNames));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create from replenish report items
router.post('/from-replenish', async (req, res) => {
  try {
    const {
      items = [],
      notes = '',
      requestedBy = '',
      name = '',
      department = '',
      appendToPrId = '',
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one replenish item is required' });
    }

    if (!appendToPrId) {
      if (!requestedBy.trim()) {
        return res.status(400).json({ error: 'requestedBy (PR creator name) is required' });
      }
    }

    const lineItems = await buildIncomingLines(items);

    if (lineItems.length === 0) {
      return res.status(400).json({ error: 'No valid replenish items to add' });
    }

    if (appendToPrId) {
      const existing = await PurchaseRequisite.findById(appendToPrId);
      if (!existing) {
        return res.status(404).json({ error: 'Purchase requisite not found' });
      }
      if (!isUnapprovedPrStatus(existing.status)) {
        return res.status(400).json({
          error: 'Items can only be added to an unapproved Purchase Requisition (draft or pending)',
        });
      }

      existing.items = mergePrItems(existing.items, lineItems);
      await existing.save();
      const populated = await PurchaseRequisite.findById(existing._id).populate(POPULATE_LIST);
      return res.json(hydratePrSupplierNames(populated));
    }

    const pr = new PurchaseRequisite({
      prNumber: await generatePRNumber(),
      status: 'pending',
      source: 'replenish_report',
      requestedBy: requestedBy.trim(),
      name: name.trim(),
      department,
      notes: notes || 'Stock reorder request from Replenish Report',
      items: lineItems,
    });

    await pr.save();
    const populated = await PurchaseRequisite.findById(pr._id).populate(POPULATE_LIST);
    res.status(201).json(hydratePrSupplierNames(populated));
  } catch (error) {
    logger.backend.error('Error creating PR from replenish', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// POST add items to an existing pending purchase requisite
router.post('/:id/add-items', async (req, res) => {
  try {
    const pr = await PurchaseRequisite.findById(req.params.id);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    if (!isUnapprovedPrStatus(pr.status)) {
      return res.status(400).json({
        error: 'Products can only be added to an unapproved Purchase Requisition (draft or pending)',
      });
    }

    const { items = [], manualItems = [] } = req.body;
    const incoming = await buildIncomingLines(items, manualItems);

    if (incoming.length === 0) {
      return res.status(400).json({ error: 'No valid items to add' });
    }

    pr.items = mergePrItems(pr.items, incoming);
    await pr.save();

    const populated = await PurchaseRequisite.findById(pr._id).populate(POPULATE_LIST);
    res.json(hydratePrSupplierNames(populated));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET single purchase requisite
router.get('/:id', async (req, res) => {
  try {
    const pr = await PurchaseRequisite.findById(req.params.id).populate(POPULATE_LIST);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    res.json(hydratePrSupplierNames(pr));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST approve / confirm purchase requisition
router.post('/:id/approve', async (req, res) => {
  try {
    const pr = await PurchaseRequisite.findById(req.params.id);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisition not found' });
    }
    if (!['draft', 'pending'].includes(pr.status)) {
      return res.status(400).json({
        error: 'Only draft or pending requisitions can be approved',
      });
    }
    if (!pr.items?.length) {
      return res.status(400).json({ error: 'Cannot approve a requisition with no items' });
    }

    const hydrated = await PurchaseRequisite.findById(pr._id).populate(POPULATE_LIST);
    const prDoc = hydratePrSupplierNames(hydrated);

    const { purchaseOrders, poNumbers } = await createPurchaseOrdersFromPr({
      ...prDoc,
      _id: pr._id,
      prNumber: pr.prNumber,
      notes: pr.notes,
      items: prDoc.items,
    });

    pr.status = 'po_created';
    if (req.body.approvedBy) pr.approvedBy = req.body.approvedBy;
    pr.approvedAt = new Date();
    pr.purchaseOrder = purchaseOrders[0]?._id || null;
    pr.purchaseOrderNumber = poNumbers.join(', ');
    pr.purchaseOrders = purchaseOrders.map((po) => po._id);
    await pr.save();

    const populated = await PurchaseRequisite.findById(pr._id).populate([
      ...POPULATE_LIST,
      {
        path: 'purchaseOrders',
        select: 'poNumber status needsVendorAssignment supplier',
        populate: { path: 'supplier', select: 'name' },
      },
    ]);

    res.json({
      ...hydratePrSupplierNames(populated),
      generatedPurchaseOrders: purchaseOrders.map((po) => ({
        _id: po._id,
        poNumber: po.poNumber,
        supplierName: po.supplierName || po.supplier?.name || '',
        needsVendorAssignment: Boolean(po.needsVendorAssignment),
        status: po.status,
        items: (po.items || []).map((item) => ({
          productId: item.product?._id || item.product,
          productTitle: item.product?.title || item.product?.name || item.sku || 'Product',
          sku: item.sku || item.product?.sku || '',
          quantity: item.quantity,
        })),
      })),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET PO draft payload for generating purchase order
router.get('/:id/po-draft', async (req, res) => {
  try {
    const pr = await PurchaseRequisite.findById(req.params.id).populate(POPULATE_LIST);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    if (pr.status === 'po_created' || pr.status === 'closed') {
      return res.status(400).json({
        error: 'Purchase orders have already been created for this requisition',
      });
    }
    if (pr.status !== 'approved') {
      return res.status(400).json({
        error: 'Purchase Order can only be created from an approved requisition',
      });
    }

    const locations = [...new Set(pr.items.map((i) => i.locationName).filter(Boolean))];

    const mergedItems = new Map();
    for (const line of pr.items) {
      const productId = (line.product?._id || line.product)?.toString();
      if (!productId) continue;
      const existing = mergedItems.get(productId);
      if (existing) {
        existing.quantity += line.requestedQty;
      } else {
        mergedItems.set(productId, {
          product: productId,
          quantity: line.requestedQty,
          unitPrice: line.unitPrice || 0,
          discountPercent: 0,
          unitOfMeasure: 'PCS',
          taxRate: '',
        });
      }
    }

    const items = Array.from(mergedItems.values());

    res.json({
      purchaseRequisiteId: pr._id,
      purchaseRequisitionNumber: pr.prNumber,
      notes: pr.notes || `Generated from Purchase Requisition ${pr.prNumber}`,
      deliveryLocation: locations.join(', '),
      status: 'draft',
      items,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase requisite manually
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    body.prNumber = body.prNumber || (await generatePRNumber());
    body.items = await enrichLinesWithSupplier(
      (body.items || []).map((line) => ({
        ...line,
        requestedQty: Math.max(1, line.requestedQty || line.suggestedQty || 1),
      }))
    );

    const pr = new PurchaseRequisite(body);
    await pr.save();
    const populated = await PurchaseRequisite.findById(pr._id).populate(POPULATE_LIST);
    res.status(201).json(hydratePrSupplierNames(populated));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update purchase requisition (pending/draft only)
router.put('/:id', async (req, res) => {
  try {
    const existing = await PurchaseRequisite.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Purchase requisition not found' });
    }
    if (!['draft', 'pending'].includes(existing.status)) {
      return res.status(400).json({
        error: 'Approved or completed requisitions cannot be edited',
      });
    }

    const updateBody = { ...req.body };
    if (updateBody.items) {
      updateBody.items = await enrichLinesWithSupplier(updateBody.items);
    }

    const pr = await PurchaseRequisite.findByIdAndUpdate(req.params.id, updateBody, {
      new: true,
      runValidators: true,
    }).populate(POPULATE_LIST);

    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    res.json(hydratePrSupplierNames(pr));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST link purchase order after PO is created
router.post('/:id/link-po', async (req, res) => {
  try {
    const { purchaseOrderId, purchaseOrderNumber } = req.body;
    if (!purchaseOrderId) {
      return res.status(400).json({ error: 'purchaseOrderId is required' });
    }

    const pr = await PurchaseRequisite.findByIdAndUpdate(
      req.params.id,
      {
        purchaseOrder: purchaseOrderId,
        purchaseOrderNumber: purchaseOrderNumber || '',
        status: 'po_created',
      },
      { new: true, runValidators: true }
    ).populate(POPULATE_LIST);

    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    res.json(hydratePrSupplierNames(pr));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE purchase requisite
router.delete('/:id', async (req, res) => {
  try {
    const pr = await PurchaseRequisite.findById(req.params.id);
    if (!pr) {
      return res.status(404).json({ error: 'Purchase requisite not found' });
    }
    if (pr.status === 'po_created' || pr.status === 'closed') {
      return res.status(400).json({ error: 'Cannot delete a requisition linked to a purchase order' });
    }
    if (pr.status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete an approved requisition' });
    }
    await PurchaseRequisite.findByIdAndDelete(req.params.id);
    res.json({ message: 'Purchase requisite deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
