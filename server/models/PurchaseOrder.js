const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  companyName: { type: String, trim: true },
  registeredAddress: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  state: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  contactNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  companyName: { type: String, trim: true },
  warehouseName: { type: String, trim: true },
  address: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  contactPerson: { type: String, trim: true },
  contactNumber: { type: String, trim: true }
}, { _id: false });

const signatorySchema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
  approvalDate: { type: Date }
}, { _id: false });

const purchaseOrderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
  },
  /** Free-text name when purchasing a new item not yet in Product Master */
  itemName: { type: String, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  taxRate: { type: Number, min: 0, max: 100 },
  taxAmount: { type: Number, default: 0, min: 0 },
  lineTotal: { type: Number, min: 0 },
  unitOfMeasure: { type: String, trim: true, default: 'PCS' },
  hsnCode: { type: String, trim: true },
  hsnDescription: { type: String, trim: true },
  cgstRate: { type: Number, min: 0, max: 100 },
  sgstRate: { type: Number, min: 0, max: 100 },
  igstRate: { type: Number, min: 0, max: 100 },
  cessRate: { type: Number, min: 0, max: 100, default: 0 },
  sku: { type: String, trim: true },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  pendingQuantity: { type: Number, min: 0 }
}, { _id: false });

purchaseOrderItemSchema.pre('validate', function validatePoItem(next) {
  if (!String(this.itemName || '').trim()) {
    const product = this.product && typeof this.product === 'object' ? this.product : null;
    const fallback = String(
      product?.title || product?.name || this.sku || ''
    ).trim();
    if (fallback) {
      this.itemName = fallback;
    } else {
      return next(new Error('Each PO line needs a title (SKU is optional)'));
    }
  }
  next();
});

const purchaseOrderSchema = new mongoose.Schema({
  poNumber: { type: String, unique: true, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  needsVendorAssignment: { type: Boolean, default: false },
  purchaseRequisite: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PurchaseRequisite',
  },
  orderDate: { type: Date, default: Date.now },
  expectedDeliveryDate: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'approved'],
    default: 'pending',
    set: function normalizePurchaseOrderStatus(value) {
      const raw = String(value || 'pending').trim().toLowerCase();
      const approved = new Set([
        'approved',
        'partially_received',
        'fully_received',
        'received',
        'completed',
        'closed',
        'done',
        'complete',
        'finished',
      ]);
      if (approved.has(raw)) return 'approved';
      return 'pending';
    },
  },
  revisionNumber: { type: String, trim: true, default: '0' },
  currency: { type: String, trim: true, default: 'INR' },
  purchaseRequisitionNumber: { type: String, trim: true },
  department: { type: String, trim: true },
  costCenter: { type: String, trim: true },
  createdBy: { type: String, trim: true },
  approvedByName: { type: String, trim: true },
  buyer: partySchema,
  supplierDetails: partySchema,
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  items: [purchaseOrderItemSchema],
  subtotal: { type: Number, default: 0, min: 0 },
  discountTotal: { type: Number, default: 0, min: 0 },
  taxableValue: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  defaultTaxRate: { type: Number, default: 0, min: 0 },
  freightCharges: { type: Number, default: 0, min: 0 },
  packingCharges: { type: Number, default: 0, min: 0 },
  roundOff: { type: Number, default: 0 },
  total: { type: Number, default: 0, min: 0 },
  advancePercent: { type: Number, default: 0, min: 0, max: 100 },
  creditDays: { type: Number, default: 0, min: 0 },
  paymentDueDate: { type: Date },
  deliveryMode: { type: String, trim: true },
  incoterms: { type: String, trim: true },
  deliveryLocation: { type: String, trim: true },
  jurisdiction: { type: String, trim: true },
  termsAndConditions: [{ type: String, trim: true }],
  preparedBy: signatorySchema,
  checkedBy: signatorySchema,
  approvedBy: signatorySchema,
  notes: { type: String, trim: true }
}, { timestamps: true });

purchaseOrderSchema.pre('validate', function validateSupplier(next) {
  // Coerce legacy statuses (completed, received, etc.) before enum validation
  this.set('status', this.get('status') || 'pending');
  if (!this.supplier && !this.needsVendorAssignment) {
    this.invalidate('supplier', 'Supplier is required unless vendor assignment is pending');
  }
  if (this.supplier && this.needsVendorAssignment) {
    this.needsVendorAssignment = false;
  }
  next();
});

// Pre-save: recompute line pending qty and order totals from persisted fields
purchaseOrderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      const gross = item.quantity * item.unitPrice;
      const discPct = item.discountPercent || 0;
      const discAmt = (gross * discPct) / 100;
      const taxable = gross - discAmt;
      const rate = item.taxRate || 0;
      const taxAmt = item.taxAmount != null ? item.taxAmount : (taxable * rate) / 100;
      item.total = gross;
      item.taxAmount = taxAmt;
      item.lineTotal = item.lineTotal != null ? item.lineTotal : taxable + taxAmt;
      if (item.pendingQuantity == null) {
        item.pendingQuantity = Math.max(0, item.quantity - (item.receivedQuantity || 0));
      }
    });
    this.subtotal = this.items.reduce((s, i) => s + i.total, 0);
    this.discountTotal = this.items.reduce((s, i) => s + (i.total * (i.discountPercent || 0)) / 100, 0);
    this.taxableValue = this.subtotal - this.discountTotal;
    const lineTax = this.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
    this.tax = this.tax || lineTax;
    this.cgst = this.cgst || 0;
    this.sgst = this.sgst || 0;
    this.igst = this.igst || 0;
    const extras = (this.freightCharges || 0) + (this.packingCharges || 0);
    const beforeRound = this.taxableValue + this.tax + extras;
    if (!this.total || this.isModified('items') || this.isModified('freightCharges')) {
      const rounded = Math.round(beforeRound * 100) / 100;
      this.roundOff = Math.round((rounded - beforeRound) * 100) / 100;
      this.total = rounded + (this.roundOff || 0);
    }
  }
  next();
});

purchaseOrderSchema.index({ poNumber: 1 });
purchaseOrderSchema.index({ supplier: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ orderDate: -1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
