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

/**
 * Ensure each product is linked to the supplier (for future vendor-wise POs).
 * Idempotent — skips products that already include this supplier.
 * @returns {Promise<{ linked: number, skipped: number }>}
 */
async function linkProductsToSupplier(supplierId, productIds = [], ProductModel) {
  const Product = ProductModel || require('../models/Product');
  const sid = supplierId?._id || supplierId;
  if (!sid) return { linked: 0, skipped: 0 };

  const ids = [...new Set(
    (productIds || [])
      .map((id) => {
        if (!id) return null;
        if (typeof id === 'object') return String(id._id || id.product || '');
        return String(id);
      })
      .filter((id) => id && /^[a-f\d]{24}$/i.test(id))
  )];

  if (ids.length === 0) return { linked: 0, skipped: 0 };

  const products = await Product.find({ _id: { $in: ids } }).select('sku unit suppliers');
  let linked = 0;
  let skipped = 0;

  await Promise.all(products.map(async (product) => {
    const existing = normalizeSupplierLinks(product.suppliers, product);
    const alreadyLinked = existing.some((link) => String(link.supplier) === String(sid));
    if (alreadyLinked) {
      skipped += 1;
      return;
    }

    product.suppliers = dedupeSupplierLinks([
      ...existing,
      {
        supplier: sid,
        sku: product.sku || '',
        unit: product.unit || 'pcs',
      },
    ]);
    product.markModified('suppliers');
    await product.save();
    linked += 1;
  }));

  return { linked, skipped };
}

/**
 * Link every line-item product on a PO to that PO's supplier.
 */
async function linkPurchaseOrderProductsToSupplier(po, ProductModel) {
  if (!po?.supplier) return { linked: 0, skipped: 0 };
  const supplierId = po.supplier._id || po.supplier;
  const productIds = (po.items || []).map((item) => item.product);
  return linkProductsToSupplier(supplierId, productIds, ProductModel);
}

module.exports = {
  normalizeSupplierLinks,
  parseSupplierLinksPayload,
  dedupeSupplierLinks,
  isLegacySupplierEntry,
  linkProductsToSupplier,
  linkPurchaseOrderProductsToSupplier,
};
