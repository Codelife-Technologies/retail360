const mongoose = require('mongoose');

const purchaseRequisiteItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: true,
    },
    sku: { type: String, trim: true },
    productTitle: { type: String, trim: true },
    locationName: { type: String, trim: true },
    currentStock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    suggestedQty: { type: Number, default: 0, min: 0 },
    requestedQty: { type: Number, required: true, min: 1 },
    replenishStatus: {
      type: String,
      enum: ['REORDER', 'LOW', 'OK'],
      default: 'REORDER',
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    supplierName: { type: String, trim: true },
    unitPrice: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: true }
);

const purchaseRequisiteSchema = new mongoose.Schema(
  {
    prNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'po_created', 'closed', 'cancelled'],
      default: 'draft',
    },
    source: {
      type: String,
      enum: ['replenish_report', 'manual'],
      default: 'manual',
    },
    requestedBy: { type: String, trim: true },
    name: { type: String, trim: true },
    department: { type: String, trim: true },
    notes: { type: String, trim: true },
    items: {
      type: [purchaseRequisiteItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'At least one line item is required',
      },
    },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
    },
    purchaseOrders: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
    }],
    purchaseOrderNumber: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

purchaseRequisiteSchema.index({ prNumber: 1 });
purchaseRequisiteSchema.index({ status: 1 });
purchaseRequisiteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PurchaseRequisite', purchaseRequisiteSchema);
