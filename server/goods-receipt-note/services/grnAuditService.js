const GoodsReceiptAudit = require('../../models/GoodsReceiptAudit');

async function logGrnAudit({
  grnId,
  grnNumber,
  action,
  performedBy = 'System',
  previousStatus,
  newStatus,
  changes,
  comments,
}) {
  return GoodsReceiptAudit.create({
    grn: grnId,
    grnNumber,
    action,
    performedBy,
    previousStatus,
    newStatus,
    changes,
    comments,
  });
}

async function getGrnAuditTrail(grnId) {
  return GoodsReceiptAudit.find({ grn: grnId }).sort({ performedAt: -1 }).lean();
}

module.exports = { logGrnAudit, getGrnAuditTrail };
