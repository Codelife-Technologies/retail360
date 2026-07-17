const mongoose = require('mongoose');

const epfFilingSchema = new mongoose.Schema(
  {
    month: { type: String, trim: true, required: true },
    uanCount: { type: Number, default: 0 },
    employerContribution: { type: Number, default: 0 },
    employeeContribution: { type: Number, default: 0 },
    challanNumber: { type: String, trim: true, default: '' },
    paymentDate: { type: Date },
    dueDate: { type: Date },
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

module.exports = mongoose.model('ComplianceEpfFiling', epfFilingSchema);
