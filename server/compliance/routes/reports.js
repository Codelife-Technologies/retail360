const express = require('express');
const XLSX = require('xlsx');
const GstFiling = require('../models/GstFiling');
const TdsFiling = require('../models/TdsFiling');
const PayrollRegister = require('../models/PayrollRegister');
const EpfFiling = require('../models/EpfFiling');
const EsicFiling = require('../models/EsicFiling');
const EmployeeCompliance = require('../models/EmployeeCompliance');
const ComplianceLicense = require('../models/ComplianceLicense');
const ComplianceAudit = require('../models/ComplianceAudit');
const { requireCompliance } = require('../utils/auth');
const { collectDueItems } = require('./dashboard');
const { computeLicenseStatus } = require('../utils/licenseStatus');

const router = express.Router();

const REPORT_SOURCES = {
  gst: { model: GstFiling, label: 'GST' },
  tds: { model: TdsFiling, label: 'TDS' },
  payroll: { model: PayrollRegister, label: 'Payroll' },
  epf: { model: EpfFiling, label: 'EPF' },
  esic: { model: EsicFiling, label: 'ESIC' },
  employees: { model: EmployeeCompliance, label: 'Employee Compliance' },
  licenses: { model: ComplianceLicense, label: 'License Expiry' },
  audits: { model: ComplianceAudit, label: 'Audit Reports' },
};

function sendExport(res, rows, label, format) {
  const fmt = String(format || 'xlsx').toLowerCase();
  if (fmt === 'csv') {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${label}.csv"`);
    return res.send(csv);
  }
  if (fmt === 'pdf') {
    const text = `${label}\nGenerated: ${new Date().toISOString()}\nRecords: ${rows.length}\n\n${rows
      .map((r, i) => `${i + 1}. ${JSON.stringify(r)}`)
      .join('\n')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${label}.pdf"`);
    return res.send(Buffer.from(text));
  }
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, label.slice(0, 31));
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${label}.xlsx"`);
  return res.send(buffer);
}

router.get('/summary', requireCompliance('compliance.reports.view'), async (req, res) => {
  try {
    const [
      gst,
      tds,
      payroll,
      epf,
      esic,
      employees,
      licenses,
      audits,
      dueItems,
    ] = await Promise.all([
      GstFiling.countDocuments(),
      TdsFiling.countDocuments(),
      PayrollRegister.countDocuments(),
      EpfFiling.countDocuments(),
      EsicFiling.countDocuments(),
      EmployeeCompliance.countDocuments(),
      ComplianceLicense.find().lean(),
      ComplianceAudit.countDocuments(),
      collectDueItems(),
    ]);

    const licenseStats = { valid: 0, expiring: 0, expired: 0 };
    licenses.forEach((lic) => {
      const status = computeLicenseStatus(lic.expiryDate);
      if (status === 'Valid') licenseStats.valid += 1;
      else if (status === 'Expiring Soon') licenseStats.expiring += 1;
      else licenseStats.expired += 1;
    });

    const completed = dueItems.filter((i) => ['Completed', 'Filed', 'Paid'].includes(i.status)).length;
    const pending = dueItems.filter((i) => !['Completed', 'Filed', 'Paid'].includes(i.status)).length;

    res.json({
      counts: {
        gst,
        tds,
        payroll,
        epf,
        esic,
        employees,
        licenses: licenses.length,
        audits,
      },
      licenseStats,
      overall: {
        total: dueItems.length,
        completed,
        pending,
        complianceRate: dueItems.length ? Math.round((completed / dueItems.length) * 100) : 100,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:type/export', requireCompliance('compliance.reports.view'), async (req, res) => {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const format = req.query.format || 'xlsx';

    if (type === 'summary' || type === 'overall') {
      const items = await collectDueItems();
      const rows = items.map((i) => ({
        Source: i.source,
        Title: i.title,
        DueDate: i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : '',
        Status: i.status,
        Department: i.department || '',
      }));
      return sendExport(res, rows, 'Overall_Compliance_Summary', format);
    }

    const source = REPORT_SOURCES[type];
    if (!source) return res.status(400).json({ error: 'Unknown report type' });

    let rows = await source.model.find().lean();
    if (type === 'licenses') {
      rows = rows.map((r) => ({
        ...r,
        status: computeLicenseStatus(r.expiryDate),
        _id: String(r._id),
      }));
    } else {
      rows = rows.map((r) => {
        const plain = { ...r, _id: String(r._id) };
        delete plain.__v;
        return plain;
      });
    }
    return sendExport(res, rows, source.label.replace(/\s+/g, '_'), format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
