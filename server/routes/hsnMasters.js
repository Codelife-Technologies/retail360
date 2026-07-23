const express = require('express');
const router = express.Router();
const HsnMaster = require('../models/HsnMaster');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

function buildPayload(body = {}) {
  const gstRate = body.gstRate != null && body.gstRate !== '' ? Number(body.gstRate) : 0;
  const payload = {
    hsnCode: String(body.hsnCode || '').trim().toUpperCase(),
    description: String(body.description || '').trim(),
    gstRate,
    cgstRate: body.cgstRate != null && body.cgstRate !== '' ? Number(body.cgstRate) : null,
    sgstRate: body.sgstRate != null && body.sgstRate !== '' ? Number(body.sgstRate) : null,
    igstRate: body.igstRate != null && body.igstRate !== '' ? Number(body.igstRate) : null,
    cessRate: body.cessRate != null && body.cessRate !== '' ? Number(body.cessRate) : 0,
    defaultUom: String(body.defaultUom || 'PCS').trim().toUpperCase() || 'PCS',
    chapter: String(body.chapter || '').trim(),
    isActive: body.isActive !== false && body.isActive !== 'false',
    notes: String(body.notes || '').trim(),
    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
    effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
  };
  if (!payload.hsnCode) {
    const err = new Error('HSN code is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(payload.gstRate) || payload.gstRate < 0 || payload.gstRate > 100) {
    const err = new Error('GST rate must be between 0 and 100');
    err.status = 400;
    throw err;
  }
  return payload;
}

// GET /hsn-masters
router.get('/', requirePermission('hsnMasters.view'), async (req, res) => {
  try {
    const { search, isActive, page, limit } = req.query;
    const query = {};
    if (search) {
      const term = String(search).trim();
      query.$or = [
        { hsnCode: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { chapter: { $regex: term, $options: 'i' } },
      ];
    }
    if (isActive === 'true') query.isActive = true;
    if (isActive === 'false') query.isActive = false;

    if (page || limit) {
      const result = await paginate(HsnMaster, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { hsnCode: 1 },
      });
      return res.json(result);
    }
    const rows = await HsnMaster.find(query).sort({ hsnCode: 1 });
    res.json(rows);
  } catch (error) {
    logger.backend.error('Error fetching HSN masters', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET /hsn-masters/active — PO / documents tax lookup (any authenticated user)
router.get('/active', async (req, res) => {
  try {
    const rows = await HsnMaster.find({ isActive: true })
      .select(
        'hsnCode description gstRate cgstRate sgstRate igstRate cessRate defaultUom chapter effectiveFrom effectiveTo'
      )
      .sort({ hsnCode: 1 })
      .lean();
    res.json(rows);
  } catch (error) {
    logger.backend.error('Error fetching active HSN masters', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET /hsn-masters/by-code/:code — used by PO tax lookup (any authenticated user)
router.get('/by-code/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'HSN code is required' });
    const row = await HsnMaster.findOne({ hsnCode: code, isActive: true }).lean();
    if (!row) return res.status(404).json({ error: 'HSN code not found' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hsn-masters/:id
router.get('/:id', requirePermission('hsnMasters.view'), async (req, res) => {
  try {
    const row = await HsnMaster.findById(req.params.id);
    if (!row) return res.status(404).json({ error: 'HSN master not found' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /hsn-masters
router.post('/', requirePermission('hsnMasters.create'), async (req, res) => {
  try {
    const payload = buildPayload(req.body);
    const row = await HsnMaster.create(payload);
    res.status(201).json(row);
  } catch (error) {
    logger.backend.error('Error creating HSN master', { error: error.message, body: req.body });
    if (error.code === 11000) {
      return res.status(400).json({ error: 'An HSN code with this value already exists' });
    }
    res.status(error.status || 400).json({ error: error.message });
  }
});

// PUT /hsn-masters/:id
router.put('/:id', requirePermission('hsnMasters.update'), async (req, res) => {
  try {
    const payload = buildPayload({ ...req.body, hsnCode: req.body.hsnCode });
    const row = await HsnMaster.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!row) return res.status(404).json({ error: 'HSN master not found' });
    res.json(row);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'An HSN code with this value already exists' });
    }
    res.status(error.status || 400).json({ error: error.message });
  }
});

// DELETE /hsn-masters/:id
router.delete('/:id', requirePermission('hsnMasters.delete'), async (req, res) => {
  try {
    const row = await HsnMaster.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ error: 'HSN master not found' });
    res.json({ message: 'HSN master deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
