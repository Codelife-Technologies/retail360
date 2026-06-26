const express = require('express');
const router = express.Router();
const GoodsInspectionSheet = require('../models/GoodsInspectionSheet');
const { paginate } = require('../utils/pagination');

router.get('/', async (req, res) => {
  try {
    const { status, purchaseOrder, page, limit } = req.query;
    const query = {};
    if (status) query.status = status;
    if (purchaseOrder) query.purchaseOrder = purchaseOrder;

    if (page || limit) {
      const result = await paginate(GoodsInspectionSheet, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'purchaseOrder', select: 'poNumber' },
          { path: 'supplier', select: 'name supplierCode' },
          { path: 'warehouse', select: 'name code' },
          { path: 'goodsReceiptNote', select: 'grnNumber' },
        ],
      });
      res.json(result);
    } else {
      const list = await GoodsInspectionSheet.find(query)
        .populate('purchaseOrder', 'poNumber')
        .populate('supplier', 'name')
        .populate('goodsReceiptNote', 'grnNumber')
        .sort({ createdAt: -1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const gis = await GoodsInspectionSheet.findById(req.params.id)
      .populate('purchaseOrder')
      .populate('supplier')
      .populate('warehouse')
      .populate('items.product', 'name title sku')
      .populate('goodsReceiptNote', 'grnNumber receiptStatus');
    if (!gis) return res.status(404).json({ error: 'GIS not found' });
    res.json(gis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
