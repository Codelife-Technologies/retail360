// Category-based tax rates (percentage). Matched case-insensitively against the
// product's category name. Categories not listed here fall back to a manual
// default rate supplied per order.
export const CATEGORY_TAX_RATES = {
  brass: 12,
  copper: 12,
  gemstone: 5,
};

// Extract a product's category name whether it's populated ({ name }) or a string.
export function getCategoryName(product) {
  if (!product) return '';
  const cat = product.category;
  if (!cat) return '';
  if (typeof cat === 'string') return cat;
  return cat.name || '';
}

// Resolve the tax percentage for a category name, falling back to defaultRate.
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

// Compute the total tax amount for a list of order items.
// items: [{ product, quantity, unitPrice, total }]
// products: full product list (with populated category) used to look up categories.
export function computeCategoryTax(items, products, defaultRate = 0) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const id = item.product?._id || item.product;
    const fullProduct = (products || []).find((p) => p._id === id) || item.product || {};
    const rate = getTaxRateForCategory(getCategoryName(fullProduct), defaultRate);
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
