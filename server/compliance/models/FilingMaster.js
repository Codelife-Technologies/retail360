const mongoose = require('mongoose');

const filingMasterSchema = new mongoose.Schema(
  {
    code: { type: String, trim: true, required: true, unique: true },
    name: { type: String, trim: true, required: true },
    category: {
      type: String,
      enum: ['GST', 'TDS', 'ITR', 'EPF', 'ESIC', 'Labour', 'Other'],
      required: true,
    },
    frequency: {
      type: String,
      enum: ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'As Required'],
      default: 'Monthly',
    },
    dueDay: { type: Number, min: 1, max: 31, default: 15 },
    dueOffsetMonths: { type: Number, default: 1, min: 0, max: 12 },
    dueMonth: { type: Number, min: 1, max: 12 },
    department: { type: String, trim: true, default: 'Accounts' },
    governmentPortal: { type: String, trim: true, default: '' },
    governmentFormCode: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    description: { type: String, trim: true, default: '' },
    companyDueDateNote: { type: String, trim: true, default: '' },
    reminderDaysBefore: { type: Number, default: 7, min: 0 },
  },
  { timestamps: true }
);

filingMasterSchema.index({ category: 1, isActive: 1 });
filingMasterSchema.index({ name: 'text', code: 'text', description: 'text' });

module.exports = mongoose.model('ComplianceFilingMaster', filingMasterSchema);
