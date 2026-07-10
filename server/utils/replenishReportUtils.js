const mongoose = require('mongoose');
const Sale = require('../models/Sale');

function getDatePartsInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const pick = (type) => Number(parts.find((part) => part.type === type).value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function addMonths(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function startOfMonthInTimeZone(year, month, timeZone) {
  const approx = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);

  for (let offsetMinutes = -48 * 60; offsetMinutes <= 48 * 60; offsetMinutes += 15) {
    const candidate = new Date(approx + offsetMinutes * 60000);
    const parts = getDatePartsInTimezone(candidate, timeZone);

    if (
      parts.year === year
      && parts.month === month
      && parts.day === 1
      && parts.hour === 0
      && parts.minute === 0
    ) {
      for (let secondOffset = -60; secondOffset <= 60; secondOffset += 1) {
        const fine = new Date(candidate.getTime() + secondOffset * 1000);
        const fineParts = getDatePartsInTimezone(fine, timeZone);
        if (
          fineParts.year === year
          && fineParts.month === month
          && fineParts.day === 1
          && fineParts.hour === 0
          && fineParts.minute === 0
          && fineParts.second === 0
        ) {
          return fine;
        }
      }
      return candidate;
    }
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

function endOfMonthInTimeZone(year, month, timeZone) {
  const next = addMonths(year, month, 1);
  const nextStart = startOfMonthInTimeZone(next.year, next.month, timeZone);
  return new Date(nextStart.getTime() - 1);
}

/** Current calendar month (in-progress). */
function buildCurrentMonthBucket(timeZone = 'Asia/Kolkata') {
  const now = new Date();
  const { year, month } = getDatePartsInTimezone(now, timeZone);
  const start = startOfMonthInTimeZone(year, month, timeZone);
  const end = endOfMonthInTimeZone(year, month, timeZone);
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const label = start.toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone,
  });

  return { key, label, start, end };
}

/** Previous month + the 3 calendar months before it (excludes current month). */
function buildReplenishMonthBuckets(timeZone = 'Asia/Kolkata') {
  const now = new Date();
  const { year, month } = getDatePartsInTimezone(now, timeZone);

  return [1, 2, 3, 4].map((offset) => {
    const { year: bucketYear, month: bucketMonth } = addMonths(year, month, -offset);
    const start = startOfMonthInTimeZone(bucketYear, bucketMonth, timeZone);
    const end = endOfMonthInTimeZone(bucketYear, bucketMonth, timeZone);
    const key = `${bucketYear}-${String(bucketMonth).padStart(2, '0')}`;
    const label = start.toLocaleDateString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone,
    });

    return { key, label, start, end, offset };
  });
}

async function aggregateReplenishSalesMonthly({
  productIds,
  monthBuckets,
  timeZone,
  locationId = null,
}) {
  if (!productIds.length || !monthBuckets.length) {
    return new Map();
  }

  const locationObjectId = locationId
    ? new mongoose.Types.ObjectId(locationId)
    : null;

  const pipeline = [
    {
      $match: {
        'items.product': { $in: productIds },
        salesDate: {
          $gte: monthBuckets[monthBuckets.length - 1].start,
          $lte: monthBuckets[0].end,
        },
        salesLocation: { $exists: true, $ne: null },
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    {
      $lookup: {
        from: 'saleslocations',
        localField: 'salesLocation',
        foreignField: '_id',
        as: 'salesLocDoc',
      },
    },
    { $unwind: '$salesLocDoc' },
    {
      $match: {
        'salesLocDoc.location': { $exists: true, $ne: null },
        ...(locationObjectId ? { 'salesLocDoc.location': locationObjectId } : {}),
      },
    },
    {
      $group: {
        _id: {
          product: '$items.product',
          salesLocation: '$salesLocation',
          yearMonth: {
            $dateToString: {
              format: '%Y-%m',
              date: '$salesDate',
              timezone: timeZone,
            },
          },
        },
        quantity: { $sum: '$items.quantity' },
      },
    },
  ];

  const rows = await Sale.aggregate(pipeline);
  const salesMonthlyMap = new Map();

  rows.forEach((row) => {
    const productId = row._id.product?.toString();
    const salesLocationId = row._id.salesLocation?.toString();
    const yearMonth = row._id.yearMonth;
    if (!productId || !salesLocationId || !yearMonth) return;

    const mapKey = `${productId}-${salesLocationId}-${yearMonth}`;
    salesMonthlyMap.set(mapKey, (salesMonthlyMap.get(mapKey) || 0) + row.quantity);
  });

  return salesMonthlyMap;
}

async function aggregateReplenishSalesDaily({
  productIds,
  dayStart,
  dayEnd,
  locationId = null,
}) {
  if (!productIds.length) {
    return new Map();
  }

  const locationObjectId = locationId
    ? new mongoose.Types.ObjectId(locationId)
    : null;

  const pipeline = [
    {
      $match: {
        'items.product': { $in: productIds },
        salesDate: { $gte: dayStart, $lte: dayEnd },
        salesLocation: { $exists: true, $ne: null },
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    {
      $lookup: {
        from: 'saleslocations',
        localField: 'salesLocation',
        foreignField: '_id',
        as: 'salesLocDoc',
      },
    },
    { $unwind: '$salesLocDoc' },
    {
      $match: {
        'salesLocDoc.location': { $exists: true, $ne: null },
        ...(locationObjectId ? { 'salesLocDoc.location': locationObjectId } : {}),
      },
    },
    {
      $group: {
        _id: {
          product: '$items.product',
          salesLocation: '$salesLocation',
        },
        quantity: { $sum: '$items.quantity' },
      },
    },
  ];

  const rows = await Sale.aggregate(pipeline);
  const salesDailyMap = new Map();

  rows.forEach((row) => {
    const productId = row._id.product?.toString();
    const salesLocationId = row._id.salesLocation?.toString();
    if (!productId || !salesLocationId) return;

    const mapKey = `${productId}-${salesLocationId}`;
    salesDailyMap.set(mapKey, (salesDailyMap.get(mapKey) || 0) + row.quantity);
  });

  return salesDailyMap;
}

module.exports = {
  buildCurrentMonthBucket,
  buildReplenishMonthBuckets,
  aggregateReplenishSalesMonthly,
  aggregateReplenishSalesDaily,
};
