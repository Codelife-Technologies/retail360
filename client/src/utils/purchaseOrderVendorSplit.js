/**
 * Resolve the designated (primary) supplier for a product from its supplier links.
 */
export function getDesignatedSupplierId(product) {
  if (!product?.suppliers?.length) return null;
  const first = product.suppliers[0];
  if (first?.supplier) {
    return String(first.supplier._id || first.supplier);
  }
  if (first?._id && first?.name) {
    return String(first._id);
  }
  return null;
}

export function getDesignatedSupplierName(product, suppliers = []) {
  const id = getDesignatedSupplierId(product);
  if (!id) return '';
  const fromProduct = product.suppliers?.[0]?.supplier?.name || product.suppliers?.[0]?.name;
  if (fromProduct) return fromProduct;
  return suppliers.find((s) => String(s._id) === String(id))?.name || '';
}

/** Prefer explicit line-item vendor, then product designated supplier. */
export function getLineSupplierId(item, product) {
  if (item?.supplierId) return String(item.supplierId);
  if (item?.supplier) return String(item.supplier._id || item.supplier);
  return getDesignatedSupplierId(product);
}

export function getLineSupplierName(item, product, suppliers = []) {
  const id = getLineSupplierId(item, product);
  if (!id) return '';
  const fromList = suppliers.find((s) => String(s._id) === String(id))?.name;
  if (fromList) return fromList;
  if (item?.supplierName) return item.supplierName;
  return getDesignatedSupplierName(product, suppliers);
}

/** Suppliers linked on the product, or all suppliers if none are linked. */
export function getVendorOptionsForProduct(product, suppliers = []) {
  const linked = (product?.suppliers || [])
    .map((link) => {
      const id = link.supplier?._id || link.supplier || (link.name ? link._id : null);
      if (!id) return null;
      const fromList = suppliers.find((s) => String(s._id) === String(id));
      return {
        _id: String(id),
        name: fromList?.name || link.supplier?.name || link.name || 'Vendor',
      };
    })
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  linked.forEach((vendor) => {
    if (seen.has(vendor._id)) return;
    seen.add(vendor._id);
    unique.push(vendor);
  });

  if (unique.length > 0) return unique;
  return (suppliers || []).map((s) => ({ _id: String(s._id), name: s.name }));
}

/**
 * Group PO line items by vendor (line override or product designated supplier).
 * @returns {{ bySupplier: Map<string, { supplierId: string, supplierName: string, items: object[] }>, unassigned: object[] }}
 */
export function groupPoItemsBySupplier(items, products, suppliers = []) {
  const bySupplier = new Map();
  const unassigned = [];

  (items || []).forEach((item) => {
    const productId = item.product?._id || item.product;
    const product = (products || []).find((p) => p._id === productId);
    const supplierId = getLineSupplierId(item, product);

    if (!supplierId) {
      unassigned.push({ item, product });
      return;
    }

    if (!bySupplier.has(supplierId)) {
      bySupplier.set(supplierId, {
        supplierId,
        supplierName: getLineSupplierName(item, product, suppliers),
        items: [],
      });
    }
    bySupplier.get(supplierId).items.push(item);
  });

  return { bySupplier, unassigned };
}

export function sortItemsBySupplier(items, products, suppliers = []) {
  const { bySupplier, unassigned } = groupPoItemsBySupplier(items, products, suppliers);
  const sorted = [];
  [...bySupplier.values()]
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName))
    .forEach((group) => sorted.push(...group.items));
  unassigned.forEach(({ item }) => sorted.push(item));
  return sorted;
}
