const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    auditType: {
      type: String,
      enum: ['Internal Audit', 'External Audit', 'Tax Audit', 'Stock Audit'],
      required: true,
    },
    auditor: { type: String, trim: true, default: '' },
    auditDate: { type: Date },
    findings: { type: String, trim: true, default: '' },
    actionTaken: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed', 'Open Findings'],
      default: 'Scheduled',
    },
    attachment: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    dueDate: { type: Date },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceAudit', auditSchema);
