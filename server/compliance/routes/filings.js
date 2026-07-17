const express = require('express');
const ComplianceFiling = require('../models/ComplianceFiling');
const FilingMaster = require('../models/FilingMaster');
const { createCrudRouter } = require('../utils/crudFactory');
const { requireCompliance } = require('../utils/auth');
const { computeDueDateFromMaster, suggestPeriod } = require('../utils/filingDueDate');
const { getGovConfig, submitFilingToGovernment } = require('../utils/govFilingService');

const router = express.Router();

async function enrichFromMaster(payload) {
  const master = await FilingMaster.findById(payload.filingMaster);
  if (!master) {
    const error = new Error('Filing master not found');
    error.statusCode = 400;
    throw error;
  }
  if (!master.isActive) {
    const error = new Error('Selected filing master is inactive');
    error.statusCode = 400;
    throw error;
  }

  const period = payload.period || suggestPeriod(master);
  const dueDate = payload.dueDate
    ? new Date(payload.dueDate)
    : computeDueDateFromMaster(master, period);

  return {
    ...payload,
    formCode: master.code,
    formName: master.name,
    category: master.category,
    period,
    dueDate,
    department: payload.department || master.department,
    governmentPortal: master.governmentPortal,
    governmentFormCode: master.governmentFormCode,
  };
}

router.get('/gov-config', requireCompliance('compliance.filings.view'), (req, res) => {
  res.json(getGovConfig());
});

router.get('/active-masters', requireCompliance('compliance.filings.view'), async (req, res) => {
  try {
    const masters = await FilingMaster.find({ isActive: true })
      .sort({ category: 1, code: 1 })
      .lean();
    res.json(masters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/preview-due-date', requireCompliance('compliance.filings.view'), async (req, res) => {
  try {
    const { filingMasterId, period } = req.body;
    const master = await FilingMaster.findById(filingMasterId);
    if (!master) return res.status(404).json({ error: 'Filing master not found' });
    const resolvedPeriod = period || suggestPeriod(master);
    const dueDate = computeDueDateFromMaster(master, resolvedPeriod);
    res.json({ period: resolvedPeriod, dueDate, master });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/generate-upcoming', requireCompliance('compliance.filings.create'), async (req, res) => {
  try {
    const masters = await FilingMaster.find({ isActive: true }).lean();
    let created = 0;
    let skipped = 0;

    for (const master of masters) {
      const period = suggestPeriod(master);
      const existing = await ComplianceFiling.findOne({
        filingMaster: master._id,
        period,
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const dueDate = computeDueDateFromMaster(master, period);
      await ComplianceFiling.create({
        filingMaster: master._id,
        formCode: master.code,
        formName: master.name,
        category: master.category,
        period,
        dueDate,
        department: master.department,
        governmentPortal: master.governmentPortal,
        governmentFormCode: master.governmentFormCode,
        status: dueDate && new Date(dueDate) < new Date() ? 'Overdue' : 'Pending',
      });
      created += 1;
    }

    res.json({ created, skipped, totalMasters: masters.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/submit-government', requireCompliance('compliance.filings.update'), async (req, res) => {
  try {
    const filing = await ComplianceFiling.findById(req.params.id);
    if (!filing) return res.status(404).json({ error: 'Filing not found' });

    const master = await FilingMaster.findById(filing.filingMaster).lean();
    const result = await submitFilingToGovernment(filing, master);

    filing.governmentStatus = result.governmentStatus;
    filing.governmentReference = result.governmentReference;
    filing.governmentResponse = result.governmentResponse;
    filing.governmentSubmittedAt = new Date();
    filing.filedDate = result.filedDate;
    filing.status = result.status;
    filing.filedBy = req.user?.id;
    await filing.save();

    res.json(filing);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({
      error: error.message,
      details: error.responseBody || undefined,
    });
  }
});

const crudRouter = createCrudRouter(ComplianceFiling, {
  resourceName: 'Compliance Filings',
  searchFields: ['formCode', 'formName', 'period', 'remarks', 'governmentReference', 'status'],
  dateField: 'dueDate',
  defaultSort: { dueDate: -1 },
  viewPerm: 'compliance.filings.view',
  createPerm: 'compliance.filings.create',
  updatePerm: 'compliance.filings.update',
  deletePerm: 'compliance.filings.delete',
  extraFilters: ['category', 'governmentStatus'],
  beforeSave: async (payload, req, mode) => {
    if (mode === 'create' || payload.filingMaster) {
      return enrichFromMaster(payload);
    }
    return payload;
  },
  mapExportRow: (row) => ({
    'Form Code': row.formCode,
    'Form Name': row.formName,
    Category: row.category,
    Period: row.period,
    'Due Date': row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : '',
    'Filed Date': row.filedDate ? new Date(row.filedDate).toISOString().slice(0, 10) : '',
    Status: row.status,
    Amount: row.amount,
    Department: row.department,
    'Gov Status': row.governmentStatus,
    'Gov Reference': row.governmentReference,
    Remarks: row.remarks,
  }),
});

router.use(crudRouter);

module.exports = router;
