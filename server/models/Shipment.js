const mongoose = require('mongoose');

const shipmentItemSchema = new mongoose.Schema({
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
  weight: {
    type: Number,
    min: 0 // Weight per unit in kg (from product.weight or manual)
  }
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  shipmentNumber: {
    type: String,
    unique: true,
    required: true
  },
  shipmentVendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShipmentVendor',
    required: true
  },
  shippingCharge: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShippingCharge',
    required: true
  },
  fromLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  toLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  },
  shipmentDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date
  },
  actualDeliveryDate: {
    type: Date
  },
  items: [shipmentItemSchema],
  totalWeight: {
    type: Number,
    min: 0,
    default: 0
  },
  shippingCharges: {
    type: Number,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'shipped', 'in-transit', 'delivered', 'cancelled'],
    default: 'pending'
  },
  trackingNumber: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Pre-save hook to calculate total weight and shipping charges
shipmentSchema.pre('save', async function(next) {
  try {
    // Calculate total weight from items
    if (this.items && this.items.length > 0) {
      this.totalWeight = this.items.reduce((sum, item) => {
        const itemWeight = item.weight || 0;
        return sum + (itemWeight * item.quantity);
      }, 0);
    }

    // Calculate shipping charges if shippingCharge is populated or set
    if (this.shippingCharge && this.totalWeight > 0) {
      const ShippingCharge = mongoose.model('ShippingCharge');
      const charge = await ShippingCharge.findById(this.shippingCharge);
      
      if (charge) {
        let calculatedCharge = 0;
        if (charge.chargeType === 'perKg') {
          calculatedCharge = this.totalWeight * (charge.perKgRate || 0);
        } else if (charge.chargeType === 'weightRange') {
          const matchingRange = charge.weightRanges.find(range => {
            const maxWeight = range.maxWeight !== null ? range.maxWeight : Infinity;
            return this.totalWeight >= range.minWeight && this.totalWeight <= maxWeight;
          });
          if (matchingRange) calculatedCharge = matchingRange.rate;
        } else if (charge.chargeType === 'flat') {
          calculatedCharge = charge.flatRate || 0;
        }
        this.shippingCharges = Math.max(calculatedCharge, charge.minCharge || 0);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Note: Stock updates are handled in routes for better control and error handling

// Indexes for faster searches
shipmentSchema.index({ shipmentNumber: 1 });
shipmentSchema.index({ fromLocation: 1 });
shipmentSchema.index({ toLocation: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ shipmentDate: -1 });
shipmentSchema.index({ shipmentVendor: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);

