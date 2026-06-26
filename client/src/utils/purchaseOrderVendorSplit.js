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
  return suppliers.find((s) => s._id === id)?.name || '';
}

/**
 * Group PO line items by each product's designated supplier.
 * @returns {{ bySupplier: Map<string, { supplierId: string, supplierName: string, items: object[] }>, unassigned: object[] }}
 */
export function groupPoItemsBySupplier(items, products, suppliers = []) {
  const bySupplier = new Map();
  const unassigned = [];

  (items || []).forEach((item) => {
    const productId = item.product?._id || item.product;
    const product = (products || []).find((p) => p._id === productId);
    const supplierId = getDesignatedSupplierId(product);

    if (!supplierId) {
      unassigned.push({ item, product });
      return;
    }

    if (!bySupplier.has(supplierId)) {
      bySupplier.set(supplierId, {
        supplierId,
        supplierName: getDesignatedSupplierName(product, suppliers),
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
