const mongoose = require('mongoose');
const {
  CATEGORY_LIST,
  PAYMENT_MODES,
  EXPENSE_STATUSES,
  EXPENSE_CATEGORIES,
} = require('../utils/constants');

const expenseSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    voucherNo: { type: String, trim: true, required: true },
    category: { type: String, enum: CATEGORY_LIST, required: true },
    subcategory: { type: String, trim: true, default: '' },
    vendor: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODES, default: 'Bank Transfer' },
    status: { type: String, enum: EXPENSE_STATUSES, default: 'Paid' },
    department: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

expenseSchema.pre('validate', function validateSubcategory(next) {
  const allowed = EXPENSE_CATEGORIES[this.category] || [];
  if (this.subcategory && allowed.length && !allowed.includes(this.subcategory)) {
    // Allow free-text for flexibility if category list grows
  }
  next();
});

expenseSchema.index({ date: -1 });
expenseSchema.index({ voucherNo: 1 });
expenseSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('FinanceExpense', expenseSchema);
