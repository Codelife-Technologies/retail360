const mongoose = require('mongoose');

const weightRangeSchema = new mongoose.Schema({
  minWeight: {
    type: Number,
    required: true,
    min: 0
  },
  maxWeight: {
    type: Number,
    min: 0,
    default: null // null means unlimited
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const shippingChargeSchema = new mongoose.Schema({
  shipmentVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShipmentVendor',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['inward', 'outward'],
    default: 'outward'
  },
  chargeType: {
    type: String,
    enum: ['perKg', 'weightRange', 'flat'],
    default: 'perKg'
  },
  // For perKg: charge per kilogram
  perKgRate: {
    type: Number,
    min: 0
  },
  // For weightRange: different rates for weight ranges
  weightRanges: [weightRangeSchema],
  // For flat: fixed charge
  flatRate: {
    type: Number,
    min: 0
  },
  minCharge: {
    type: Number,
    min: 0,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster searches
shippingChargeSchema.index({ shipmentVendor: 1 });
shippingChargeSchema.index({ type: 1 });
shippingChargeSchema.index({ isActive: 1 });
shippingChargeSchema.index({ effectiveDate: -1 });

module.exports = mongoose.model('ShippingCharge', shippingChargeSchema);

