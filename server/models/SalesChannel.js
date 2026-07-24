const mongoose = require('mongoose');
const { currencyForCountry } = require('../currency/constants');

const salesChannelSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    uppercase: true
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
    enum: ['online', 'retail', 'wholesale', 'marketplace', 'other'],
    default: 'other'
  },
  commissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  paymentTerms: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  country: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  defaultCurrency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 3
  },
  /** Warehouses (stock locations) linked to this sales channel */
  warehouses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
  }],
}, {
  timestamps: true
});

salesChannelSchema.pre('validate', function(next) {
  if (Array.isArray(this.warehouses)) {
    const seen = new Set();
    this.warehouses = this.warehouses
      .filter(Boolean)
      .filter((id) => {
        const key = String(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  if (this.country) {
    this.country = String(this.country).trim().toUpperCase().slice(0, 2);
    if (!this.defaultCurrency) {
      this.defaultCurrency = currencyForCountry(this.country);
    } else {
      this.defaultCurrency = String(this.defaultCurrency).trim().toUpperCase().slice(0, 3);
    }
  }
  next();
});

salesChannelSchema.index({ code: 1 });
salesChannelSchema.index({ name: 1 });
salesChannelSchema.index({ type: 1 });
salesChannelSchema.index({ isActive: 1 });
salesChannelSchema.index({ country: 1 });

module.exports = mongoose.model('SalesChannel', salesChannelSchema);
