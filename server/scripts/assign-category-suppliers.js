require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const { normalizeSupplierLinks } = require('../utils/productSuppliers');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

const CATEGORY_SUPPLIER_RULES = [
  { categoryPattern: /^brass$/i, supplierName: 'K. Brass Emporium' },
  { categoryPattern: /^gemstone$/i, supplierName: 'khalid' },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findOrCreateSupplier(name) {
  let supplier = await Supplier.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  });
  if (!supplier) {
    supplier = new Supplier({ name });
    await supplier.save();
    console.log(`Created supplier: ${supplier.name} (${supplier._id})`);
  } else {
    console.log(`Using supplier: ${supplier.name} (${supplier._id})`);
  }
  return supplier;
}

function getLinkedSupplierIds(product) {
  return (product.suppliers || []).map((entry) =>
    (entry.supplier?._id || entry.supplier || entry).toString()
  );
}

async function assignSupplierToCategoryProducts(categoryPattern, supplier) {
  const categories = await Category.find({ name: categoryPattern });
  if (categories.length === 0) {
    console.warn(`No category matching /${categoryPattern}/ — skipped`);
    return { total: 0, updated: 0 };
  }

  const categoryIds = categories.map((c) => c._id);
  console.log(
    `Category "${categories.map((c) => c.name).join(', ')}" → ${supplier.name}`
  );

  const products = await Product.find({ category: { $in: categoryIds } });
  console.log(`  Found ${products.length} product(s)`);

  let updated = 0;
  for (const product of products) {
    product.suppliers = normalizeSupplierLinks(product.suppliers, product);
    const linked = getLinkedSupplierIds(product);
    if (linked.includes(supplier._id.toString())) {
      if (product.isModified('suppliers')) await product.save();
      continue;
    }

    product.suppliers = [
      ...(product.suppliers || []),
      {
        supplier: supplier._id,
        sku: product.sku || '',
        unit: product.unit || 'pcs',
      },
    ];
    await product.save();
    updated += 1;
  }

  console.log(`  Linked ${updated} product(s), skipped ${products.length - updated} (already linked)`);
  return { total: products.length, updated };
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  for (const rule of CATEGORY_SUPPLIER_RULES) {
    const supplier = await findOrCreateSupplier(rule.supplierName);
    await assignSupplierToCategoryProducts(rule.categoryPattern, supplier);
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
