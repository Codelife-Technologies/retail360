const mongoose = require('mongoose');
const { deductSaleStockItems, restoreSaleStockItems } = require('../utils/saleStockUtils');

const saleItemSchema = new mongoose.Schema({
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
  },
  /** Amazon / marketplace line id (e.g. shipment-item-id). */
  shipmentItemId: {
    type: String,
    trim: true,
    default: '',
  },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  salesNumber: {
    type: String,
    unique: true,
    required: true
  },
  salesChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesChannel',
    required: true
  },
  salesLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesLocation',
    required: true
  },
  customer: {
    type: customerSchema,
    default: {}
  },
  salesDate: {
    type: Date,
    default: Date.now
  },
  items: [saleItemSchema],
  subtotal: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
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
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  notes: {
    type: String,
    trim: true
  },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: 'INR',
    },
    /** Snapshot of total in the order currency (same as total; preserved for FX reporting). */
    originalAmount: {
      type: Number,
      min: 0,
    },
    /** INR per 1 unit of currency at posting / last FX stamp. */
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
    amazonOrderId: {
      type: String,
      trim: true,
    },
}, {
  timestamps: true
});

// Pre-save hook to calculate totals
saleSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.total = this.subtotal - (this.discount || 0) + (this.tax || 0);
  }
  // Preserve original currency amount without altering calculated totals.
  if (this.originalAmount == null && this.total != null) {
    this.originalAmount = this.total;
  }
  next();
});

// Post-save hook to deduct stock from warehouse location (never below zero)
saleSchema.post('save', async function() {
  try {
    const SalesLocation = mongoose.model('SalesLocation');

    const salesLocation = await SalesLocation.findById(this.salesLocation).populate('location');
    if (!salesLocation || !salesLocation.location) {
      console.error('Sales location or warehouse location not found');
      return;
    }

    const warehouseLocation = salesLocation.location._id || salesLocation.location;
    await deductSaleStockItems(this.items, warehouseLocation);
  } catch (error) {
    console.error('Error deducting stock quantities:', error);
  }
});

// Post-remove hook to reverse stock deduction
saleSchema.post(['findOneAndDelete', 'findOneAndRemove'], async function(doc) {
  if (!doc) return;
  
  try {
    const SalesLocation = mongoose.model('SalesLocation');
    
    // Get the warehouse location from sales location
    const salesLocation = await SalesLocation.findById(doc.salesLocation).populate('location');
    if (!salesLocation || !salesLocation.location) {
      console.error('Sales location or warehouse location not found');
      return;
    }
    
    const warehouseLocation = salesLocation.location._id || salesLocation.location;
    await restoreSaleStockItems(doc.items, warehouseLocation);
  } catch (error) {
    console.error('Error reversing stock quantities:', error);
  }
});

// Indexes
saleSchema.index({ salesNumber: 1 });
saleSchema.index({ salesChannel: 1 });
saleSchema.index({ salesLocation: 1 });
saleSchema.index({ salesDate: -1 });
saleSchema.index({ paymentStatus: 1 });
saleSchema.index({ orderStatus: 1 });
saleSchema.index({ amazonOrderId: 1 });

module.exports = mongoose.model('Sale', saleSchema);

