const express = require('express');
const router = express.Router();
const multer = require('multer');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

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
router.get('/', requirePermission('purchaseOrders.view'), async (req, res) => {
  try {
    const { status, supplier, page, limit } = req.query;
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (supplier) {
      query.supplier = supplier;
    }
    
    if (page || limit) {
      const result = await paginate(PurchaseOrder, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'supplier', select: 'name' },
          { path: 'items.product', select: 'name sku' }
        ]
      });
      res.json(result);
    } else {
      const purchaseOrders = await PurchaseOrder.find(query)
        .populate('supplier', 'name')
        .populate('items.product', 'name sku')
        .sort({ createdAt: -1 });
      res.json(purchaseOrders);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single purchase order
router.get('/:id', requirePermission('purchaseOrders.view'), async (req, res) => {
  try {
    const purchaseOrder = await PurchaseOrder.findById(req.params.id)
      .populate('supplier')
      .populate('items.product');
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    res.json(purchaseOrder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create purchase order
router.post('/', requirePermission('purchaseOrders.create'), async (req, res) => {
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
      .populate('supplier')
      .populate('items.product');
    
    res.status(201).json(populatedPO);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update purchase order
router.put('/:id', requirePermission('purchaseOrders.update'), async (req, res) => {
  try {
    // Calculate item totals if items are being updated
    if (req.body.items) {
      req.body.items = req.body.items.map(item => ({
        ...item,
        total: item.quantity * item.unitPrice
      }));
    }
    
    const purchaseOrder = await PurchaseOrder.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('supplier')
      .populate('items.product');
    
    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    
    res.json(purchaseOrder);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE purchase order
router.delete('/:id', requirePermission('purchaseOrders.delete'), async (req, res) => {
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

// GET Excel template
router.get('/template', requirePermission('purchaseOrders.view'), (req, res) => {
  try {
    const headers = [
      { key: 'supplier', label: 'Supplier Name *' },
      { key: 'orderDate', label: 'Order Date' },
      { key: 'expectedDeliveryDate', label: 'Expected Delivery Date' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' }
    ];
    
    const { generateTemplate } = require('../utils/excelGenerator');
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchase_orders_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

