const mongoose = require('mongoose');

const priceMasterSchema = new mongoose.Schema({
  minPrice: {
    type: Number,
    required: true,
    min: 0
  },
  maxPrice: {
    type: Number,
    min: 0,
    default: null // null means no upper limit
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null // null = default/fallback for all locations
  },
  inwardShippingCostPerKg: {
    type: Number,
    required: true,
    min: 0
  },
  outwardShippingCostPerKg: {
    type: Number,
    required: true,
    min: 0
  },
  operationCostPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  packagingCost: {
    type: Number,
    required: true,
    min: 0
  },
  operatingProfitType: {
    type: String,
    enum: ['percent', 'amount'],
    default: 'percent'
  },
  operatingProfit: {
    type: Number,
    required: true,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for lookup performance
priceMasterSchema.index({ minPrice: 1, maxPrice: 1 });
priceMasterSchema.index({ location: 1 });
priceMasterSchema.index({ location: 1, minPrice: 1, maxPrice: 1 });
priceMasterSchema.index({ isActive: 1 });
priceMasterSchema.index({ effectiveDate: -1 });

module.exports = mongoose.model('PriceMaster', priceMasterSchema);
