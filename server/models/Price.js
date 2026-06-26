const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
  },
  purchasePrice: {
    type: Number,
    required: true,
    min: 0
  },
  salesPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true,
    uppercase: true
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes
priceSchema.index({ product: 1, isActive: 1 });
priceSchema.index({ product: 1, supplier: 1, isActive: 1 });
priceSchema.index({ supplier: 1 });
priceSchema.index({ product: 1 });
priceSchema.index({ effectiveDate: -1 });

// Pre-save hook to deactivate old active prices when new active price is set
priceSchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    await mongoose.model('Price').updateMany(
      { product: this.product, isActive: true, currency: this.currency, _id: { $ne: this._id } },
      { isActive: false }
    );
  }
  next();
});

module.exports = mongoose.model('Price', priceSchema);

