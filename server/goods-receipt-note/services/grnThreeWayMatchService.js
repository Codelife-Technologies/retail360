const PurchaseOrder = require('../../models/PurchaseOrder');

function runThreeWayMatch(grn, invoiceTotal = null) {
  const grnTotal = grn.grandTotal || 0;
  const poTotal = grn.threeWayMatch?.poTotal || 0;
  const invTotal =
    invoiceTotal != null
      ? Number(invoiceTotal)
      : Number(grn.deliveryInfo?.invoiceNumber ? grn.grandTotal : 0) || 0;

  const priceMismatch = poTotal > 0 && Math.abs(grnTotal - poTotal) > 0.01;
  const quantityMismatch = (grn.items || []).some(
    (i) => (i.varianceQty || 0) !== 0
  );
  const taxMismatch = false;
  const invoiceVariance =
    invTotal > 0 ? Math.round((invTotal - grnTotal) * 100) / 100 : 0;

  const alerts = [];
  if (priceMismatch) alerts.push(`GRN total (₹${grnTotal}) differs from PO total (₹${poTotal})`);
  if (quantityMismatch) {
    alerts.push('Quantity variance detected on one or more line items');
  }
  if (invTotal > 0 && Math.abs(invoiceVariance) > 0.01) {
    alerts.push(`Invoice variance: ₹${invoiceVariance}`);
  }

  let matchStatus = 'matched';
  if (alerts.length === 1) matchStatus = 'partial';
  if (alerts.length > 1) matchStatus = 'mismatch';
  if (!poTotal && !invTotal) matchStatus = 'pending';

  return {
    poTotal,
    grnTotal,
    invoiceTotal: invTotal,
    priceMismatch,
    quantityMismatch,
    taxMismatch,
    invoiceVariance,
    matchStatus,
    alerts,
    lastCheckedAt: new Date(),
  };
}

async function loadPoTotalForMatch(purchaseOrderId) {
  const po = await PurchaseOrder.findById(purchaseOrderId).select('total items').lean();
  if (!po) return 0;
  return po.total || 0;
}

module.exports = { runThreeWayMatch, loadPoTotalForMatch };
