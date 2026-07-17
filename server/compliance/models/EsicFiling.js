const mongoose = require('mongoose');

const esicFilingSchema = new mongoose.Schema(
  {
    month: { type: String, trim: true, required: true },
    employeesCovered: { type: Number, default: 0 },
    employerContribution: { type: Number, default: 0 },
    employeeContribution: { type: Number, default: 0 },
    challanNumber: { type: String, trim: true, default: '' },
    dueDate: { type: Date },
    paymentDate: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Overdue', 'In Progress'],
      default: 'Pending',
    },
    department: { type: String, trim: true, default: 'HR' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceEsicFiling', esicFilingSchema);
