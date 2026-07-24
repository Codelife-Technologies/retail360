const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, trim: true },
    productName: { type: String, trim: true },
    category: { type: String, trim: true },
    hsnCode: { type: String, trim: true },
    unitOfMeasure: { type: String, trim: true, default: 'PCS' },
    orderedQty: { type: Number, default: 0, min: 0 },
    receivedQty: { type: Number, default: 0, min: 0 },
    acceptedQty: { type: Number, default: 0, min: 0 },
    rejectedQty: { type: Number, default: 0, min: 0 },
    pendingQty: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    lineAmount: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0 },
    inspectionStatus: {
      type: String,
      enum: ['pending', 'pass', 'fail', 'partial'],
      default: 'pending',
    },
    defects: { type: String, trim: true },
    correctiveAction: { type: String, trim: true },
    replacementRequired: { type: Boolean, default: false },
    remarks: { type: String, trim: true },
    varianceQty: { type: Number, default: 0 },
    variancePercent: { type: Number, default: 0 },
    stockBefore: { type: Number, default: 0 },
    stockAfter: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0 },
    availableStock: { type: Number, default: 0 },
    incomingStock: { type: Number, default: 0 },
  },
  { _id: true }
);

const approvalSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true, min: 1 },
    role: { type: String, trim: true, required: true },
    approverName: { type: String, trim: true },
    designation: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'returned_for_correction'],
      default: 'pending',
    },
    comments: { type: String, trim: true },
    approvalDate: { type: Date },
    digitalSignature: { type: String, trim: true },
  },
  { _id: true }
);

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, trim: true },
    fileSize: { type: Number, default: 0 },
    category: {
      type: String,
      enum: [
        'supplier_invoice',
        'delivery_challan',
        'eway_bill',
        'inspection_image',
        'damage_photo',
        'transport_document',
        'quality_report',
        'pdf',
        'excel',
        'other',
      ],
      default: 'other',
    },
    uploadedBy: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const threeWayMatchSchema = new mongoose.Schema(
  {
    poTotal: { type: Number, default: 0 },
    grnTotal: { type: Number, default: 0 },
    invoiceTotal: { type: Number, default: 0 },
    priceMismatch: { type: Boolean, default: false },
    quantityMismatch: { type: Boolean, default: false },
    taxMismatch: { type: Boolean, default: false },
    invoiceVariance: { type: Number, default: 0 },
    matchStatus: {
      type: String,
      enum: ['pending', 'matched', 'mismatch', 'partial'],
      default: 'pending',
    },
    alerts: [{ type: String, trim: true }],
    lastCheckedAt: { type: Date },
  },
  { _id: false }
);

const goodsReceiptNoteSchema = new mongoose.Schema(
  {
    grnNumber: { type: String, unique: true, required: true, trim: true, uppercase: true },
    grnDate: { type: Date, default: Date.now },
    deliveryDate: { type: Date },
    grnTime: { type: String, trim: true },
    receiptStatus: {
      type: String,
      enum: [
        'draft',
        'pending_inspection',
        'partially_received',
        'fully_received',
        'approved',
        'closed',
        'cancelled',
      ],
      default: 'draft',
    },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    locationCode: { type: String, trim: true },
    receivingOfficer: { type: String, trim: true },
    createdByName: { type: String, trim: true },

    purchaseRequisite: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseRequisite' },
    purchaseRequisitionNumber: { type: String, trim: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    purchaseOrderNumber: { type: String, trim: true },
    goodsInspectionSheet: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsInspectionSheet' },
    gisNumber: { type: String, trim: true },
    contractNumber: { type: String, trim: true },
    projectCode: { type: String, trim: true },
    costCenter: { type: String, trim: true },

    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierDetails: {
      name: { type: String, trim: true },
      supplierCode: { type: String, trim: true },
      gstin: { type: String, trim: true },
      pan: { type: String, trim: true },
      address: { type: String, trim: true },
      contactPerson: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
      vendorRating: { type: Number, min: 0, max: 5 },
    },

    deliveryInfo: {
      invoiceNumber: { type: String, trim: true },
      invoiceDate: { type: Date },
      deliveryChallanNumber: { type: String, trim: true },
      deliveryChallanDate: { type: Date },
      transporterName: { type: String, trim: true },
      vehicleNumber: { type: String, trim: true },
      lrNumber: { type: String, trim: true },
      ewayBillNumber: { type: String, trim: true },
      receivedBy: { type: String, trim: true },
      receivedDate: { type: Date },
    },

    items: {
      type: [grnItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one line item is required',
      },
    },

    allowExcessReceipt: { type: Boolean, default: false },

    subtotal: { type: Number, default: 0, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    taxableValue: { type: Number, default: 0, min: 0 },
    cgst: { type: Number, default: 0, min: 0 },
    sgst: { type: Number, default: 0, min: 0 },
    igst: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    freightCharges: { type: Number, default: 0, min: 0 },
    packingCharges: { type: Number, default: 0, min: 0 },
    otherCharges: { type: Number, default: 0, min: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    currency: { type: String, trim: true, default: 'INR' },

    followUp: {
      replacementRequired: { type: Boolean, default: false },
      returnToVendor: { type: Boolean, default: false },
      creditNoteRequired: { type: Boolean, default: false },
      reinspectionRequired: { type: Boolean, default: false },
      remarks: { type: String, trim: true },
    },

    approvals: [approvalSchema],
    attachments: [attachmentSchema],
    threeWayMatch: threeWayMatchSchema,

    inventoryUpdated: { type: Boolean, default: false },
    inventoryUpdatedAt: { type: Date },

    approvedByName: { type: String, trim: true },
    approvedAt: { type: Date },
    closedByName: { type: String, trim: true },
    closedAt: { type: Date },

    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

goodsReceiptNoteSchema.index({ grnNumber: 1 });
goodsReceiptNoteSchema.index({ receiptStatus: 1 });
goodsReceiptNoteSchema.index({ purchaseOrder: 1 });
goodsReceiptNoteSchema.index({ supplier: 1 });
goodsReceiptNoteSchema.index({ warehouse: 1 });
goodsReceiptNoteSchema.index({ grnDate: -1 });
goodsReceiptNoteSchema.index({ 'deliveryInfo.invoiceNumber': 1 });

module.exports = mongoose.model('GoodsReceiptNote', goodsReceiptNoteSchema);
module.exports.grnItemSchema = grnItemSchema;
module.exports.approvalSchema = approvalSchema;
module.exports.attachmentSchema = attachmentSchema;
