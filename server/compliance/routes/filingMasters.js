const express = require('express');
const { createCrudRouter } = require('../utils/crudFactory');
const FilingMaster = require('../models/FilingMaster');
const { seedFilingMastersIfEmpty } = require('../utils/seedFilingMasters');
const { requireCompliance } = require('../utils/auth');

const crudRouter = createCrudRouter(FilingMaster, {
  resourceName: 'Filing Masters',
  searchFields: ['code', 'name', 'category', 'description', 'governmentPortal'],
  dateField: null,
  defaultSort: { category: 1, code: 1 },
  viewPerm: 'compliance.filingMaster.view',
  createPerm: 'compliance.filingMaster.create',
  updatePerm: 'compliance.filingMaster.update',
  deletePerm: 'compliance.filingMaster.delete',
  extraFilters: ['category', 'frequency', 'isActive'],
  mapExportRow: (row) => ({
    Code: row.code,
    Name: row.name,
    Category: row.category,
    Frequency: row.frequency,
    'Due Day': row.dueDay,
    'Due Offset Months': row.dueOffsetMonths,
    'Due Month': row.dueMonth || '',
    Department: row.department,
    Portal: row.governmentPortal,
    'Gov Form Code': row.governmentFormCode,
    Active: row.isActive ? 'Yes' : 'No',
    Description: row.description,
    'Company Due Date Note': row.companyDueDateNote,
  }),
});

const router = express.Router();

router.post('/seed-defaults', requireCompliance('compliance.filingMaster.create'), async (req, res) => {
  try {
    const result = await seedFilingMastersIfEmpty();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.use(async (req, res, next) => {
  if (req.method === 'GET') {
    try {
      await seedFilingMastersIfEmpty();
    } catch (error) {
      console.error('Filing master seed error:', error.message);
    }
  }
  next();
});

router.use(crudRouter);

module.exports = router;
