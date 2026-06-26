/** Client-side GRN validation helpers (mirrors server rules). */

export function validateLineQuantities(item, allowExcess = false) {
  const ordered = Number(item.orderedQty) || 0;
  const received = Number(item.receivedQty) || 0;
  const accepted = Number(item.acceptedQty) || 0;
  const rejected = Number(item.rejectedQty) || 0;

  if (received > ordered && !allowExcess && ordered > 0) {
    return `Received (${received}) exceeds ordered (${ordered})`;
  }
  if (Math.abs(accepted + rejected - received) > 0.001) {
    return `Accepted + Rejected must equal Received`;
  }
  return null;
}

export function validateGstin(gstin) {
  if (!gstin?.trim()) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
}
