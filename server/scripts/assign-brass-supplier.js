require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');

const SUPPLIER_NAME = 'K. Brass Emporium';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const categories = await Category.find({ name: /^brass$/i });
  if (categories.length === 0) {
    const all = await Category.find({}, 'name').lean();
    throw new Error(
      `No category named "Brass" found. Available: ${all.map((c) => c.name).join(', ') || '(none)'}`
    );
  }

  let supplier = await Supplier.findOne({ name: new RegExp(`^${SUPPLIER_NAME.replace('.', '\\.')}$`, 'i') });
  if (!supplier) {
    supplier = new Supplier({ name: SUPPLIER_NAME });
    await supplier.save();
    console.log(`Created supplier: ${supplier.name} (${supplier._id})`);
  } else {
    console.log(`Using supplier: ${supplier.name} (${supplier._id})`);
  }

  const categoryIds = categories.map((c) => c._id);
  console.log(`Brass categories: ${categories.map((c) => c.name).join(', ')}`);

  const products = await Product.find({ category: { $in: categoryIds } });
  console.log(`Found ${products.length} product(s) in Brass category`);

  let updated = 0;
  for (const product of products) {
    const existingIds = (product.suppliers || []).map((entry) =>
      (entry.supplier?._id || entry.supplier || entry).toString()
    );
    if (existingIds.includes(supplier._id.toString())) continue;
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

  console.log(`Updated ${updated} product(s) with supplier "${SUPPLIER_NAME}"`);
  console.log(`Skipped ${products.length - updated} (already linked)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
