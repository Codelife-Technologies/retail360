const express = require('express');
const FinanceOtherIncome = require('../models/FinanceOtherIncome');
const { requireFinance } = require('../utils/auth');

const router = express.Router();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function generateNextVoucherNo(date = new Date()) {
  const d = new Date(date);
  const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `INC-${key}-`;
  const last = await FinanceOtherIncome.findOne({
    voucherNo: { $regex: `^${escapeRegex(prefix)}` },
  })
    .sort({ voucherNo: -1 })
    .lean();

  let seq = 1;
  if (last?.voucherNo) {
    const match = String(last.voucherNo).match(/-(\d+)$/);
    if (match) seq = parseInt(match[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

router.post('/', requireFinance('finance.income.create'), async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.voucherNo?.trim()) {
      body.voucherNo = await generateNextVoucherNo(body.date || new Date());
    }
    const item = await FinanceOtherIncome.create(body);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', requireFinance('finance.income.update'), async (req, res) => {
  try {
    const item = await FinanceOtherIncome.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ error: 'Income entry not found' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requireFinance('finance.income.delete'), async (req, res) => {
  try {
    const item = await FinanceOtherIncome.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Income entry not found' });
    res.json({ message: 'Income entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
