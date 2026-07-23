const PurchaseOrder = require('../models/PurchaseOrder');

function localDatePrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `PO-${y}${m}${d}-`;
}

function parseTrailingSequence(poNumber) {
  const parts = String(poNumber || '').split('-');
  const n = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Next serial continues from the previous PO (any date), not reset daily.
 * Format stays PO-YYYYMMDD-NNN using today's local date.
 */
async function resolveNextSequence() {
  const lastPO = await PurchaseOrder.findOne({})
    .sort({ createdAt: -1 })
    .select('poNumber')
    .lean();

  const fromLast = parseTrailingSequence(lastPO?.poNumber);
  if (fromLast != null) return fromLast + 1;

  const lastByNumber = await PurchaseOrder.findOne({
    poNumber: { $regex: /^PO-/ },
  })
    .sort({ poNumber: -1 })
    .select('poNumber')
    .lean();

  const fromSorted = parseTrailingSequence(lastByNumber?.poNumber);
  return fromSorted != null ? fromSorted + 1 : 1;
}

/**
 * Allocator that increments in-memory for batch creates/imports
 * so consecutive POs get sequential numbers without races.
 */
function createPoNumberAllocator() {
  let prefix = null;
  let nextSeq = null;

  return async function allocatePoNumber() {
    if (prefix == null || nextSeq == null) {
      prefix = localDatePrefix();
      nextSeq = await resolveNextSequence();
    }
    const poNumber = `${prefix}${String(nextSeq).padStart(3, '0')}`;
    nextSeq += 1;
    return poNumber;
  };
}

async function generatePONumber() {
  const allocate = createPoNumberAllocator();
  return allocate();
}

module.exports = {
  generatePONumber,
  createPoNumberAllocator,
  localDatePrefix,
};
