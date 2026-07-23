const mongoose = require('mongoose');

const payrollComponentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      enum: ['earning', 'deduction', 'employer'],
      required: true,
    },
    calculationType: {
      type: String,
      enum: ['fixed', 'percent_of_basic', 'percent_of_gross', 'weight'],
      default: 'fixed',
    },
    /** Percent (0–100), fixed amount, or relative weight depending on calculationType. */
    defaultValue: { type: Number, default: 0, min: 0 },
    isStatutory: { type: Boolean, default: false },
    isTaxable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

payrollComponentSchema.index({ code: 1 }, { unique: true });
payrollComponentSchema.index({ category: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('HrPayrollComponent', payrollComponentSchema);
