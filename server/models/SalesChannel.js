const mongoose = require('mongoose');

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
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  defaultCurrency: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 3
  }
}, {
  timestamps: true
});

salesChannelSchema.pre('validate', function(next) {
  if (this.type === 'marketplace') {
    if (!this.country || !this.country.trim()) {
      this.invalidate('country', 'Country is required for marketplace channels');
    }
    if (!this.defaultCurrency || !this.defaultCurrency.trim()) {
      this.invalidate('defaultCurrency', 'Default currency is required for marketplace channels');
    }
  }
  next();
});

// Indexes
salesChannelSchema.index({ code: 1 });
salesChannelSchema.index({ name: 1 });
salesChannelSchema.index({ type: 1 });
salesChannelSchema.index({ isActive: 1 });

module.exports = mongoose.model('SalesChannel', salesChannelSchema);

