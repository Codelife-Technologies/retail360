const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const GRN_STATUSES = [
  'draft',
  'pending_inspection',
  'partially_received',
  'fully_received',
  'approved',
  'closed',
  'cancelled',
];

const DEFAULT_APPROVAL_CHAIN = [
  { level: 1, role: 'Store Executive' },
  { level: 2, role: 'Quality Inspector' },
  { level: 3, role: 'Warehouse Manager' },
  { level: 4, role: 'Purchase Manager' },
  { level: 5, role: 'Finance Team' },
];

/** PO statuses that allow creating a GRN */
const GRN_ELIGIBLE_PO_STATUSES = ['pending', 'approved'];

const PO_BLOCKED_FOR_GRN = [];

const PO_APPROVED_LEGACY = new Set([
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

function normalizePoStatus(raw) {
  const value = String(raw || 'pending').trim().toLowerCase();
  return PO_APPROVED_LEGACY.has(value) ? 'approved' : 'pending';
}

function getPoLinePendingQty(line) {
  if (line.pendingQuantity != null) return Math.max(0, line.pendingQuantity);
  return Math.max(0, (line.quantity || 0) - (line.receivedQuantity || 0));
}

function isPoEligibleForGrn(po) {
  if (!po) return false;
  const status = normalizePoStatus(po.status);
  if (PO_BLOCKED_FOR_GRN.includes(status)) return false;
  if (!GRN_ELIGIBLE_PO_STATUSES.includes(status)) return false;
  return (po.items || []).some((line) => getPoLinePendingQty(line) > 0);
}

function validateGstin(gstin) {
  if (!gstin || !String(gstin).trim()) return { valid: true };
  return {
    valid: GSTIN_REGEX.test(String(gstin).trim().toUpperCase()),
    message: 'Invalid GSTIN format',
  };
}

function computeLineItem(item, allowExcess = false) {
  const orderedQty = Number(item.orderedQty) || 0;
  const receivedQty = Math.max(0, Number(item.receivedQty) || 0);
  const acceptedQty = Math.max(0, Number(item.acceptedQty) || 0);
  const rejectedQty = Math.max(0, Number(item.rejectedQty) || 0);

  if (receivedQty > orderedQty && !allowExcess && orderedQty > 0) {
    throw new Error(
      `Received quantity (${receivedQty}) exceeds ordered quantity (${orderedQty}) for SKU ${item.sku || 'unknown'}`
    );
  }

  if (Math.abs(acceptedQty + rejectedQty - receivedQty) > 0.0001) {
    throw new Error(
      `Accepted (${acceptedQty}) + Rejected (${rejectedQty}) must equal Received (${receivedQty}) for SKU ${item.sku || 'unknown'}`
    );
  }

  const pendingQty = Math.max(0, orderedQty - acceptedQty);
  const unitCost = Number(item.unitCost) || 0;
  const taxPercent = Number(item.taxPercent) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const gross = acceptedQty * unitCost;
  const discountAmount = (gross * discountPercent) / 100;
  const taxable = gross - discountAmount;
  const taxAmount = (taxable * taxPercent) / 100;
  const lineAmount = taxable + taxAmount;
  const varianceQty = receivedQty - orderedQty;
  const variancePercent =
    orderedQty > 0 ? Math.round((varianceQty / orderedQty) * 10000) / 100 : 0;

  return {
    ...item,
    orderedQty,
    receivedQty,
    acceptedQty,
    rejectedQty,
    pendingQty,
    unitCost,
    taxPercent,
    discountPercent,
    taxAmount: Math.round(taxAmount * 100) / 100,
    lineAmount: Math.round(lineAmount * 100) / 100,
    varianceQty,
    variancePercent,
  };
}

function computeFinancialSummary(grn) {
  const items = (grn.items || []).map((i) => computeLineItem(i, grn.allowExcessReceipt));
  const subtotal = items.reduce((s, i) => s + i.acceptedQty * i.unitCost, 0);
  const discountTotal = items.reduce(
    (s, i) => s + (i.acceptedQty * i.unitCost * (i.discountPercent || 0)) / 100,
    0
  );
  const taxableValue = subtotal - discountTotal;
  const taxTotal = items.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const cgst = Math.round((taxTotal / 2) * 100) / 100;
  const sgst = Math.round((taxTotal - cgst) * 100) / 100;
  const extras =
    (Number(grn.freightCharges) || 0) +
    (Number(grn.packingCharges) || 0) +
    (Number(grn.otherCharges) || 0);
  const beforeRound = taxableValue + taxTotal + extras;
  const rounded = Math.round(beforeRound * 100) / 100;
  const roundOff = Math.round((rounded - beforeRound) * 100) / 100;

  return {
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    taxableValue: Math.round(taxableValue * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    cgst,
    sgst,
    igst: Number(grn.igst) || 0,
    freightCharges: Number(grn.freightCharges) || 0,
    packingCharges: Number(grn.packingCharges) || 0,
    otherCharges: Number(grn.otherCharges) || 0,
    roundOff,
    grandTotal: rounded + roundOff,
  };
}

function deriveReceiptStatus(items) {
  if (!items?.length) return 'draft';
  const totalOrdered = items.reduce((s, i) => s + (i.orderedQty || 0), 0);
  const totalAccepted = items.reduce((s, i) => s + (i.acceptedQty || 0), 0);
  const totalReceived = items.reduce((s, i) => s + (i.receivedQty || 0), 0);

  if (totalAccepted >= totalOrdered && totalOrdered > 0) return 'fully_received';
  if (totalReceived > 0 || totalAccepted > 0) return 'partially_received';
  return 'draft';
}

function validateGrnPayload(data, { isUpdate = false } = {}) {
  const errors = [];

  if (!isUpdate && !data.purchaseOrder) errors.push('Purchase Order is required');
  if (!isUpdate && !data.warehouse) errors.push('Warehouse is required');
  if (!isUpdate && !data.supplier) errors.push('Supplier is required');
  if (!data.items?.length) errors.push('At least one line item is required');

  const gst = validateGstin(data.supplierDetails?.gstin);
  if (!gst.valid) errors.push(gst.message);

  try {
    if (data.items?.length) {
      data.items.forEach((item) => computeLineItem(item, data.allowExcessReceipt));
    }
  } catch (err) {
    errors.push(err.message);
  }

  return errors;
}

module.exports = {
  GRN_STATUSES,
  GRN_ELIGIBLE_PO_STATUSES,
  PO_BLOCKED_FOR_GRN,
  DEFAULT_APPROVAL_CHAIN,
  GSTIN_REGEX,
  validateGstin,
  getPoLinePendingQty,
  isPoEligibleForGrn,
  computeLineItem,
  computeFinancialSummary,
  deriveReceiptStatus,
  validateGrnPayload,
};
