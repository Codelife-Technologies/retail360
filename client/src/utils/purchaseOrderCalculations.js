import { findHsnMaster, getProductHsnCode, getTaxRateForProduct } from './taxRates';
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
  return getProductHsnCode(product);
}

/** Unit of measure from product, then HSN master default, else PCS */
export function getProductUom(product, hsnMasters = []) {
  if (product?.unit) return String(product.unit).toUpperCase();
  const hsnRow = findHsnMaster(getProductHsn(product), hsnMasters);
  if (hsnRow?.defaultUom) return String(hsnRow.defaultUom).toUpperCase();
  return 'PCS';
}

/**
 * Enrich a line item with GST fields while preserving existing total semantics.
 * Tax % comes from HSN Tax Master (then Category gstRate) when not explicitly set.
 */
export function enrichLineItem(item, product, defaultTaxRate = 0, hsnMasters = []) {
  const qty = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discountPercent = Number(item.discountPercent) || 0;
  const masterRate = getTaxRateForProduct(product, defaultTaxRate, hsnMasters);
  const taxRate =
    item.taxRate != null && item.taxRate !== ''
      ? Number(item.taxRate)
      : masterRate;

  const gross = qty * unitPrice;
  const discountAmount = (gross * discountPercent) / 100;
  const taxableValue = gross - discountAmount;
  const taxAmount = (taxableValue * taxRate) / 100;
  const lineTotal = taxableValue + taxAmount;
  const orderedQty = qty;
  const receivedQty = Number(item.receivedQuantity) || 0;
  const pendingQty =
    item.pendingQuantity != null ? Number(item.pendingQuantity) : Math.max(0, orderedQty - receivedQty);
  const hsnCode = item.hsnCode || getProductHsn(product);
  const hsnRow = findHsnMaster(hsnCode, hsnMasters);

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
    unitOfMeasure: item.unitOfMeasure || getProductUom(product, hsnMasters),
    hsnCode,
    hsnDescription: item.hsnDescription || hsnRow?.description || '',
    cgstRate:
      item.cgstRate != null && item.cgstRate !== ''
        ? Number(item.cgstRate)
        : hsnRow?.cgstRate != null
          ? Number(hsnRow.cgstRate)
          : Math.round((taxRate / 2) * 100) / 100,
    sgstRate:
      item.sgstRate != null && item.sgstRate !== ''
        ? Number(item.sgstRate)
        : hsnRow?.sgstRate != null
          ? Number(hsnRow.sgstRate)
          : Math.round((taxRate / 2) * 100) / 100,
    igstRate:
      item.igstRate != null && item.igstRate !== ''
        ? Number(item.igstRate)
        : hsnRow?.igstRate != null
          ? Number(hsnRow.igstRate)
          : taxRate,
    cessRate:
      item.cessRate != null && item.cessRate !== ''
        ? Number(item.cessRate)
        : hsnRow?.cessRate != null
          ? Number(hsnRow.cessRate)
          : 0,
    sku: item.sku || product?.sku || '',
    itemName: item.itemName || product?.title || product?.name || '',
    receivedQuantity: receivedQty,
    pendingQuantity: pendingQty,
  };
}

/**
 * Compute full PO financial summary with CGST/SGST/IGST split per Indian GST rules.
 */
export function computePurchaseOrderTotals(po, products = [], hsnMasters = []) {
  const items = (po.items || []).map((item) => {
    const product = resolveProduct(item, products);
    return enrichLineItem(item, product, po.defaultTaxRate || 0, hsnMasters);
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
export function computeCategoryTax(items, products, defaultRate = 0, hsnMasters = []) {
  const totals = computePurchaseOrderTotals(
    { items, defaultTaxRate: defaultRate },
    products,
    hsnMasters
  );
  return totals.tax;
}

export function formatINR(amount) {
  return `₹${(Number(amount) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
