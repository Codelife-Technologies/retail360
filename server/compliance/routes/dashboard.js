const express = require('express');
const ComplianceFiling = require('../models/ComplianceFiling');
const GstFiling = require('../models/GstFiling');
const TdsFiling = require('../models/TdsFiling');
const PayrollRegister = require('../models/PayrollRegister');
const EpfFiling = require('../models/EpfFiling');
const EsicFiling = require('../models/EsicFiling');
const ComplianceLicense = require('../models/ComplianceLicense');
const ComplianceAudit = require('../models/ComplianceAudit');
const ComplianceTask = require('../models/ComplianceTask');
const { requireCompliance } = require('../utils/auth');
const { computeLicenseStatus } = require('../utils/licenseStatus');

const router = express.Router();

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function collectDueItems() {
  const [filings, gst, tds, epf, esic, payroll, audits, tasks, licenses] = await Promise.all([
    ComplianceFiling.find().lean(),
    GstFiling.find().lean(),
    TdsFiling.find().lean(),
    EpfFiling.find().lean(),
    EsicFiling.find().lean(),
    PayrollRegister.find().lean(),
    ComplianceAudit.find().lean(),
    ComplianceTask.find().lean(),
    ComplianceLicense.find().lean(),
  ]);

  const items = [];

  const push = (list, mapFn) => {
    list.forEach((row) => {
      const mapped = mapFn(row);
      if (mapped) items.push(mapped);
    });
  };

  push(filings, (r) => ({
    id: String(r._id),
    source: r.category || 'Filing',
    title: `${r.formCode} — ${r.period}`,
    formCode: r.formCode,
    formName: r.formName,
    period: r.period,
    dueDate: r.dueDate,
    status: r.status,
    department: r.department || 'Accounts',
    updatedAt: r.updatedAt,
    important: true,
    isFiling: true,
    fromMaster: false,
  }));
  push(gst, (r) => ({
    id: String(r._id),
    source: 'GST',
    title: `${r.filingType} — ${r.returnPeriod}`,
    dueDate: r.dueDate,
    status: r.status,
    department: r.department || 'Accounts',
    updatedAt: r.updatedAt,
    important: true,
    isFiling: true,
  }));
  push(tds, (r) => ({
    id: String(r._id),
    source: 'TDS',
    title: `${r.tdsType} — ${r.quarter}`,
    dueDate: r.dueDate,
    status: r.status,
    department: r.department || 'Accounts',
    updatedAt: r.updatedAt,
    important: true,
    isFiling: true,
  }));
  push(epf, (r) => ({
    id: String(r._id),
    source: 'EPF',
    title: `EPF — ${r.month}`,
    dueDate: r.dueDate,
    status: r.status === 'Paid' ? 'Completed' : r.status,
    department: r.department || 'HR',
    updatedAt: r.updatedAt,
  }));
  push(esic, (r) => ({
    id: String(r._id),
    source: 'ESIC',
    title: `ESIC — ${r.month}`,
    dueDate: r.dueDate,
    status: r.status === 'Paid' ? 'Completed' : r.status,
    department: r.department || 'HR',
    updatedAt: r.updatedAt,
  }));
  push(payroll, (r) => ({
    id: String(r._id),
    source: 'Payroll',
    title: `${r.registerType} — ${r.month}`,
    dueDate: r.dueDate,
    status: r.status,
    department: r.department || 'HR',
    updatedAt: r.updatedAt,
  }));
  push(audits, (r) => ({
    id: String(r._id),
    source: 'Audit',
    title: `${r.auditType} — ${r.auditor || 'Auditor'}`,
    dueDate: r.dueDate || r.auditDate,
    status: r.status === 'Completed' ? 'Completed' : r.status === 'Scheduled' ? 'Pending' : 'In Progress',
    department: r.department || '',
    updatedAt: r.updatedAt,
  }));
  push(tasks, (r) => ({
    id: String(r._id),
    source: r.category || 'Other',
    title: r.title,
    dueDate: r.dueDate,
    status: r.status,
    department: r.department || '',
    updatedAt: r.updatedAt,
  }));
  push(licenses, (r) => {
    const status = computeLicenseStatus(r.expiryDate);
    return {
      id: String(r._id),
      source: 'License',
      title: `${r.licenseName}${r.licenseNumber ? ` (${r.licenseNumber})` : ''}`,
      dueDate: r.expiryDate,
      status: status === 'Valid' ? 'Completed' : status === 'Expired' ? 'Overdue' : 'Pending',
      licenseStatus: status,
      department: r.department || '',
      updatedAt: r.updatedAt,
    };
  });

  return items;
}

router.get('/', requireCompliance('compliance.dashboard.view'), async (req, res) => {
  try {
    const today = startOfDay(new Date());
    const weekEnd = endOfDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));
    const monthEnd = endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0));

    const items = await collectDueItems();
    const actionable = items.filter((i) => i.dueDate || i.status);

    let completed = 0;
    let pending = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let dueThisMonth = 0;
    let licensesExpiringSoon = 0;

    actionable.forEach((item) => {
      const due = item.dueDate ? startOfDay(item.dueDate) : null;
      const isDone = item.status === 'Completed' || item.status === 'Filed' || item.status === 'Paid';
      if (isDone) completed += 1;
      else if (item.status === 'Overdue' || (due && due < today && !isDone)) overdue += 1;
      else pending += 1;

      if (due && !isDone && due >= today && due <= weekEnd) dueThisWeek += 1;
      if (due && !isDone && due >= today && due <= monthEnd) dueThisMonth += 1;
      if (item.source === 'License' && item.licenseStatus === 'Expiring Soon') licensesExpiringSoon += 1;
    });

    const monthlyMap = {};
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = monthKey(d);
      monthlyMap[key] = { month: key, completed: 0, pending: 0, overdue: 0 };
    }
    actionable.forEach((item) => {
      if (!item.dueDate) return;
      const key = monthKey(item.dueDate);
      if (!monthlyMap[key]) return;
      const isDone = item.status === 'Completed' || item.status === 'Filed' || item.status === 'Paid';
      if (isDone) monthlyMap[key].completed += 1;
      else if (item.status === 'Overdue' || startOfDay(item.dueDate) < today) monthlyMap[key].overdue += 1;
      else monthlyMap[key].pending += 1;
    });

    const upcoming = actionable
      .filter((i) => i.dueDate && !(i.status === 'Completed' || i.status === 'Filed' || i.status === 'Paid'))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 10);

    const recent = [...actionable]
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 10);

    res.json({
      kpis: {
        totalTasks: actionable.length,
        completed,
        pending,
        overdue,
        dueThisWeek,
        dueThisMonth,
        licensesExpiringSoon,
      },
      monthlyStatus: Object.values(monthlyMap),
      pendingVsCompleted: [
        { name: 'Completed', value: completed },
        { name: 'Pending', value: pending },
        { name: 'Overdue', value: overdue },
      ],
      upcomingDueDates: upcoming,
      recentActivity: recent,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
module.exports.collectDueItems = collectDueItems;
