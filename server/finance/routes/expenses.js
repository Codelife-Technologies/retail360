const express = require('express');
const multer = require('multer');
const FinanceExpense = require('../models/FinanceExpense');
const { paginate } = require('../../utils/pagination');
const { parseExcel } = require('../../utils/excelParser');
const { generateTemplate } = require('../../utils/excelGenerator');
const { requireFinance } = require('../utils/auth');
const {
  parseDateRange,
  buildDateQuery,
  CATEGORY_LIST,
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  EXPENSE_STATUSES,
  getPastMonthsRange,
  getPastMonthKeys,
  toDateInputValue,
} = require('../utils/constants');
const { getFinanceSnapshot } = require('../services/financeAnalytics');
const { sendWorkbook } = require('../utils/export');
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

const EXPENSE_TEMPLATE_HEADERS = [
  { key: 'date', label: 'Date *' },
  { key: 'voucherNo', label: 'Voucher No' },
  { key: 'category', label: 'Category *' },
  { key: 'subcategory', label: 'Subcategory' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount *' },
  { key: 'gst', label: 'GST' },
  { key: 'paymentMode', label: 'Payment Mode' },
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

function parseExpenseDate(value) {
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

function normalizeCategory(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const exact = CATEGORY_LIST.find((c) => c.toLowerCase() === text.toLowerCase());
  if (exact) return exact;
  const partial = CATEGORY_LIST.find((c) => text.toLowerCase().includes(c.toLowerCase()));
  return partial || text;
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = allowed.find((item) => item.toLowerCase() === text.toLowerCase());
  return match || fallback;
}

async function generateNextVoucherNo(date = new Date()) {
  const d = new Date(date);
  const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `EXP-${key}-`;
  const last = await FinanceExpense.findOne({
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

function mapExpenseRow(row) {
  const category = normalizeCategory(pickCell(row, 'Category *', 'Category'));
  const subcategory = pickCell(row, 'Subcategory', 'Sub Category');
  const allowedSubs = EXPENSE_CATEGORIES[category] || [];

  return {
    date: parseExpenseDate(pickCell(row, 'Date *', 'Date')),
    voucherNo: pickCell(row, 'Voucher No', 'VoucherNo', 'Voucher'),
    category,
    subcategory: allowedSubs.includes(subcategory) ? subcategory : subcategory,
    vendor: pickCell(row, 'Vendor'),
    description: pickCell(row, 'Description'),
    amount: Number(pickCell(row, 'Amount *', 'Amount')) || 0,
    gst: Number(pickCell(row, 'GST', 'Gst')) || 0,
    paymentMode: normalizeEnum(pickCell(row, 'Payment Mode', 'PaymentMode'), PAYMENT_MODES, 'Bank Transfer'),
    status: normalizeEnum(pickCell(row, 'Status'), EXPENSE_STATUSES, 'Paid'),
    department: pickCell(row, 'Department'),
  };
}

function isEmptyImportRow(row) {
  const mapped = mapExpenseRow(row);
  return !mapped.date && !mapped.voucherNo && !mapped.vendor && !mapped.description && mapped.amount <= 0;
}

router.get('/', requireFinance('finance.expense.view'), async (req, res) => {
  try {
    const { dateFrom, dateTo } = parseDateRange(req.query);
    const query = { ...buildDateQuery('date', dateFrom, dateTo) };
    if (req.query.category) query.category = req.query.category;
    if (req.query.status) query.status = req.query.status;
    if (req.query.paymentMode) query.paymentMode = req.query.paymentMode;
    if (req.query.department) query.department = req.query.department;
    if (req.query.vendor) query.vendor = { $regex: escapeRegex(req.query.vendor), $options: 'i' };
    if (req.query.search?.trim()) {
      const term = escapeRegex(req.query.search.trim());
      query.$or = [
        { voucherNo: { $regex: term, $options: 'i' } },
        { vendor: { $regex: term, $options: 'i' } },
        { description: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
        { subcategory: { $regex: term, $options: 'i' } },
      ];
    }

    if (req.query.export) {
      const rows = await FinanceExpense.find(query).sort({ date: -1 }).lean();
      return sendWorkbook(
        res,
        rows.map((e) => ({
          Date: e.date,
          VoucherNo: e.voucherNo,
          Category: e.category,
          Subcategory: e.subcategory,
          Vendor: e.vendor,
          Description: e.description,
          Amount: e.amount,
          GST: e.gst,
          PaymentMode: e.paymentMode,
          Status: e.status,
          Department: e.department,
        })),
        'Expense_Report',
        req.query.export
      );
    }

    const result = await paginate(FinanceExpense, query, {
      page: req.query.page || 1,
      limit: req.query.limit || 15,
      sort: { date: -1 },
    });

    const snap = await getFinanceSnapshot(req.query);

    const chartRange = getPastMonthsRange(6);
    const chartQuery = {
      category: req.query.category,
      status: req.query.status,
      department: req.query.department,
      paymentMode: req.query.paymentMode,
      dateFrom: toDateInputValue(chartRange.dateFrom),
      dateTo: toDateInputValue(chartRange.dateTo),
    };
    const chartSnap = await getFinanceSnapshot(chartQuery);
    const monthKeys = getPastMonthKeys(6);
    const expenseByMonth = new Map(monthKeys.map((key) => [key, 0]));
    (chartSnap.charts.revenueVsExpense || []).forEach((row) => {
      if (expenseByMonth.has(row.month)) {
        expenseByMonth.set(row.month, row.expense || 0);
      }
    });

    res.json({
      ...result,
      cards: snap.expenseCards,
      charts: {
        monthlyExpense: monthKeys.map((month) => ({
          month,
          expense: expenseByMonth.get(month) || 0,
        })),
        expenseByCategory: chartSnap.charts.expenseByCategory,
        expenseByDepartment: chartSnap.charts.expenseByDepartment,
        expenseByPaymentMode: chartSnap.charts.expenseByPaymentMode,
      },
      insights: snap.insights,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/template', requireFinance('finance.expense.view'), (req, res) => {
  try {
    const sampleData = [
      {
        date: '2026-07-16',
        voucherNo: 'EXP-20260716-001',
        category: 'Office',
        subcategory: 'Rent',
        vendor: 'Landlord Pvt Ltd',
        description: 'July office rent',
        amount: 25000,
        gst: 0,
        paymentMode: 'Bank Transfer',
        status: 'Paid',
        department: 'Admin',
      },
    ];

    const buffer = generateTemplate(EXPENSE_TEMPLATE_HEADERS, sampleData, {
      instructions: [
        'Mandatory columns: Date, Category, Amount.',
        'Voucher No is optional — a unique number is generated automatically when blank.',
        `Suggested categories: ${CATEGORY_LIST.join(', ')}. Custom categories are also allowed.`,
        `Payment Mode: ${PAYMENT_MODES.join(', ')}.`,
        `Status: ${EXPENSE_STATUSES.join(', ')}.`,
        'Duplicate voucher numbers update the existing record when using Create & Update mode.',
      ],
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=expense_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', requireFinance('finance.expense.create'), upload.single('file'), async (req, res) => {
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
        const expenseData = mapExpenseRow(row);

        if (!expenseData.date) {
          errors.push({ row: rowNum, field: 'Date', message: 'Valid date is required' });
          failed++;
          continue;
        }
        if (!expenseData.category?.trim()) {
          errors.push({
            row: rowNum,
            field: 'Category',
            message: 'Category is required (preset or custom)',
          });
          failed++;
          continue;
        }
        if (!expenseData.amount || expenseData.amount <= 0) {
          errors.push({ row: rowNum, field: 'Amount', message: 'Amount must be greater than zero' });
          failed++;
          continue;
        }

        if (!expenseData.voucherNo) {
          expenseData.voucherNo = await generateNextVoucherNo(expenseData.date);
        }

        let existing = await FinanceExpense.findOne({ voucherNo: expenseData.voucherNo });

        if (existing) {
          if (mode === 'create') {
            errors.push({
              row: rowNum,
              field: 'Voucher No',
              message: `Voucher ${expenseData.voucherNo} already exists`,
            });
            failed++;
            continue;
          }
          await FinanceExpense.findByIdAndUpdate(existing._id, expenseData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({
              row: rowNum,
              field: 'Voucher No',
              message: `Voucher ${expenseData.voucherNo} not found for update`,
            });
            failed++;
            continue;
          }
          await FinanceExpense.create(expenseData);
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

router.get('/:id', requireFinance('finance.expense.view'), async (req, res) => {
  try {
    const item = await FinanceExpense.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Expense not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/',
  requireFinance('finance.expense.create'),
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
      const item = await FinanceExpense.create(body);
      res.status(201).json(item);
    } catch (error) {
      if (req.file) removeBillFile({ fileName: req.file.filename });
      res.status(400).json({ error: error.message });
    }
  }
);

router.put(
  '/:id',
  requireFinance('finance.expense.update'),
  billUpload.single('bill'),
  async (req, res) => {
    try {
      const existing = await FinanceExpense.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Expense not found' });

      let body = coerceFinanceNumbers({ ...req.body });
      body = applyBillToBody(body, req.file, existing.bill);

      const item = await FinanceExpense.findByIdAndUpdate(req.params.id, body, {
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

router.delete('/:id', requireFinance('finance.expense.delete'), async (req, res) => {
  try {
    const item = await FinanceExpense.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Expense not found' });
    if (item.bill) removeBillFile(item.bill);
    res.json({ message: 'Expense deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
