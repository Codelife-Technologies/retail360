const mongoose = require('mongoose');
const { currencyForCountry } = require('../currency/constants');

const salesLocationSchema = new mongoose.Schema({
  salesChannels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesChannel'
  }],
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
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
  address: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  /** ISO country code (e.g. IN, AE) — drives reporting currency */
  country: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  /** Currency derived from country (e.g. INR, AED) */
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 3
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

salesLocationSchema.pre('validate', function(next) {
  if (Array.isArray(this.salesChannels)) {
    const seen = new Set();
    this.salesChannels = this.salesChannels
      .filter(Boolean)
      .filter((id) => {
        const key = String(id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  if (!this.salesChannels || this.salesChannels.length === 0) {
    this.invalidate('salesChannels', 'At least one sales channel is required');
  }

  if (this.country) {
    this.country = String(this.country).trim().toUpperCase().slice(0, 2);
    if (!this.currency) {
      this.currency = currencyForCountry(this.country);
    } else {
      this.currency = String(this.currency).trim().toUpperCase().slice(0, 3);
    }
  }
  next();
});

salesLocationSchema.index({ code: 1 });
salesLocationSchema.index({ name: 1 });
salesLocationSchema.index({ salesChannels: 1 });
salesLocationSchema.index({ location: 1 });
salesLocationSchema.index({ isActive: 1 });
salesLocationSchema.index({ country: 1 });

module.exports = mongoose.model('SalesLocation', salesLocationSchema);
