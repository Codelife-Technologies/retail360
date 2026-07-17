const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: {
    type: String,
    unique: true,
    required: true
  },
  purchaseOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseOrder'
  },
  goodsReceiptNote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GoodsReceiptNote'
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
  },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  items: [purchaseItemSchema],
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  defaultTaxRate: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    trim: true,
    uppercase: true,
    default: 'INR',
  },
  originalAmount: {
    type: Number,
    min: 0,
  },
  exchangeRateToInr: {
    type: Number,
    min: 0,
  },
  exchangeRateSource: {
    type: String,
    trim: true,
    default: '',
  },
  exchangeRateAt: {
    type: Date,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Pre-save hook to calculate totals
purchaseSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.total = this.subtotal + (this.tax || 0);
  }
  if (this.originalAmount == null && this.total != null) {
    this.originalAmount = this.total;
  }
  next();
});

// Post-save hook to update stock quantities in Stock collection
purchaseSchema.post('save', async function() {
  if (this.goodsReceiptNote) {
    return;
  }

  try {
    const Stock = mongoose.model('Stock');
    
    for (const item of this.items) {
      await Stock.findOneAndUpdate(
        { product: item.product, location: this.location },
        { 
          $inc: { quantity: item.quantity },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, new: true }
      );
    }
  } catch (error) {
    console.error('Error updating stock quantities:', error);
  }
});

// Index for faster searches
purchaseSchema.index({ purchaseNumber: 1 });
purchaseSchema.index({ supplier: 1 });
purchaseSchema.index({ purchaseOrder: 1 });
purchaseSchema.index({ goodsReceiptNote: 1 }, { unique: true, sparse: true });
purchaseSchema.index({ purchaseDate: -1 });

module.exports = mongoose.model('Purchase', purchaseSchema);

