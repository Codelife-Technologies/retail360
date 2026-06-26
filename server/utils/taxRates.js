const CATEGORY_TAX_RATES = {
  brass: 12,
  copper: 12,
  gemstone: 5,
};

function getCategoryName(product) {
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

function getTaxRateForCategory(categoryName, defaultRate = 0) {
  const fallback = Number(defaultRate) || 0;
  if (!categoryName) return fallback;
  const key = normalizeCategoryKey(categoryName);
  return CATEGORY_TAX_RATES[key] !== undefined ? CATEGORY_TAX_RATES[key] : fallback;
}

function computeCategoryTax(items, products, defaultRate = 0) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const productId = item.product?._id || item.product;
    const fullProduct =
      (products || []).find((p) => p._id.toString() === productId.toString()) ||
      item.product ||
      {};
    const rate = getTaxRateForCategory(getCategoryName(fullProduct), defaultRate);
    const lineTotal =
      item.total != null ? item.total : (item.quantity || 0) * (item.unitPrice || 0);
    return sum + (lineTotal * rate) / 100;
  }, 0);
}

module.exports = {
  CATEGORY_TAX_RATES,
  getCategoryName,
  normalizeCategoryKey,
  getTaxRateForCategory,
  computeCategoryTax,
};
