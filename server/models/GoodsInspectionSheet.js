const mongoose = require('mongoose');

const gisItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, trim: true },
    productName: { type: String, trim: true },
    orderedQty: { type: Number, default: 0, min: 0 },
    inspectedQty: { type: Number, default: 0, min: 0 },
    acceptedQty: { type: Number, default: 0, min: 0 },
    rejectedQty: { type: Number, default: 0, min: 0 },
    inspectionStatus: {
      type: String,
      enum: ['pending', 'pass', 'fail', 'partial'],
      default: 'pending',
    },
    defects: { type: String, trim: true },
    correctiveAction: { type: String, trim: true },
    replacementRequired: { type: Boolean, default: false },
    remarks: { type: String, trim: true },
  },
  { _id: true }
);

const goodsInspectionSheetSchema = new mongoose.Schema(
  {
    gisNumber: { type: String, unique: true, required: true, trim: true, uppercase: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    purchaseRequisitionNumber: { type: String, trim: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    inspectionDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['draft', 'pending', 'pass', 'fail', 'partial', 'closed', 'cancelled'],
      default: 'draft',
    },
    inspectedBy: { type: String, trim: true },
    qualityInspector: { type: String, trim: true },
    items: [gisItemSchema],
    overallResult: {
      type: String,
      enum: ['pending', 'pass', 'fail', 'partial'],
      default: 'pending',
    },
    notes: { type: String, trim: true },
    goodsReceiptNote: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsReceiptNote' },
  },
  { timestamps: true }
);

goodsInspectionSheetSchema.index({ gisNumber: 1 });
goodsInspectionSheetSchema.index({ purchaseOrder: 1 });
goodsInspectionSheetSchema.index({ status: 1 });

module.exports = mongoose.model('GoodsInspectionSheet', goodsInspectionSheetSchema);
