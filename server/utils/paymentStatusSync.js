const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceiptNote = require('../models/GoodsReceiptNote');
const Purchase = require('../models/Purchase');

function normalizePaymentStatus(value) {
  const raw = String(value || 'unpaid').trim().toLowerCase();
  return raw === 'paid' ? 'paid' : 'unpaid';
}

/**
 * Keep payment status aligned across PO, linked GRNs, and Purchases.
 * @param {object} opts
 * @param {string|import('mongoose').Types.ObjectId} [opts.purchaseOrderId]
 * @param {string} opts.paymentStatus
 * @param {'po'|'grn'|'purchase'} [opts.source]
 */
async function syncLinkedPaymentStatus({
  purchaseOrderId,
  paymentStatus,
  source = 'po',
} = {}) {
  const status = normalizePaymentStatus(paymentStatus);
  if (!purchaseOrderId) return { paymentStatus: status };

  const poId = purchaseOrderId;

  if (source !== 'po') {
    await PurchaseOrder.updateOne(
      { _id: poId },
      { $set: { paymentStatus: status } }
    );
  }

  if (source !== 'grn') {
    await GoodsReceiptNote.updateMany(
      { purchaseOrder: poId },
      { $set: { paymentStatus: status } }
    );
  }

  if (source !== 'purchase') {
    await Purchase.updateMany(
      { purchaseOrder: poId },
      { $set: { paymentStatus: status } }
    );
  }

  return { paymentStatus: status };
}

module.exports = {
  normalizePaymentStatus,
  syncLinkedPaymentStatus,
};
