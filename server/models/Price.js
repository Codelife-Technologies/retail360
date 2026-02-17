const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  salesChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesChannel',
    default: null
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
  mrp: {
    type: Number,
    min: 0,
    default: null
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
priceSchema.index({ product: 1 });
priceSchema.index({ product: 1, salesChannel: 1, isActive: 1 });
priceSchema.index({ effectiveDate: -1 });

// Pre-save hook to deactivate old active prices for same (product, salesChannel) when new active price is set
priceSchema.pre('save', async function(next) {
  if (this.isActive && this.isNew) {
    const filter = {
      product: this.product,
      isActive: true,
      _id: { $ne: this._id }
    };
    if (this.salesChannel) {
      filter.salesChannel = this.salesChannel;
    } else {
      filter.salesChannel = null;
    }
    await mongoose.model('Price').updateMany(filter, { isActive: false });
  }
  next();
});

module.exports = mongoose.model('Price', priceSchema);

