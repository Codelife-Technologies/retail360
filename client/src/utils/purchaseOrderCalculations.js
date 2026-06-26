import { getCategoryName, getTaxRateForCategory } from './taxRates';
import { isIntraState } from './indianGstValidation';

/**
 * Resolve full product object from item + products catalogue.
 */
export function resolveProduct(item, products) {
  const id = item.product?._id || item.product;
  return (products || []).find((p) => p._id === id) || item.product || {};
}

/** HSN from product or populated category */
export function getProductHsn(product) {
  if (!product) return '';
  if (product.hsnCode) return product.hsnCode;
  const cat = product.category;
  if (cat && typeof cat === 'object' && cat.hsnCode) return cat.hsnCode;
  return '';
}

/** Unit of measure from product, default PCS */
export function getProductUom(product) {
  if (!product?.unit) return 'PCS';
  return product.unit.toUpperCase();
}

/**
 * Enrich a line item with GST fields while preserving existing total semantics.
 * item.total = quantity × unitPrice (pre-discount line value, backward compatible).
 */
export function enrichLineItem(item, product, defaultTaxRate = 0) {
  const qty = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const taxRate =
    item.taxRate != null && item.taxRate !== ''
      ? Number(item.taxRate)
      : getTaxRateForCategory(getCategoryName(product), defaultTaxRate);

  const gross = qty * unitPrice;
  const discountAmount = (gross * discountPercent) / 100;
  const taxableValue = gross - discountAmount;
  const taxAmount = (taxableValue * taxRate) / 100;
  const lineTotal = taxableValue + taxAmount;
  const orderedQty = qty;
  const receivedQty = Number(item.receivedQuantity) || 0;
  const pendingQty =
    item.pendingQuantity != null ? Number(item.pendingQuantity) : Math.max(0, orderedQty - receivedQty);

  return {
    ...item,
    quantity: qty,
    unitPrice,
    total: gross,
    discountPercent,
    taxRate,
    taxAmount,
    lineTotal,
    taxableValue,
    discountAmount,
    unitOfMeasure: item.unitOfMeasure || getProductUom(product),
    hsnCode: item.hsnCode || getProductHsn(product),
    sku: item.sku || product?.sku || '',
    receivedQuantity: receivedQty,
    pendingQuantity: pendingQty,
  };
}

/**
 * Compute full PO financial summary with CGST/SGST/IGST split per Indian GST rules.
 */
export function computePurchaseOrderTotals(po, products = []) {
  const items = (po.items || []).map((item) => {
    const product = resolveProduct(item, products);
    return enrichLineItem(item, product, po.defaultTaxRate || 0);
  });

  const buyerState = po.buyer?.state || '';
  const supplierState = po.supplierDetails?.state || po.supplier?.state || '';
  const intra = isIntraState(buyerState, supplierState);

  let subtotal = 0;
  let discountTotal = 0;
  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  items.forEach((item) => {
    subtotal += item.total;
    discountTotal += item.discountAmount;
    taxableValue += item.taxableValue;
    if (intra) {
      cgst += item.taxAmount / 2;
      sgst += item.taxAmount / 2;
    } else {
      igst += item.taxAmount;
    }
  });

  const freightCharges = Number(po.freightCharges) || 0;
  const packingCharges = Number(po.packingCharges) || 0;
  const taxTotal = cgst + sgst + igst;
  const beforeRound =
    taxableValue + taxTotal + freightCharges + packingCharges;
  const grandTotal = Math.round(beforeRound * 100) / 100;
  const roundOff = Math.round((grandTotal - beforeRound) * 100) / 100;

  return {
    items,
    subtotal,
    discountTotal,
    taxableValue,
    cgst,
    sgst,
    igst,
    tax: taxTotal,
    freightCharges,
    packingCharges,
    roundOff,
    total: grandTotal,
    isIntraState: intra,
  };
}

/** Legacy helper — total tax amount (sum of line tax). */
export function computeCategoryTax(items, products, defaultRate = 0) {
  const totals = computePurchaseOrderTotals({ items, defaultTaxRate: defaultRate }, products);
  return totals.tax;
}

export function formatINR(amount) {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
