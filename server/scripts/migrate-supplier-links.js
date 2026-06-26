require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { normalizeSupplierLinks } = require('../utils/productSuppliers');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const products = await Product.find({});
  let migrated = 0;

  for (const product of products) {
    const raw = product.suppliers || [];
    if (raw.length === 0) continue;

    const needsMigration = raw.some((entry) => !entry?.supplier);
    if (!needsMigration) continue;

    product.suppliers = normalizeSupplierLinks(raw, product);
    await product.save();
    migrated += 1;
  }

  console.log(`Migrated supplier links on ${migrated} product(s)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
