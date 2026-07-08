const Sale = require('../models/Sale');
const SalesLocation = require('../models/SalesLocation');

function getCurrentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    label: now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
  };
}

function stockRecordKey(record) {
  const productId = record.product?._id || record.product;
  const locationId = record.location?._id || record.location;
  if (!productId || !locationId) return null;
  return `${productId.toString()}-${locationId.toString()}`;
}

async function buildSoldCurrentMonthMap(productIds = null) {
  const { start, end } = getCurrentMonthRange();
  const salesLocDocs = await SalesLocation.find().select('_id location').lean();
  const salesLocToWarehouse = new Map(
    salesLocDocs.map((sl) => [sl._id.toString(), sl.location.toString()])
  );

  const match = { salesDate: { $gte: start, $lte: end } };
  const pipeline = [{ $match: match }, { $unwind: '$items' }];

  if (productIds && productIds.length > 0) {
    pipeline.push({ $match: { 'items.product': { $in: productIds } } });
  }

  pipeline.push({
    $group: {
      _id: {
        product: '$items.product',
        salesLocation: '$salesLocation',
      },
      quantity: { $sum: '$items.quantity' },
    },
  });

  const agg = await Sale.aggregate(pipeline);
  const map = new Map();

  agg.forEach((row) => {
    const warehouseLoc = salesLocToWarehouse.get(row._id.salesLocation.toString());
    if (!warehouseLoc) return;
    const key = `${row._id.product.toString()}-${warehouseLoc}`;
    map.set(key, (map.get(key) || 0) + row.quantity);
  });

  return map;
}

function enrichStockWithSoldCurrentMonth(stockRecords, salesMap) {
  return stockRecords.map((record) => {
    const doc = typeof record.toJSON === 'function' ? record.toJSON() : { ...record };
    const key = stockRecordKey(doc);
    doc.soldCurrentMonth = key ? salesMap.get(key) || 0 : 0;
    return doc;
  });
}

module.exports = {
  getCurrentMonthRange,
  buildSoldCurrentMonthMap,
  enrichStockWithSoldCurrentMonth,
};
