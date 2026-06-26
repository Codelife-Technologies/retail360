/** GSTIN: 15 chars — 2 digit state + 10 PAN + entity + Z + checksum */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** PAN: 10 chars — AAAAA9999A */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function validateGSTIN(gstin) {
  if (!gstin || !gstin.trim()) return { valid: true, message: '' };
  const normalized = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(normalized)) {
    return { valid: false, message: 'Invalid GSTIN format (15 characters, e.g. 27AAAAA0000A1Z5)' };
  }
  return { valid: true, message: '', value: normalized };
}

export function validatePAN(pan) {
  if (!pan || !pan.trim()) return { valid: true, message: '' };
  const normalized = pan.trim().toUpperCase();
  if (!PAN_REGEX.test(normalized)) {
    return { valid: false, message: 'Invalid PAN format (10 characters, e.g. AAAAA0000A)' };
  }
  return { valid: true, message: '', value: normalized };
}

export function validateQuantity(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    return { valid: false, message: 'Quantity must be greater than zero' };
  }
  return { valid: true, message: '' };
}

export function validatePrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) {
    return { valid: false, message: 'Price cannot be negative' };
  }
  return { valid: true, message: '' };
}

export function validateTaxRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { valid: false, message: 'Tax rate must be between 0 and 100' };
  }
  return { valid: true, message: '' };
}

/** Compare buyer & supplier state for intra-state (CGST+SGST) vs inter-state (IGST). */
export function isIntraState(buyerState, supplierState) {
  if (!buyerState || !supplierState) return true;
  return buyerState.trim().toLowerCase() === supplierState.trim().toLowerCase();
}
