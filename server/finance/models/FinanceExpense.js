const mongoose = require('mongoose');
const {
  PAYMENT_MODES,
  EXPENSE_STATUSES,
  EXPENSE_CATEGORIES,
} = require('../utils/constants');

const expenseSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    voucherNo: { type: String, trim: true, required: true },
    category: { type: String, trim: true, required: true },
    subcategory: { type: String, trim: true, default: '' },
    vendor: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    amount: { type: Number, required: true, min: 0 },
    gst: { type: Number, default: 0, min: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODES, default: 'Bank Transfer' },
    status: { type: String, enum: EXPENSE_STATUSES, default: 'Paid' },
    department: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
    currency: { type: String, trim: true, uppercase: true, default: 'INR' },
    originalAmount: { type: Number, min: 0 },
    exchangeRateToInr: { type: Number, min: 0 },
    exchangeRateSource: { type: String, trim: true, default: '' },
    exchangeRateAt: { type: Date },
    bill: {
      fileName: { type: String, default: '' },
      originalName: { type: String, default: '' },
      filePath: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      fileSize: { type: Number, default: 0 },
      uploadedAt: { type: Date },
    },
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
