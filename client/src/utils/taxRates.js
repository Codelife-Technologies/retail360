// Legacy name-based fallback when HSN master / category.gstRate is not set.
export const CATEGORY_TAX_RATES = {
  brass: 12,
  copper: 12,
  gemstone: 5,
};

/** HSN from product or populated category */
export function getProductHsnCode(product) {
  if (!product) return '';
  if (product.hsnCode) return String(product.hsnCode).trim();
  const cat = product.category;
  if (cat && typeof cat === 'object' && cat.hsnCode) return String(cat.hsnCode).trim();
  return '';
}

export function findHsnMaster(hsnCode, hsnMasters = []) {
  const code = String(hsnCode || '').trim().toUpperCase();
  if (!code) return null;
  return (
    (hsnMasters || []).find(
      (row) =>
        String(row.hsnCode || '').trim().toUpperCase() === code && row.isActive !== false
    ) || null
  );
}

export function getTaxRateFromHsnMaster(hsnCode, hsnMasters = [], defaultRate = 0) {
  const row = findHsnMaster(hsnCode, hsnMasters);
  if (row && row.gstRate != null && row.gstRate !== '') {
    const rate = Number(row.gstRate);
    if (Number.isFinite(rate)) return rate;
  }
  return Number(defaultRate) || 0;
}

// Extract a product's category name whether it's populated ({ name }) or a string.
export function getCategoryName(product) {
  if (!product) return '';
  const cat = product.category;
  if (!cat) return '';
  if (typeof cat === 'string') return cat;
  return cat.name || '';
}

function normalizeCategoryKey(categoryName) {
  const key = categoryName.toString().trim().toLowerCase();
  if (CATEGORY_TAX_RATES[key] !== undefined) return key;
  if (key.endsWith('s') && key.length > 4) {
    const singular = key.slice(0, -1);
    if (CATEGORY_TAX_RATES[singular] !== undefined) return singular;
  }
  if (key.endsWith('es') && key.length > 4) {
    const withoutEs = key.slice(0, -2);
    if (CATEGORY_TAX_RATES[withoutEs] !== undefined) return withoutEs;
  }
  return key;
}

export function getTaxRateForCategory(categoryName, defaultRate = 0) {
  const fallback = Number(defaultRate) || 0;
  if (!categoryName) return fallback;
  const key = normalizeCategoryKey(categoryName);
  return CATEGORY_TAX_RATES[key] !== undefined ? CATEGORY_TAX_RATES[key] : fallback;
}

/**
 * Tax % priority: HSN Tax Master → Category gstRate → legacy name map → default.
 */
export function getTaxRateForProduct(product, defaultRate = 0, hsnMasters = []) {
  const fallback = Number(defaultRate) || 0;
  const hsn = getProductHsnCode(product);
  if (hsn && Array.isArray(hsnMasters) && hsnMasters.length > 0) {
    const row = findHsnMaster(hsn, hsnMasters);
    if (row && row.gstRate != null && row.gstRate !== '') {
      const rate = Number(row.gstRate);
      if (Number.isFinite(rate)) return rate;
    }
  }
  const cat = product?.category;
  if (cat && typeof cat === 'object' && cat.gstRate != null && cat.gstRate !== '') {
    const rate = Number(cat.gstRate);
    if (Number.isFinite(rate)) return rate;
  }
  return getTaxRateForCategory(getCategoryName(product), fallback);
}

export function getTaxRateForHsn(hsnCode, hsnMastersOrCategories = [], defaultRate = 0) {
  const code = String(hsnCode || '').trim();
  if (!code) return Number(defaultRate) || 0;

  const fromHsnMaster = findHsnMaster(code, hsnMastersOrCategories);
  if (fromHsnMaster && fromHsnMaster.gstRate != null && fromHsnMaster.gstRate !== '') {
    const rate = Number(fromHsnMaster.gstRate);
    if (Number.isFinite(rate)) return rate;
  }

  const match = (hsnMastersOrCategories || []).find(
    (c) => String(c.hsnCode || '').trim().toLowerCase() === code.toLowerCase()
  );
  if (match && match.gstRate != null && match.gstRate !== '') {
    const rate = Number(match.gstRate);
    if (Number.isFinite(rate)) return rate;
  }
  return Number(defaultRate) || 0;
}

export function computeCategoryTax(items, products, defaultRate = 0, hsnMasters = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const id = item.product?._id || item.product;
    const fullProduct = (products || []).find((p) => p._id === id) || item.product || {};
    const rate = getTaxRateForProduct(fullProduct, defaultRate, hsnMasters);
    const lineTotal =
      item.total != null ? item.total : (item.quantity || 0) * (item.unitPrice || 0);
    return sum + (lineTotal * rate) / 100;
  }, 0);
}

/** Split total GST equally into CGST and SGST for intra-state sales bills. */
export function splitTaxAsCgstSgst(taxAmount) {
  const tax = Number(taxAmount) || 0;
  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax - cgst) * 100) / 100;
  return { cgst, sgst };
}
