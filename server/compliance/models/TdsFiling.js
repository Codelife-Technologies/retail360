const mongoose = require('mongoose');

const tdsFilingSchema = new mongoose.Schema(
  {
    tdsType: { type: String, trim: true, required: true },
    quarter: { type: String, trim: true, required: true },
    dueDate: { type: Date },
    filingDate: { type: Date },
    challanNumber: { type: String, trim: true, default: '' },
    amount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Filed', 'Overdue', 'In Progress'],
      default: 'Pending',
    },
    attachment: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: 'Accounts' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceTdsFiling', tdsFilingSchema);
