const express = require('express');
const FilingMaster = require('../models/FilingMaster');
const { requireCompliance } = require('../utils/auth');
const { collectDueItems } = require('./dashboard');
const {
  projectMasterDueDates,
  classifyFilingUrgency,
} = require('../utils/filingDueDate');
const { seedFilingMastersIfEmpty } = require('../utils/seedFilingMasters');

const router = express.Router();

const FILING_SOURCES = new Set(['GST', 'TDS', 'ITR', 'EPF', 'ESIC', 'Labour', 'Filing', 'Other']);

router.get('/events', requireCompliance('compliance.calendar.view'), async (req, res) => {
  try {
    const { from, to, category } = req.query;
    let items = await collectDueItems();

    const categoryMap = {
      GST: 'GST',
      TDS: 'TDS',
      PF: 'EPF',
      EPF: 'EPF',
      ESIC: 'ESIC',
      Audit: 'Audit',
      ITR: 'ITR',
      Filing: 'Filing',
      Labour: 'Labour',
      'License Renewals': 'License',
    };

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    // Project statutory due dates from Filing Master into the visible range
    if (fromDate && toDate) {
      try {
        await seedFilingMastersIfEmpty();
      } catch (error) {
        console.error('Filing master seed error:', error.message);
      }
      const masters = await FilingMaster.find({ isActive: true }).lean();
      const projected = projectMasterDueDates(masters, fromDate, toDate);

      const existingKeys = new Set(
        items
          .filter((i) => i.isFiling && i.formCode && i.period)
          .map((i) => `${i.formCode}::${i.period}`)
      );

      projected.forEach((item) => {
        const key = `${item.formCode}::${item.period}`;
        if (!existingKeys.has(key)) {
          items.push(item);
        }
      });
    }

    if (category) {
      const mapped = categoryMap[category] || category;
      items = items.filter((i) => i.source === mapped);
    }

    if (fromDate || toDate) {
      items = items.filter((i) => {
        if (!i.dueDate) return false;
        const d = new Date(i.dueDate);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    const today = new Date();
    items = items.map((item) => {
      const isFiling = Boolean(item.isFiling) || FILING_SOURCES.has(item.source);
      const urgency = classifyFilingUrgency(item, today);
      return {
        ...item,
        isFiling,
        important: Boolean(item.important) || isFiling,
        urgency,
      };
    });

    // Important filings first within the same day
    items.sort((a, b) => {
      const dateDiff = new Date(a.dueDate) - new Date(b.dueDate);
      if (dateDiff !== 0) return dateDiff;
      if (a.important !== b.important) return a.important ? -1 : 1;
      const rank = { overdue: 0, 'due-today': 1, 'due-soon': 2, upcoming: 3, filed: 4 };
      return (rank[a.urgency] ?? 5) - (rank[b.urgency] ?? 5);
    });

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
