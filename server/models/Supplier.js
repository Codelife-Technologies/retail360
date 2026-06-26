const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    supplierId: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    supplierCode: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
    },
    bankDetails: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    bankPinCode: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
    },
    state: {
      type: String,
      trim: true,
    },
    advancePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    creditDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryMode: {
      type: String,
      trim: true,
    },
    incoterms: {
      type: String,
      trim: true,
    },
    paymentTermsNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

supplierSchema.index({ name: 1 });
supplierSchema.index({ supplierCode: 1 });
supplierSchema.index({ supplierId: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
