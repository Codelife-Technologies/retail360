const mongoose = require('mongoose');

const gstFilingSchema = new mongoose.Schema(
  {
    filingType: { type: String, trim: true, required: true },
    returnPeriod: { type: String, trim: true, required: true },
    dueDate: { type: Date },
    filedDate: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'Filed', 'Overdue', 'In Progress'],
      default: 'Pending',
    },
    taxAmount: { type: Number, default: 0 },
    interest: { type: Number, default: 0 },
    lateFee: { type: Number, default: 0 },
    remarks: { type: String, trim: true, default: '' },
    attachment: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: 'Accounts' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceGstFiling', gstFilingSchema);
