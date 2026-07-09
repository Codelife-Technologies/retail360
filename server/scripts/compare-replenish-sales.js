const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const SalesLocation = require('../models/SalesLocation');

function buildMonthBuckets() {
  const now = new Date();
  return [1, 2, 3, 4].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return { key, label, start, end, offset };
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
  const monthBuckets = buildMonthBuckets();
  const rangeStart = monthBuckets[2].start;
  const rangeEnd = monthBuckets[0].end;
  console.log('Past 3 months range:', rangeStart.toISOString(), 'to', rangeEnd.toISOString());
  console.log('Buckets:', monthBuckets.slice(0, 3).map((b) => `${b.key} (${b.label})`));

  const products = await Product.find({}).select('_id');
  const productIds = products.map((p) => p._id);

  const dashboardStyle = await Sale.aggregate([
    { $match: { salesDate: { $gte: rangeStart, $lte: rangeEnd } } },
    { $unwind: '$items' },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);

  const replenishFiltered = await Sale.aggregate([
    {
      $match: {
        salesDate: { $gte: rangeStart, $lte: rangeEnd },
        'items.product': { $in: productIds },
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);

  const salesLocDocs = await SalesLocation.find().select('_id location').lean();
  const salesLocToWarehouse = new Map(
    salesLocDocs.map((sl) => [sl._id.toString(), sl.location?.toString()])
  );

  const salesMonthlyAgg = await Sale.aggregate([
    {
      $match: {
        'items.product': { $in: productIds },
        salesDate: { $gte: monthBuckets[3].start, $lte: monthBuckets[0].end },
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    {
      $group: {
        _id: {
          product: '$items.product',
          salesLocation: '$salesLocation',
          yearMonth: {
            $dateToString: {
              format: '%Y-%m',
              date: '$salesDate',
              timezone: 'Asia/Kolkata',
            },
          },
        },
        quantity: { $sum: '$items.quantity' },
      },
    },
  ]);

  let mappedQty = 0;
  let unmappedQty = 0;
  let past3mapped = 0;
  const past3Keys = new Set(monthBuckets.slice(0, 3).map((b) => b.key));
  salesMonthlyAgg.forEach((row) => {
    const wh = salesLocToWarehouse.get(String(row._id.salesLocation));
    if (!wh) unmappedQty += row.quantity;
    else {
      mappedQty += row.quantity;
      if (past3Keys.has(row._id.yearMonth)) past3mapped += row.quantity;
    }
  });

  console.log('Dashboard-style total (all items):', dashboardStyle[0]?.qty || 0);
  console.log('Replenish product-filtered total:', replenishFiltered[0]?.qty || 0);
  console.log('Mapped sales qty (4 month agg):', mappedQty);
  console.log('Unmapped sales qty (4 month agg):', unmappedQty);
  console.log('Mapped past-3-month keys only:', past3mapped);

  const missingProduct = await Sale.aggregate([
    { $match: { salesDate: { $gte: rangeStart, $lte: rangeEnd } } },
    { $unwind: '$items' },
    {
      $match: {
        $or: [{ 'items.product': null }, { 'items.product': { $nin: productIds } }],
      },
    },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);
  console.log('Qty with missing/non-catalog product:', missingProduct[0]?.qty || 0);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
