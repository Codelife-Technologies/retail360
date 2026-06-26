const mongoose = require('mongoose');

const goodsReceiptAuditSchema = new mongoose.Schema(
  {
    grn: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsReceiptNote', required: true },
    grnNumber: { type: String, trim: true, index: true },
    action: {
      type: String,
      enum: [
        'created',
        'updated',
        'submitted',
        'inspection_recorded',
        'approval_requested',
        'approved',
        'rejected',
        'returned',
        'inventory_updated',
        'closed',
        'cancelled',
        'attachment_added',
        'attachment_removed',
        'three_way_match',
      ],
      required: true,
    },
    performedBy: { type: String, trim: true },
    performedAt: { type: Date, default: Date.now },
    previousStatus: { type: String, trim: true },
    newStatus: { type: String, trim: true },
    changes: { type: mongoose.Schema.Types.Mixed },
    comments: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
  },
  { timestamps: true }
);

goodsReceiptAuditSchema.index({ grn: 1, performedAt: -1 });

module.exports = mongoose.model('GoodsReceiptAudit', goodsReceiptAuditSchema);
