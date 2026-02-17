const express = require('express');
const router = express.Router();
const multer = require('multer');
const Purchase = require('../models/Purchase');
const PurchaseOrder = require('../models/PurchaseOrder');
const Price = require('../models/Price');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper function to generate Purchase number
async function generatePurchaseNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PUR-${dateStr}-`;
  
  const lastPurchase = await Purchase.findOne({
    purchaseNumber: { $regex: `^${prefix}` }
  }).sort({ purchaseNumber: -1 });
  
  let sequence = 1;
  if (lastPurchase) {
    const lastSequence = parseInt(lastPurchase.purchaseNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }
  
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// GET all purchases (with pagination)
router.get('/', requirePermission('purchases.view'), async (req, res) => {
  try {
    const { supplier, paymentStatus, page, limit } = req.query;
    const query = {};
    
    if (supplier) {
      query.supplier = supplier;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    if (page || limit) {
      const result = await paginate(Purchase, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'supplier', select: 'name' },
          { path: 'location', select: 'name code' },
          { path: 'purchaseOrder', select: 'poNumber' },
          { path: 'items.product', select: 'name sku' }
        ]
      });
      res.json(result);
    } else {
      const purchases = await Purchase.find(query)
        .populate('supplier', 'name')
        .populate('location', 'name code')
        .populate('purchaseOrder', 'poNumber')
        .populate('items.product', 'name sku')
        .sort({ createdAt: -1 });
      res.json(purchases);
    }
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

// GET Excel template
router.get('/template', requirePermission('purchases.view'), (req, res) => {
  try {
    const headers = [
      { key: 'supplier', label: 'Supplier Name *' },
      { key: 'location', label: 'Location Code *' },
      { key: 'purchaseDate', label: 'Purchase Date' },
      { key: 'paymentStatus', label: 'Payment Status' },
      { key: 'notes', label: 'Notes' }
    ];
    
    const { generateTemplate } = require('../utils/excelGenerator');
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchases_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

