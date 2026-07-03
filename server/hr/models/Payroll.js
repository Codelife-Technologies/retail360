const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    basicSalary: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    netSalary: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Processed', 'Paid'],
      default: 'Pending',
    },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });
payrollSchema.index({ year: 1, month: 1, paymentStatus: 1 });

module.exports = mongoose.model('HrPayroll', payrollSchema);
