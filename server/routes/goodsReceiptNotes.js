const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const GoodsReceiptNote = require('../models/GoodsReceiptNote');
const { paginate } = require('../utils/pagination');
const {
  POPULATE,
  createGrnFromPO,
  updateGrn,
  submitForInspection,
  getDashboardStats,
} = require('../goods-receipt-note/services/grnService');
const { getGrnAuditTrail } = require('../goods-receipt-note/services/grnAuditService');
const { runThreeWayMatch, loadPoTotalForMatch } = require('../goods-receipt-note/services/grnThreeWayMatchService');
const { generateGrnPdfHtml } = require('../goods-receipt-note/pdf/grnPdf');
const { logGrnAudit } = require('../goods-receipt-note/services/grnAuditService');
const { tryCloseLinkedPurchaseRequisition } = require('../goods-receipt-note/services/grnInventoryService');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'grn');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// Dashboard KPIs & charts
router.get('/dashboard/stats', async (_req, res) => {
  try {
    res.json(await getDashboardStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List GRNs with search & filters
router.get('/', async (req, res) => {
  try {
    const { status, supplier, warehouse, search, fromDate, toDate, page, limit } = req.query;
    const query = {};

    if (status) query.receiptStatus = status;
    if (supplier) query.supplier = supplier;
    if (warehouse) query.warehouse = warehouse;
    if (fromDate || toDate) {
      query.grnDate = {};
      if (fromDate) query.grnDate.$gte = new Date(fromDate);
      if (toDate) query.grnDate.$lte = new Date(`${toDate}T23:59:59.999`);
    }
    if (search) {
      query.$or = [
        { grnNumber: { $regex: search, $options: 'i' } },
        { purchaseOrderNumber: { $regex: search, $options: 'i' } },
        { purchaseRequisitionNumber: { $regex: search, $options: 'i' } },
        { gisNumber: { $regex: search, $options: 'i' } },
        { 'deliveryInfo.invoiceNumber': { $regex: search, $options: 'i' } },
        { 'supplierDetails.name': { $regex: search, $options: 'i' } },
        { 'items.sku': { $regex: search, $options: 'i' } },
      ];
    }

    if (page || limit) {
      const result = await paginate(GoodsReceiptNote, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { grnDate: -1 },
        populate: POPULATE,
      });
      res.json(result);
    } else {
      const list = await GoodsReceiptNote.find(query).populate(POPULATE).sort({ grnDate: -1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create GRN from PO
router.post('/from-po/:poId', async (req, res) => {
  try {
    const grn = await createGrnFromPO(req.params.poId, req.body);
    res.status(201).json(grn);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST create (manual body)
router.post('/', async (req, res) => {
  try {
    if (!req.body.purchaseOrder) {
      return res.status(400).json({ error: 'purchaseOrder is required' });
    }
    const grn = await createGrnFromPO(req.body.purchaseOrder, req.body);
    res.status(201).json(grn);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reports summary
router.get('/reports/summary', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    const list = await GoodsReceiptNote.find()
      .populate(POPULATE)
      .sort({ grnDate: -1 })
      .limit(500)
      .lean();
    res.json({ stats, grns: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Single GRN
router.get('/:id', async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id).populate(POPULATE);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    res.json(grn.toObject());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Audit trail
router.get('/:id/audit', async (req, res) => {
  try {
    res.json(await getGrnAuditTrail(req.params.id));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PDF HTML
router.get('/:id/pdf', async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id).populate(POPULATE);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    const html = generateGrnPdfHtml(grn.toObject());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Three-way match
router.post('/:id/three-way-match', async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    const poTotal = await loadPoTotalForMatch(grn.purchaseOrder);
    grn.threeWayMatch = runThreeWayMatch(grn.toObject(), req.body.invoiceTotal);
    grn.threeWayMatch.poTotal = poTotal;
    await grn.save();
    await logGrnAudit({
      grnId: grn._id,
      grnNumber: grn.grnNumber,
      action: 'three_way_match',
      performedBy: req.body.performedBy || 'System',
    });
    res.json(grn.threeWayMatch);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update GRN
router.put('/:id', async (req, res) => {
  try {
    const grn = await updateGrn(req.params.id, req.body, req.body.performedBy);
    res.json(grn);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Finalize receipt (updates inventory, PO, and creates purchase)
router.post('/:id/submit-inspection', async (req, res) => {
  try {
    const grn = await submitForInspection(req.params.id, req.body.performedBy || 'System');
    res.json(grn);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Close GRN
router.post('/:id/close', async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    grn.receiptStatus = 'closed';
    grn.closedByName = req.body.performedBy || 'System';
    grn.closedAt = new Date();
    await grn.save();
    await logGrnAudit({
      grnId: grn._id,
      grnNumber: grn.grnNumber,
      action: 'closed',
      performedBy: req.body.performedBy,
      newStatus: 'closed',
    });
    if (grn.purchaseOrder) {
      await tryCloseLinkedPurchaseRequisition(grn.purchaseOrder);
    }
    res.json(await GoodsReceiptNote.findById(grn._id).populate(POPULATE));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Upload attachment
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    grn.attachments.push({
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: `grn/${req.file.filename}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      category: req.body.category || 'other',
      uploadedBy: req.body.uploadedBy || 'System',
    });
    await grn.save();
    await logGrnAudit({
      grnId: grn._id,
      grnNumber: grn.grnNumber,
      action: 'attachment_added',
      performedBy: req.body.uploadedBy,
    });
    res.json(grn.attachments);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete GRN (draft only)
router.delete('/:id', async (req, res) => {
  try {
    const grn = await GoodsReceiptNote.findById(req.params.id);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    if (!['draft', 'cancelled'].includes(grn.receiptStatus) || grn.inventoryUpdated) {
      return res.status(400).json({ error: 'Only draft GRNs that have not been finalized can be deleted' });
    }
    await GoodsReceiptNote.findByIdAndDelete(req.params.id);
    res.json({ message: 'GRN deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
