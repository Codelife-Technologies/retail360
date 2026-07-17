const mongoose = require('mongoose');

/** Manual / non-sales income entries (service, other income). */
const otherIncomeSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    voucherNo: { type: String, trim: true, default: '' },
    incomeType: {
      type: String,
      trim: true,
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

module.exports = mongoose.model('FinanceOtherIncome', otherIncomeSchema);
