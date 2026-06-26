const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

async function resolveLineSupplier(productId) {
  if (!productId) return { supplier: null, supplierName: '' };

  const product = await Product.findById(productId)
    .populate({ path: 'suppliers.supplier', select: 'name' })
    .lean();

  const first = product?.suppliers?.[0];
  if (!first) return { supplier: null, supplierName: '' };

  const supplierId = first.supplier?._id || first.supplier;
  const supplierName = first.supplier?.name || '';

  if (supplierName) {
    return { supplier: supplierId || null, supplierName };
  }

  if (supplierId) {
    const supplier = await Supplier.findById(supplierId).select('name').lean();
    return { supplier: supplierId, supplierName: supplier?.name || '' };
  }

  return { supplier: null, supplierName: '' };
}

async function enrichLineWithSupplier(line) {
  const productId = line.product?._id || line.product;
  if (line.supplierName && line.supplier) return line;

  const { supplier, supplierName } = await resolveLineSupplier(productId);
  return {
    ...line,
    supplier: line.supplier || supplier,
    supplierName: line.supplierName || supplierName,
  };
}

async function enrichLinesWithSupplier(lines = []) {
  return Promise.all(lines.map((line) => enrichLineWithSupplier(line)));
}

function supplierNameFromPopulatedLine(line) {
  if (line.supplierName) return line.supplierName;
  const first = line.product?.suppliers?.[0];
  return first?.supplier?.name || '';
}

function hydratePrSupplierNames(pr) {
  if (!pr) return pr;
  const doc = pr.toObject?.() || pr;
  if (Array.isArray(doc.items)) {
    doc.items = doc.items.map((line) => ({
      ...line,
      supplierName: supplierNameFromPopulatedLine(line),
      supplier:
        line.supplier ||
        line.product?.suppliers?.[0]?.supplier?._id ||
        line.product?.suppliers?.[0]?.supplier ||
        line.supplier,
    }));
  }
  return doc;
}

module.exports = {
  resolveLineSupplier,
  enrichLineWithSupplier,
  enrichLinesWithSupplier,
  supplierNameFromPopulatedLine,
  hydratePrSupplierNames,
};
