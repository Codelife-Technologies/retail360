require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Stock = require('../models/Stock');
const SalesLocation = require('../models/SalesLocation');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

/**
 * Stock uploads reflect on-hand qty after sales. Recording sales in the app
 * should not reduce stock again — this script adds back all sold quantities
 * per product/warehouse to undo prior automatic deductions.
 */
async function main() {
  await mongoose.connect(MONGODB_URI);

  const salesLocDocs = await SalesLocation.find().select('_id location').lean();
  const salesLocToWarehouse = new Map(
    salesLocDocs.map((sl) => [sl._id.toString(), sl.location.toString()])
  );

  const soldAgg = await Sale.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          product: '$items.product',
          salesLocation: '$salesLocation',
        },
        quantity: { $sum: '$items.quantity' },
      },
    },
  ]);

  const soldByStockKey = new Map();
  for (const row of soldAgg) {
    const warehouseLoc = salesLocToWarehouse.get(row._id.salesLocation.toString());
    if (!warehouseLoc) continue;
    const key = `${row._id.product.toString()}-${warehouseLoc}`;
    soldByStockKey.set(key, (soldByStockKey.get(key) || 0) + row.quantity);
  }

  let updated = 0;
  let totalUnitsRestored = 0;

  for (const [key, soldQty] of soldByStockKey) {
    if (!soldQty) continue;
    const [productId, locationId] = key.split('-');
    const stock = await Stock.findOne({ product: productId, location: locationId });
    if (!stock) continue;

    const before = stock.quantity || 0;
    stock.quantity = before + soldQty;
    stock.lastUpdated = new Date();
    await stock.save();
    updated += 1;
    totalUnitsRestored += soldQty;
  }

  console.log(
    `Restored stock on ${updated} product-location record(s); added back ${totalUnitsRestored} unit(s) from sales history.`
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
