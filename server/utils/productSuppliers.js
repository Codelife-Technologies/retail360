function isLegacySupplierEntry(entry) {
  if (!entry) return false;
  if (entry.supplier != null) return false;
  return mongooseObjectIdLike(entry);
}

function mongooseObjectIdLike(value) {
  if (value && typeof value === 'object' && value._id) return true;
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function normalizeSupplierLinks(rawLinks, product = {}) {
  const defaultSku = product.sku || '';
  const defaultUnit = product.unit || 'pcs';

  return (rawLinks || [])
    .map((entry) => {
      if (!entry) return null;

      if (entry.supplier != null) {
        const supplierId = entry.supplier._id || entry.supplier;
        return {
          supplier: supplierId,
          sku: (entry.sku || defaultSku).trim(),
          unit: (entry.unit || defaultUnit).trim() || 'pcs',
        };
      }

      if (entry.name && entry._id) {
        return {
          supplier: entry._id,
          sku: defaultSku,
          unit: defaultUnit,
        };
      }

      if (mongooseObjectIdLike(entry)) {
        return {
          supplier: entry._id || entry,
          sku: defaultSku,
          unit: defaultUnit,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function dedupeSupplierLinks(links) {
  const seen = new Set();
  return links.filter((link) => {
    const id = String(link.supplier);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function parseSupplierLinksPayload(payload, product = {}) {
  if (!Array.isArray(payload)) return [];

  const defaultSku = product.sku || '';
  const defaultUnit = product.unit || 'pcs';

  const links = payload
    .map((entry) => {
      if (typeof entry === 'string') {
        return { supplier: entry, sku: defaultSku, unit: defaultUnit };
      }
      if (entry && entry.supplier) {
        return {
          supplier: entry.supplier._id || entry.supplier,
          sku: (entry.sku || defaultSku).trim(),
          unit: (entry.unit || defaultUnit).trim() || 'pcs',
        };
      }
      return null;
    })
    .filter(Boolean);

  return dedupeSupplierLinks(links);
}

module.exports = {
  normalizeSupplierLinks,
  parseSupplierLinksPayload,
  dedupeSupplierLinks,
  isLegacySupplierEntry,
};
