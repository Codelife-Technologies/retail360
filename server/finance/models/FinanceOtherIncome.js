const mongoose = require('mongoose');

/** Manual / non-sales income entries (service, other income). */
const otherIncomeSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    voucherNo: { type: String, trim: true, default: '' },
    incomeType: {
      type: String,
      enum: ['Service Income', 'Other Income', 'Interest Income', 'Commission'],
      default: 'Other Income',
    },
    customer: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Received', 'Cancelled'],
      default: 'Received',
    },
    department: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FinanceOtherIncome', otherIncomeSchema);
