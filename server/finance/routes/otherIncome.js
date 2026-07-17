const express = require('express');
const multer = require('multer');
const FinanceOtherIncome = require('../models/FinanceOtherIncome');
const { requireFinance } = require('../utils/auth');
const { parseExcel } = require('../../utils/excelParser');
const { generateTemplate } = require('../../utils/excelGenerator');
const {
  billUpload,
  removeBillFile,
  applyBillToBody,
  coerceFinanceNumbers,
} = require('../utils/billUpload');
const { stampFxFields } = require('../../currency/utils/fxFields');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PRESET_INCOME_TYPES = ['Service Income', 'Other Income', 'Interest Income', 'Commission'];
const INCOME_STATUSES = ['Pending', 'Received', 'Cancelled'];

const INCOME_TEMPLATE_HEADERS = [
  { key: 'date', label: 'Date *' },
  { key: 'voucherNo', label: 'Voucher No' },
  { key: 'incomeType', label: 'Income Type' },
  { key: 'customer', label: 'Customer' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount *' },
  { key: 'gst', label: 'GST' },
  { key: 'status', label: 'Status' },
  { key: 'department', label: 'Department' },
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickCell(row, ...labels) {
  if (!row || typeof row !== 'object') return '';
  for (const label of labels) {
    if (row[label] != null && String(row[label]).trim() !== '') {
      return String(row[label]).trim();
    }
  }
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    const nk = String(key).toLowerCase().replace(/\*+$/, '').trim();
    normalized[nk] = value;
  }
  for (const label of labels) {
    const nk = String(label).toLowerCase().replace(/\*+$/, '').trim();
    if (normalized[nk] != null && String(normalized[nk]).trim() !== '') {
      return String(normalized[nk]).trim();
    }
  }
  return '';
}

function parseIncomeDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 30000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + serial * 86400000);
  }
  return null;
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = allowed.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || text;
}

function normalizeStatus(value) {
  const text = String(value || '').trim();
  if (!text) return 'Received';
  const match = INCOME_STATUSES.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || 'Received';
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

function mapIncomeRow(row) {
  const incomeTypeRaw = pickCell(row, 'Income Type', 'IncomeType', 'Type');
  return {
    date: parseIncomeDate(pickCell(row, 'Date *', 'Date')),
    voucherNo: pickCell(row, 'Voucher No', 'VoucherNo', 'Voucher', 'Invoice No', 'InvoiceNo'),
    incomeType: normalizeEnum(incomeTypeRaw, PRESET_INCOME_TYPES, 'Other Income') || 'Other Income',
    customer: pickCell(row, 'Customer'),
    description: pickCell(row, 'Description'),
    amount: Number(pickCell(row, 'Amount *', 'Amount')) || 0,
    gst: Number(pickCell(row, 'GST', 'Gst')) || 0,
    status: normalizeStatus(pickCell(row, 'Status')),
    department: pickCell(row, 'Department'),
  };
}

function isEmptyImportRow(row) {
  const mapped = mapIncomeRow(row);
  return !mapped.date && !mapped.voucherNo && !mapped.customer && !mapped.description && mapped.amount <= 0;
}

router.get('/template', requireFinance('finance.income.view'), (req, res) => {
  try {
    const sampleData = [
      {
        date: '2026-07-16',
        voucherNo: 'INC-20260716-001',
        incomeType: 'Service Income',
        customer: 'Acme Corp',
        description: 'Consulting fee',
        amount: 15000,
        gst: 2700,
        status: 'Received',
        department: 'Sales',
      },
    ];

    const buffer = generateTemplate(INCOME_TEMPLATE_HEADERS, sampleData, {
      instructions: [
        'Mandatory columns: Date, Amount.',
        'Voucher No is optional — a unique number is generated automatically when blank.',
        `Suggested Income Types: ${PRESET_INCOME_TYPES.join(', ')}. Custom types are also allowed.`,
        `Status: ${INCOME_STATUSES.join(', ')}.`,
        'Duplicate voucher numbers update the existing record when using Create & Update mode.',
      ],
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=income_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', requireFinance('finance.income.create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mode = 'both' } = req.body;
    const excelData = parseExcel(req.file.buffer);
    if (excelData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const rowNum = i + 2;

      if (isEmptyImportRow(row)) {
        skipped++;
        continue;
      }

      try {
        const incomeData = mapIncomeRow(row);

        if (!incomeData.date) {
          errors.push({ row: rowNum, field: 'Date', message: 'Valid date is required' });
          failed++;
          continue;
        }
        if (!incomeData.amount || incomeData.amount <= 0) {
          errors.push({ row: rowNum, field: 'Amount', message: 'Amount must be greater than zero' });
          failed++;
          continue;
        }
        if (!incomeData.incomeType?.trim()) {
          errors.push({ row: rowNum, field: 'Income Type', message: 'Income type is required' });
          failed++;
          continue;
        }

        if (!incomeData.voucherNo) {
          incomeData.voucherNo = await generateNextVoucherNo(incomeData.date);
        }

        const existing = await FinanceOtherIncome.findOne({ voucherNo: incomeData.voucherNo });

        if (existing) {
          if (mode === 'create') {
            errors.push({
              row: rowNum,
              field: 'Voucher No',
              message: `Voucher ${incomeData.voucherNo} already exists`,
            });
            failed++;
            continue;
          }
          await FinanceOtherIncome.findByIdAndUpdate(existing._id, incomeData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({
              row: rowNum,
              field: 'Voucher No',
              message: `Voucher ${incomeData.voucherNo} not found for update`,
            });
            failed++;
            continue;
          }
          await FinanceOtherIncome.create(incomeData);
          imported++;
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message });
        failed++;
      }
    }

    const totalRows = excelData.length - skipped;
    res.json({
      success: true,
      imported,
      updated,
      failed,
      skipped,
      totalRows,
      processed: imported + updated + failed,
      errors: errors.slice(0, 100),
      errorSummary: errors.reduce((acc, err) => {
        const key = (err.message || 'Unknown error').split('.')[0].slice(0, 120);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/',
  requireFinance('finance.income.create'),
  billUpload.single('bill'),
  async (req, res) => {
    try {
      let body = coerceFinanceNumbers({ ...req.body });
      body = applyBillToBody(body, req.file, null);
      if (!body.voucherNo?.trim()) {
        body.voucherNo = await generateNextVoucherNo(body.date || new Date());
      }
      const original =
        (Number(body.amount) || 0) + (Number(body.gst) || 0);
      body = await stampFxFields(body, {
        currency: body.currency || 'INR',
        originalAmount: body.originalAmount != null ? body.originalAmount : original,
        amountField: 'amount',
      });
      const item = await FinanceOtherIncome.create(body);
      res.status(201).json(item);
    } catch (error) {
      if (req.file) removeBillFile({ fileName: req.file.filename });
      res.status(400).json({ error: error.message });
    }
  }
);

router.put(
  '/:id',
  requireFinance('finance.income.update'),
  billUpload.single('bill'),
  async (req, res) => {
    try {
      const existing = await FinanceOtherIncome.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Income entry not found' });

      let body = coerceFinanceNumbers({ ...req.body });
      body = applyBillToBody(body, req.file, existing.bill);

      const item = await FinanceOtherIncome.findByIdAndUpdate(req.params.id, body, {
        new: true,
        runValidators: true,
      });
      res.json(item);
    } catch (error) {
      if (req.file) removeBillFile({ fileName: req.file.filename });
      res.status(400).json({ error: error.message });
    }
  }
);

router.delete('/:id', requireFinance('finance.income.delete'), async (req, res) => {
  try {
    const item = await FinanceOtherIncome.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Income entry not found' });
    if (item.bill) removeBillFile(item.bill);
    res.json({ message: 'Income entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
