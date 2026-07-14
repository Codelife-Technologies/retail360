const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const logger = require('../utils/logger');
const { exportToExcel, exportMultiSheetExcel } = require('../utils/excelGenerator');
const {
  buildReplenishMonthBuckets,
  aggregateReplenishSalesMonthly,
  aggregateReplenishSalesDaily,
} = require('../utils/replenishReportUtils');

/** Calendar month grouping for sales reports (aligns with dashboard date ranges). */
const SALES_REPORT_TIMEZONE = process.env.SALES_REPORT_TIMEZONE || 'Asia/Kolkata';

// Helper function to build date query
function buildDateQuery(startDate, endDate) {
  const query = {};
  if (startDate || endDate) {
    query.$gte = startDate ? new Date(startDate) : new Date(0);
    query.$lte = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
  }
  return Object.keys(query).length > 0 ? query : null;
}

function toDateInputStr(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function computeSaleStats(sales = []) {
  const totalSales = sales.length;
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalItemsSold = sales.reduce(
    (sum, s) => sum + s.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
    0
  );
  const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
  return {
    totalSales,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalItemsSold,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
  };
}

function computeBusinessReportStats(sales = []) {
  let unitsOrdered = 0;
  let totalOrderItems = 0;
  let orderedProductSales = 0;

  sales.forEach((sale) => {
    orderedProductSales += sale.total || 0;
    (sale.items || []).forEach((item) => {
      unitsOrdered += item.quantity || 0;
      totalOrderItems += 1;
    });
  });

  orderedProductSales = Math.round(orderedProductSales * 100) / 100;
  const avgSalesPerOrderItem = totalOrderItems > 0
    ? Math.round((orderedProductSales / totalOrderItems) * 100) / 100
    : 0;
  const avgUnitsPerOrderItem = totalOrderItems > 0
    ? Math.round((unitsOrdered / totalOrderItems) * 100) / 100
    : 0;
  const avgSellingPrice = unitsOrdered > 0
    ? Math.round((orderedProductSales / unitsOrdered) * 100) / 100
    : 0;

  return {
    orderedProductSales,
    unitsOrdered,
    totalOrderItems,
    avgSalesPerOrderItem,
    avgUnitsPerOrderItem,
    avgSellingPrice,
  };
}

function getBusinessReportBucketKey(dateValue, groupBy) {
  const date = new Date(dateValue);
  if (groupBy === 'week') {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    return toDateInputStr(startOfDay(weekStart));
  }
  if (groupBy === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return toDateInputStr(startOfDay(date));
}

function formatBusinessReportLabel(bucketKey, groupBy) {
  if (groupBy === 'month') {
    const [year, month] = bucketKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  const [y, m, d] = bucketKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (groupBy === 'week') {
    return `Week of ${date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}`;
  }
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function buildBusinessReportBucketKeys(rangeStart, rangeEnd, groupBy) {
  const keys = [];
  const cursor = startOfDay(new Date(rangeStart));
  const end = startOfDay(new Date(rangeEnd));

  if (groupBy === 'month') {
    cursor.setDate(1);
    while (cursor <= end) {
      keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  if (groupBy === 'week') {
    cursor.setDate(cursor.getDate() - cursor.getDay());
    while (cursor <= end) {
      keys.push(toDateInputStr(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return keys;
  }

  while (cursor <= end) {
    keys.push(toDateInputStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function buildBusinessReport(sales, rangeStart, rangeEnd, groupBy = 'day') {
  const normalizedGroupBy = ['day', 'week', 'month'].includes(groupBy) ? groupBy : 'day';
  const bucketKeys = buildBusinessReportBucketKeys(rangeStart, rangeEnd, normalizedGroupBy);
  const buckets = Object.fromEntries(bucketKeys.map((key) => [key, []]));

  filterSalesInRange(sales, rangeStart, rangeEnd).forEach((sale) => {
    const key = getBusinessReportBucketKey(sale.salesDate, normalizedGroupBy);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(sale);
  });

  return bucketKeys
    .slice()
    .reverse()
    .map((key) => ({
      periodKey: key,
      date: formatBusinessReportLabel(key, normalizedGroupBy),
      ...computeBusinessReportStats(buckets[key] || []),
    }));
}

function filterSalesInRange(sales, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return sales.filter((sale) => {
    const t = new Date(sale.salesDate).getTime();
    return t >= startMs && t <= endMs;
  });
}

function buildOverviewRanges(now) {
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  return { weekStart, monthStart, yearStart };
}

function resolvePeriodRange(period, customStart, customEnd) {
  const now = new Date();
  switch (period) {
    case 'day':
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        label: 'Today',
      };
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return {
        start: startOfDay(start),
        end: endOfDay(now),
        label: 'This Week',
      };
    }
    case 'fortnight': {
      const start = new Date(now);
      start.setDate(now.getDate() - 13);
      return {
        start: startOfDay(start),
        end: endOfDay(now),
        label: 'Last 14 Days',
      };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: startOfDay(start),
        end: endOfDay(now),
        label: 'This Month',
      };
    }
    case 'custom': {
      if (customStart && !customEnd) {
        const day = startOfDay(new Date(customStart));
        return {
          start: day,
          end: endOfDay(day),
          label: toDateInputStr(day),
        };
      }
      const start = customStart ? startOfDay(new Date(customStart)) : startOfDay(now);
      const end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
      const label = customStart && customEnd
        ? `${toDateInputStr(start)} – ${toDateInputStr(end)}`
        : 'Custom Range';
      return { start, end, label };
    }
    case 'allTime':
    case 'all-time': {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        start: startOfDay(start),
        end: endOfDay(now),
        label: 'This Year',
      };
    }
    default:
      return resolvePeriodRange('month');
  }
}

function resolvePreviousRange(start, end, period) {
  if (period === 'allTime' || period === 'all-time') {
    const year = start.getFullYear();
    const prevYearStart = new Date(year - 1, 0, 1);
    const prevYearEnd = endOfDay(new Date(year - 1, end.getMonth(), end.getDate()));
    return {
      start: startOfDay(prevYearStart),
      end: prevYearEnd,
    };
  }

  if (period === 'day') {
    const yesterday = new Date(start);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      start: startOfDay(yesterday),
      end: endOfDay(yesterday),
    };
  }

  const ref = new Date(end);
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const prevMonthStart = new Date(year, month - 1, 1);
  const prevMonthEnd = endOfDay(new Date(year, month, 0));
  return {
    start: startOfDay(prevMonthStart),
    end: prevMonthEnd,
  };
}

function subtractCalendarMonth(date) {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return startOfDay(d);
}

function salesTotalsByDateKey(sales) {
  const map = {};
  sales.forEach((sale) => {
    const key = toDateInputStr(startOfDay(new Date(sale.salesDate)));
    if (!map[key]) map[key] = { revenue: 0, orders: 0 };
    map[key].revenue += sale.total || 0;
    map[key].orders += 1;
  });
  return map;
}

function salesTotalsByHourKey(sales, dayStart) {
  const map = {};
  const dayKey = toDateInputStr(startOfDay(dayStart));
  sales.forEach((sale) => {
    const saleDate = new Date(sale.salesDate);
    if (toDateInputStr(startOfDay(saleDate)) !== dayKey) return;
    const hour = saleDate.getHours();
    if (!map[hour]) map[hour] = { revenue: 0, orders: 0 };
    map[hour].revenue += sale.total || 0;
    map[hour].orders += 1;
  });
  return map;
}

function dateForBucketIndex(index, rangeStart, timeline) {
  const start = new Date(rangeStart);
  switch (timeline) {
    case 'hour':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate(), index, 0, 0, 0);
    case 'day': {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return startOfDay(d);
    }
    case 'week': {
      const d = new Date(start);
      d.setDate(start.getDate() + index * 7);
      return startOfDay(d);
    }
    case 'fortnight': {
      const d = new Date(start);
      d.setDate(start.getDate() + index * 14);
      return startOfDay(d);
    }
    case 'month':
      return startOfDay(new Date(start.getFullYear(), start.getMonth() + index, 1));
    default: {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return startOfDay(d);
    }
  }
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

const CHART_TIMELINE_LABELS = {
  auto: 'Auto',
  hour: 'Hourly',
  day: 'Daily',
  week: 'Weekly',
  fortnight: 'Fortnight',
  month: 'Monthly',
};

function resolveChartTimeline(period, currentRange, requestedTimeline) {
  if (requestedTimeline && requestedTimeline !== 'auto' && CHART_TIMELINE_LABELS[requestedTimeline]) {
    return requestedTimeline;
  }

  if (period === 'day') {
    const dayCount =
      Math.floor((currentRange.end.getTime() - currentRange.start.getTime()) / 86400000) + 1;
    if (dayCount <= 1) return 'hour';
  }

  const dayCount =
    Math.floor((currentRange.end.getTime() - currentRange.start.getTime()) / 86400000) + 1;

  if (dayCount <= 1) return 'hour';
  if (dayCount <= 14) return 'day';
  if (dayCount <= 45) return 'week';
  if (dayCount <= 120) return 'fortnight';
  return 'month';
}

function bucketIndexForDate(date, rangeStart, timeline) {
  if (timeline === 'hour') {
    return new Date(date).getHours();
  }

  const start = startOfDay(rangeStart);
  const dayOffset = Math.floor((startOfDay(date).getTime() - start.getTime()) / 86400000);

  switch (timeline) {
    case 'day':
      return dayOffset;
    case 'week':
      return Math.floor(dayOffset / 7);
    case 'fortnight':
      return Math.floor(dayOffset / 14);
    case 'month': {
      const d = new Date(date);
      return (d.getFullYear() - rangeStart.getFullYear()) * 12 + (d.getMonth() - rangeStart.getMonth());
    }
    default:
      return dayOffset;
  }
}

function maxBucketIndex(rangeStart, rangeEnd, timeline) {
  if (timeline === 'hour') return 23;

  const dayCount =
    Math.floor((startOfDay(rangeEnd).getTime() - startOfDay(rangeStart).getTime()) / 86400000);

  switch (timeline) {
    case 'day':
      return dayCount;
    case 'week':
      return Math.floor(dayCount / 7);
    case 'fortnight':
      return Math.floor(dayCount / 14);
    case 'month': {
      const end = new Date(rangeEnd);
      const start = new Date(rangeStart);
      return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    }
    default:
      return dayCount;
  }
}

function labelForBucket(index, rangeStart, timeline) {
  switch (timeline) {
    case 'hour':
      return `${String(index).padStart(2, '0')}:00`;
    case 'day': {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + index);
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    case 'week': {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + index * 7);
      return `Wk ${index + 1} · ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    }
    case 'fortnight': {
      const d = new Date(rangeStart);
      d.setDate(rangeStart.getDate() + index * 14);
      return `Fn ${index + 1} · ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
    }
    case 'month': {
      const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1);
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
    default:
      return `Bucket ${index + 1}`;
  }
}

function buildIndexedComparison(
  timeline,
  currentSales,
  previousSales,
  currentRange,
  previousRange,
  { period = 'month', allSales = [] } = {}
) {
  const usePreviousMonthAlignment =
    period !== 'day' && period !== 'allTime' && period !== 'all-time';
  const salesForLookup = allSales.length ? allSales : [...currentSales, ...previousSales];

  if (usePreviousMonthAlignment) {
    const byDate = salesTotalsByDateKey(salesForLookup);
    const maxIndex = maxBucketIndex(currentRange.start, currentRange.end, timeline);

    return Array.from({ length: maxIndex + 1 }, (_, index) => {
      const bucketDate = dateForBucketIndex(index, currentRange.start, timeline);
      const compareDate = subtractCalendarMonth(bucketDate);
      const curKey = toDateInputStr(startOfDay(bucketDate));
      const prevKey = toDateInputStr(compareDate);
      const cur = byDate[curKey] || { revenue: 0, orders: 0 };
      const prev = byDate[prevKey] || { revenue: 0, orders: 0 };
      return {
        label: labelForBucket(index, currentRange.start, timeline),
        currentRevenue: Math.round(cur.revenue * 100) / 100,
        previousRevenue: Math.round(prev.revenue * 100) / 100,
        currentOrders: cur.orders,
        previousOrders: prev.orders,
      };
    });
  }

  if (period === 'day' && timeline === 'hour') {
    const currentByHour = salesTotalsByHourKey(currentSales, currentRange.start);
    const previousByHour = salesTotalsByHourKey(previousSales, previousRange.start);
    const maxIndex = maxBucketIndex(currentRange.start, currentRange.end, timeline);

    return Array.from({ length: maxIndex + 1 }, (_, index) => {
      const cur = currentByHour[index] || { revenue: 0, orders: 0 };
      const prev = previousByHour[index] || { revenue: 0, orders: 0 };
      return {
        label: labelForBucket(index, currentRange.start, timeline),
        currentRevenue: Math.round(cur.revenue * 100) / 100,
        previousRevenue: Math.round(prev.revenue * 100) / 100,
        currentOrders: cur.orders,
        previousOrders: prev.orders,
      };
    });
  }

  const currentAgg = {};
  const previousAgg = {};

  currentSales.forEach((sale) => {
    const idx = bucketIndexForDate(sale.salesDate, currentRange.start, timeline);
    if (!currentAgg[idx]) currentAgg[idx] = { revenue: 0, orders: 0 };
    currentAgg[idx].revenue += sale.total || 0;
    currentAgg[idx].orders += 1;
  });

  previousSales.forEach((sale) => {
    const idx = bucketIndexForDate(sale.salesDate, previousRange.start, timeline);
    if (!previousAgg[idx]) previousAgg[idx] = { revenue: 0, orders: 0 };
    previousAgg[idx].revenue += sale.total || 0;
    previousAgg[idx].orders += 1;
  });

  const maxIndex = maxBucketIndex(currentRange.start, currentRange.end, timeline);

  return Array.from({ length: maxIndex + 1 }, (_, index) => {
    const cur = currentAgg[index] || { revenue: 0, orders: 0 };
    const prev = previousAgg[index] || { revenue: 0, orders: 0 };
    return {
      label: labelForBucket(index, currentRange.start, timeline),
      currentRevenue: Math.round(cur.revenue * 100) / 100,
      previousRevenue: Math.round(prev.revenue * 100) / 100,
      currentOrders: cur.orders,
      previousOrders: prev.orders,
    };
  });
}

function buildComparisonChart(period, currentSales, previousSales, currentRange, previousRange, requestedTimeline, allSales = []) {
  const timeline = resolveChartTimeline(period, currentRange, requestedTimeline);
  const chart = buildIndexedComparison(
    timeline,
    currentSales,
    previousSales,
    currentRange,
    previousRange,
    { period, allSales }
  );
  return { timeline, chart };
}

function buildChannelBreakdown(sales) {
  const channelMap = {};
  sales.forEach((sale) => {
    const channelId = sale.salesChannel?._id || sale.salesChannel || 'unknown';
    const name = sale.salesChannel?.name || 'Unknown Channel';
    if (!channelMap[channelId]) {
      channelMap[channelId] = { name, revenue: 0, orders: 0 };
    }
    channelMap[channelId].revenue += sale.total || 0;
    channelMap[channelId].orders += 1;
  });

  return Object.values(channelMap)
    .map((row) => ({
      ...row,
      revenue: Math.round(row.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Previous month + the 3 calendar months before it (excludes current month). */
function buildMonthBuckets() {
  return buildReplenishMonthBuckets(SALES_REPORT_TIMEZONE);
}

/** Bucket indices for the combined past-3-months sold column (excludes current month). */
function getPastThreeMonthBucketIndices() {
  return [0, 1, 2];
}

function sumPastThreeMonthsSales(salesByMonth, monthBuckets) {
  return getPastThreeMonthBucketIndices().reduce(
    (sum, idx) => sum + (salesByMonth[monthBuckets[idx]?.key] || 0),
    0
  );
}

function highestMonthlySaleInPastThreeMonths(salesByMonth, monthBuckets) {
  return getPastThreeMonthBucketIndices().reduce(
    (max, idx) => Math.max(max, salesByMonth[monthBuckets[idx]?.key] || 0),
    0
  );
}

function computeSuggestedReorderQty(lastMonthSales, pastThreeMonthsSales) {
  const avgThreeMonthsSales = pastThreeMonthsSales / 3;
  return Math.max(lastMonthSales, Math.ceil(avgThreeMonthsSales));
}

function parseSpecificDate(specificDate) {
  if (!specificDate || !/^\d{4}-\d{2}-\d{2}$/.test(specificDate)) return null;
  const start = new Date(`${specificDate}T00:00:00.000`);
  const end = new Date(`${specificDate}T23:59:59.999`);
  if (Number.isNaN(start.getTime())) return null;
  return {
    key: specificDate,
    start,
    end,
    label: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildProductRow(
  product,
  displayLocation,
  salesLocationId,
  warehouseLocationId,
  stockRec,
  monthBuckets,
  salesMonthlyMap,
  salesDailyMap = null,
  homeInventory = null
) {
  const productIdStr = product._id.toString();
  const salesLocationIdStr = salesLocationId.toString();
  const warehouseLocationIdStr = warehouseLocationId.toString();

  const currentStock = stockRec?.quantity || 0;
  const reservedStock = stockRec?.reservedQuantity || 0;
  const availableStock = Math.max(0, currentStock - reservedStock);
  const minStock = stockRec?.minStockLevel || 0;

  let status = 'OK';
  if (currentStock <= minStock) {
    status = 'REORDER';
  } else if (minStock > 0 && currentStock <= minStock * 1.5) {
    status = 'LOW';
  }

  const salesByMonth = {};
  monthBuckets.forEach((bucket) => {
    const mapKey = `${productIdStr}-${salesLocationIdStr}-${bucket.key}`;
    salesByMonth[bucket.key] = salesMonthlyMap.get(mapKey) || 0;
  });

  const lastMonthSales = salesByMonth[monthBuckets[0].key] || 0;
  const pastThreeMonthsSales = sumPastThreeMonthsSales(salesByMonth, monthBuckets);
  const highestMonthlySale = highestMonthlySaleInPastThreeMonths(salesByMonth, monthBuckets);
  const requiredStockNextMonth = Math.max(0, highestMonthlySale - availableStock);

  let suggestedReorder = 0;
  if (status === 'REORDER' || status === 'LOW') {
    suggestedReorder = computeSuggestedReorderQty(lastMonthSales, pastThreeMonthsSales);
  }

  const salesOnDate = salesDailyMap
    ? salesDailyMap.get(`${productIdStr}-${salesLocationIdStr}`) || 0
    : undefined;
  const homeAvailableStock = homeInventory?.availableStock ?? 0;

  return {
    location: displayLocation,
    warehouseLocationId: warehouseLocationIdStr,
    salesLocationId: salesLocationIdStr,
    product: {
      _id: product._id,
      sku: product.sku || '',
      title: product.title || product.name || 'Unnamed Product',
      category: product.category,
      subCategory: product.subCategory,
    },
    inventory: {
      currentStock,
      reservedStock,
      availableStock,
      minStock,
    },
    salesByMonth,
    salesCurrent: lastMonthSales,
    homeAvailableStock,
    salesPastThreeMonths: pastThreeMonthsSales,
    highestMonthlySale,
    requiredStockNextMonth,
    ...(salesOnDate !== undefined ? { salesOnDate } : {}),
    replenishStatus: status,
    suggestedReorder,
    ...(homeInventory ? { homeInventory } : {}),
  };
}

function computeAvailableStock(stockRec) {
  if (!stockRec) return 0;
  return Math.max(0, (stockRec.quantity || 0) - (stockRec.reservedQuantity || 0));
}

function buildHomeInventoryForProduct(productIdStr, homeLocation, homeStockByProduct) {
  if (!homeLocation) return null;
  return {
    availableStock: homeStockByProduct.get(productIdStr) ?? 0,
    locationName: homeLocation.name,
    locationCode: homeLocation.code,
  };
}

function applyHomeRefillAllocation(rows, homeLocation, homeStockByProduct) {
  const depletableHome = new Map(homeStockByProduct);
  const homeLocId = homeLocation?._id?.toString();

  rows.forEach((item) => {
    const need = item.suggestedReorder || 0;
    if (need <= 0) {
      item.refillQty = 0;
      item.reorderQty = 0;
      return;
    }

    if (homeLocId && item.location._id.toString() === homeLocId) {
      item.refillQty = 0;
      item.reorderQty = need;
      return;
    }

    const productId = item.product._id.toString();
    const homeAvail = depletableHome.get(productId) ?? 0;
    const refill = Math.min(need, homeAvail);
    item.refillQty = refill;
    item.reorderQty = need - refill;
    depletableHome.set(productId, Math.max(0, homeAvail - refill));
  });
}

// Helper function to group data
function groupData(data, groupBy, dateField = 'salesDate', isSales = true) {
  const grouped = {};
  
  data.forEach(item => {
    let key;
    let displayName;
    const date = new Date(item[dateField]);
    
    switch (groupBy) {
      case 'date':
        key = date.toISOString().split('T')[0];
        displayName = key;
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        displayName = `Week of ${key}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        displayName = key;
        break;
      case 'product':
        item.items.forEach(itemLine => {
          const productId = itemLine.product?._id || itemLine.product;
          const productName = itemLine.product?.name || itemLine.product?.title || 'Unknown';
          if (!grouped[productId]) {
            grouped[productId] = {
              group: productName,
              count: 0,
              revenue: 0,
              itemsSold: 0,
              product: itemLine.product
            };
          }
          grouped[productId].count += 1;
          grouped[productId].revenue += itemLine.total || 0;
          grouped[productId].itemsSold += itemLine.quantity || 0;
        });
        return; // Skip the main grouping for product
      case 'channel':
        if (isSales) {
          key = item.salesChannel?._id || item.salesChannel || 'unknown';
          displayName = item.salesChannel?.name || 'Unknown Channel';
        } else {
          return; // Channel not applicable for purchases
        }
        break;
      case 'location':
        if (isSales) {
          key = item.salesLocation?._id || item.salesLocation || 'unknown';
          displayName = item.salesLocation?.name || 'Unknown Location';
        } else {
          key = item.location?._id || item.location || 'unknown';
          displayName = item.location?.name || 'Unknown Location';
        }
        break;
      case 'supplier':
        if (!isSales) {
          key = item.supplier?._id || item.supplier || 'unknown';
          displayName = item.supplier?.name || 'Unknown Supplier';
        } else {
          return; // Supplier not applicable for sales
        }
        break;
      default:
        key = 'all';
        displayName = 'All';
    }
    
    if (groupBy !== 'product' && (groupBy !== 'channel' || isSales) && (groupBy !== 'supplier' || !isSales)) {
      if (!grouped[key]) {
        grouped[key] = {
          group: displayName || key,
          count: 0,
          revenue: 0, // This will be expenditure for purchases, but keeping name for consistency
          itemsSold: 0
        };
      }
      grouped[key].count += 1;
      grouped[key].revenue += (item.total || 0);
      grouped[key].itemsSold += item.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    }
  });
  
  return Object.values(grouped);
}

function buildSaleFilterQuery(query = {}) {
  const { startDate, endDate, salesChannel, salesLocation, paymentStatus, orderStatus } = query;
  const saleMatch = {};

  if (salesChannel) {
    saleMatch.salesChannel = new mongoose.Types.ObjectId(salesChannel);
  }
  if (salesLocation) {
    saleMatch.salesLocation = new mongoose.Types.ObjectId(salesLocation);
  }
  if (paymentStatus) saleMatch.paymentStatus = paymentStatus;
  if (orderStatus) saleMatch.orderStatus = orderStatus;

  const dateQuery = buildDateQuery(startDate, endDate);
  if (dateQuery) saleMatch.salesDate = dateQuery;

  return saleMatch;
}

function resolveMongoSalesSort(sortBy = 'salesDate', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  const allowed = {
    salesDate: { salesDate: dir },
    date: { salesDate: dir },
    total: { total: dir },
    salesNumber: { salesNumber: dir },
  };
  return allowed[sortBy] || { salesDate: dir };
}

function sortSalesRecords(sales, sortBy = 'salesDate', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...sales].sort((a, b) => {
    if (sortBy === 'channel') {
      const aName = (a.salesChannel?.name || '').toLowerCase();
      const bName = (b.salesChannel?.name || '').toLowerCase();
      return aName.localeCompare(bName) * dir;
    }
    if (sortBy === 'salesDate' || sortBy === 'date') {
      return (new Date(a.salesDate) - new Date(b.salesDate)) * dir;
    }
    if (sortBy === 'total') {
      return ((a.total || 0) - (b.total || 0)) * dir;
    }
    if (sortBy === 'salesNumber') {
      return String(a.salesNumber || '').localeCompare(String(b.salesNumber || '')) * dir;
    }
    return (new Date(b.salesDate) - new Date(a.salesDate));
  });
}

function sortSkuRows(rows, sortBy = 'revenue', sortDir = 'desc') {
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (sortBy) {
      case 'sku':
        return String(a.sku || '').localeCompare(String(b.sku || '')) * dir;
      case 'productName':
        return String(a.productName || '').localeCompare(String(b.productName || '')) * dir;
      case 'quantity':
        return ((a.totalQuantity || 0) - (b.totalQuantity || 0)) * dir;
      case 'revenue':
      default:
        return ((a.totalRevenue || 0) - (b.totalRevenue || 0)) * dir;
    }
  });
}

function toSellingProductSummary(row) {
  if (!row) return null;
  return {
    productId: row.productId,
    sku: row.sku,
    title: row.title,
    name: row.name,
    productName: row.productName,
    images: row.images || [],
    parentSkuOrAsin: row.parentSkuOrAsin,
    variation: row.variation,
    totalQuantity: row.totalQuantity,
    totalRevenue: row.totalRevenue,
  };
}

function pickSellingExtremes(skuRows) {
  if (!skuRows || skuRows.length === 0) {
    return { topSellingProducts: [], leastSellingProducts: [] };
  }

  const maxQuantity = Math.max(...skuRows.map((row) => row.totalQuantity || 0));
  const minQuantity = Math.min(...skuRows.map((row) => row.totalQuantity || 0));

  const compareTop = (a, b) => {
    if ((b.totalRevenue || 0) !== (a.totalRevenue || 0)) {
      return (b.totalRevenue || 0) - (a.totalRevenue || 0);
    }
    return String(a.productName || '').localeCompare(String(b.productName || ''));
  };

  const compareLeast = (a, b) => {
    if ((a.totalRevenue || 0) !== (b.totalRevenue || 0)) {
      return (a.totalRevenue || 0) - (b.totalRevenue || 0);
    }
    return String(a.productName || '').localeCompare(String(b.productName || ''));
  };

  const topRows = skuRows
    .filter((row) => row.totalQuantity === maxQuantity)
    .sort(compareTop);

  const leastRows =
    maxQuantity === minQuantity
      ? []
      : skuRows.filter((row) => row.totalQuantity === minQuantity).sort(compareLeast);

  return {
    topSellingProducts: topRows.map(toSellingProductSummary),
    leastSellingProducts: leastRows.map(toSellingProductSummary),
  };
}

async function fetchSalesDetailedReport(filters = {}) {
  const query = buildSaleFilterQuery(filters);
  const { sortBy = 'salesDate', sortDir = 'desc', page, limit } = filters;

  if (page || limit) {
    const { paginate } = require('../utils/pagination');
    const mongoSort = resolveMongoSalesSort(
      sortBy === 'channel' ? 'salesDate' : sortBy,
      sortDir
    );
    const result = await paginate(Sale, query, {
      page: page || 1,
      limit: limit || 25,
      sort: mongoSort,
      populate: [
        { path: 'salesChannel', select: 'name code' },
        { path: 'salesLocation', select: 'name code' },
        { path: 'items.product', select: 'name title sku images parentSkuOrAsin variation' },
      ],
    });
    if (sortBy === 'channel') {
      result.data = sortSalesRecords(result.data, sortBy, sortDir);
    }
    return result;
  }

  let sales = await Sale.find(query)
    .populate('salesChannel', 'name code')
    .populate('salesLocation', 'name code')
    .populate('items.product', 'name title sku images parentSkuOrAsin variation')
    .sort(resolveMongoSalesSort(sortBy === 'channel' ? 'salesDate' : sortBy, sortDir))
    .lean();

  sales = sortSalesRecords(sales, sortBy, sortDir);

  const summary = {
    totalSales: sales.length,
    totalRevenue: Math.round(sales.reduce((sum, s) => sum + (s.total || 0), 0) * 100) / 100,
    totalItemsSold: sales.reduce(
      (sum, s) => sum + s.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0
    ),
  };

  return { summary, rows: sales };
}

const PURCHASE_SUMMARY_GROUP_HEADERS = [
  { key: 'group', label: 'Group' },
  { key: 'count', label: 'Count' },
  { key: 'expenditure', label: 'Expenditure' },
  { key: 'itemsPurchased', label: 'Items Purchased' },
];

const PURCHASE_DETAILED_EXPORT_HEADERS = [
  { key: 'purchaseNumber', label: 'Purchase Number' },
  { key: 'purchaseDate', label: 'Date' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'location', label: 'Location' },
  { key: 'items', label: 'Items' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'tax', label: 'Tax' },
  { key: 'total', label: 'Total' },
  { key: 'paymentStatus', label: 'Payment Status' },
];

const DASHBOARD_SUMMARY_HEADERS = [
  { key: 'metric', label: 'Metric' },
  { key: 'current', label: 'Current Period' },
  { key: 'previous', label: 'Previous Period' },
  { key: 'change', label: 'Change %' },
];

const CHANNEL_BREAKDOWN_EXPORT_HEADERS = [
  { key: 'name', label: 'Channel' },
  { key: 'orders', label: 'Orders' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'share', label: 'Share %' },
];

function mapPurchasesToExportRows(purchases = []) {
  return purchases.map((purchase) => ({
    purchaseNumber: purchase.purchaseNumber || '',
    purchaseDate: purchase.purchaseDate ? new Date(purchase.purchaseDate).toISOString().slice(0, 10) : '',
    supplier: purchase.supplier?.name || '',
    location: purchase.location?.name || '',
    items: purchase.items?.length || 0,
    subtotal: purchase.subtotal ?? '',
    tax: purchase.tax ?? '',
    total: purchase.total ?? '',
    paymentStatus: purchase.paymentStatus || '',
  }));
}

function mapPurchaseSummaryGroups(groups = []) {
  return groups.map((group) => ({
    group: group.group,
    count: group.count,
    expenditure: Math.round((group.revenue || 0) * 100) / 100,
    itemsPurchased: group.itemsSold || 0,
  }));
}

function mapChannelBreakdownToExportRows(channelBreakdown = []) {
  const totalRevenue = channelBreakdown.reduce((sum, row) => sum + (row.revenue || 0), 0);
  return channelBreakdown.map((row) => ({
    name: row.name,
    orders: row.orders,
    revenue: row.revenue,
    share: totalRevenue ? Math.round((row.revenue / totalRevenue) * 1000) / 10 : 0,
  }));
}

function buildDashboardSummaryRows(currentPeriod, previousPeriod, change) {
  return [
    {
      metric: 'Ordered product sales',
      current: currentPeriod.totalRevenue,
      previous: previousPeriod.totalRevenue,
      change: change.totalRevenue,
    },
    {
      metric: 'Total orders',
      current: currentPeriod.totalSales,
      previous: previousPeriod.totalSales,
      change: change.totalSales,
    },
    {
      metric: 'Units ordered',
      current: currentPeriod.totalItemsSold,
      previous: previousPeriod.totalItemsSold,
      change: change.totalItemsSold,
    },
    {
      metric: 'Avg sales per order',
      current: currentPeriod.averageOrderValue,
      previous: previousPeriod.averageOrderValue,
      change: change.averageOrderValue,
    },
  ];
}

async function fetchPurchasesForReport(filters = {}) {
  const { startDate, endDate, supplier, location, paymentStatus } = filters;
  const query = {};

  if (supplier) query.supplier = supplier;
  if (location) query.location = location;
  if (paymentStatus) query.paymentStatus = paymentStatus;

  const dateQuery = buildDateQuery(startDate, endDate);
  if (dateQuery) query.purchaseDate = dateQuery;

  return Purchase.find(query)
    .populate('supplier', 'name')
    .populate('location', 'name code')
    .populate('items.product', 'name sku title')
    .sort({ purchaseDate: -1 });
}

const SALES_ORDER_EXPORT_HEADERS = [
  { key: 'productSkus', label: 'Product SKU' },
  { key: 'amazonOrderId', label: 'Amazon Order ID' },
  { key: 'saleDate', label: 'Sale Date' },
  { key: 'channel', label: 'Channel' },
  { key: 'items', label: 'Line Items' },
  { key: 'qtyOrdered', label: 'Qty Ordered' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'total', label: 'Total' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'orderStatus', label: 'Order Status' },
];

const SALES_SKU_EXPORT_HEADERS = [
  { key: 'sku', label: 'SKU' },
  { key: 'productName', label: 'Product Name' },
  { key: 'category', label: 'Category' },
  { key: 'subCategory', label: 'Sub Category' },
  { key: 'hsnCode', label: 'HSN Code' },
  { key: 'totalQuantity', label: 'Qty Sold' },
  { key: 'averageUnitPrice', label: 'Avg Unit Price' },
  { key: 'totalRevenue', label: 'Line Revenue' },
  { key: 'orderCount', label: 'Order Count' },
];

const BUSINESS_REPORT_EXPORT_HEADERS = [
  { key: 'date', label: 'Date' },
  { key: 'orderedProductSales', label: 'Ordered Product Sales' },
  { key: 'unitsOrdered', label: 'Units Ordered' },
  { key: 'totalOrderItems', label: 'Total Order Items' },
  { key: 'avgSalesPerOrderItem', label: 'Average Sales per Order Item' },
  { key: 'avgUnitsPerOrderItem', label: 'Average Units per Order Item' },
  { key: 'avgSellingPrice', label: 'Average Selling Price' },
];

function mapBusinessReportToExportRows(rows = []) {
  return rows.map((row) => ({
    date: row.date,
    orderedProductSales: row.orderedProductSales ?? '',
    unitsOrdered: row.unitsOrdered ?? '',
    totalOrderItems: row.totalOrderItems ?? '',
    avgSalesPerOrderItem: row.avgSalesPerOrderItem ?? '',
    avgUnitsPerOrderItem: row.avgUnitsPerOrderItem ?? '',
    avgSellingPrice: row.avgSellingPrice ?? '',
  }));
}

function mapSalesToExportRows(sales) {
  return sales.map((sale) => {
    const skus = (sale.items || [])
      .map((item) => item.product?.sku || item.sku || '')
      .filter(Boolean);
    const qtyOrdered = (sale.items || []).reduce(
      (sum, item) => sum + (item.quantity || 0),
      0
    );
    return {
      productSkus: [...new Set(skus)].join(', '),
      amazonOrderId: sale.amazonOrderId || '',
      saleDate: sale.salesDate ? new Date(sale.salesDate).toISOString().slice(0, 10) : '',
      channel: sale.salesChannel?.name || '',
      items: sale.items?.length || 0,
      qtyOrdered,
      subtotal: sale.subtotal ?? '',
      total: sale.total ?? '',
      paymentStatus: sale.paymentStatus || '',
      orderStatus: sale.orderStatus || '',
    };
  });
}

async function aggregateSalesBySku(filters = {}) {
  const saleMatch = buildSaleFilterQuery(filters);
  const { search, sortBy = 'revenue', sortDir = 'desc' } = filters;

  const rows = await Sale.aggregate([
    { $match: saleMatch },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    ...(search
      ? [{
          $match: {
            $or: [
              { 'product.sku': { $regex: search, $options: 'i' } },
              { 'product.title': { $regex: search, $options: 'i' } },
              { 'product.name': { $regex: search, $options: 'i' } },
            ],
          },
        }]
      : []),
    {
      $group: {
        _id: '$items.product',
        sku: { $first: '$product.sku' },
        title: { $first: '$product.title' },
        name: { $first: '$product.name' },
        productName: { $first: { $ifNull: ['$product.title', '$product.name'] } },
        images: { $first: '$product.images' },
        parentSkuOrAsin: { $first: '$product.parentSkuOrAsin' },
        variation: { $first: '$product.variation' },
        categoryId: { $first: '$product.category' },
        subCategoryId: { $first: '$product.subCategory' },
        hsnCode: { $first: '$product.hsnCode' },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.total' },
        totalUnitPriceSum: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
        orderIds: { $addToSet: '$_id' },
      },
    },
    {
      $project: {
        productId: '$_id',
        sku: { $ifNull: ['$sku', '—'] },
        title: { $ifNull: ['$title', ''] },
        name: { $ifNull: ['$name', ''] },
        productName: { $ifNull: ['$productName', 'Unknown Product'] },
        images: { $ifNull: ['$images', []] },
        parentSkuOrAsin: { $ifNull: ['$parentSkuOrAsin', ''] },
        variation: { $ifNull: ['$variation', ''] },
        categoryId: 1,
        subCategoryId: 1,
        hsnCode: { $ifNull: ['$hsnCode', ''] },
        totalQuantity: 1,
        totalRevenue: { $round: ['$totalRevenue', 2] },
        averageUnitPrice: {
          $round: [
            {
              $cond: [
                { $gt: ['$totalQuantity', 0] },
                { $divide: ['$totalUnitPriceSum', '$totalQuantity'] },
                0,
              ],
            },
            2,
          ],
        },
        orderCount: { $size: '$orderIds' },
      },
    },
    { $sort: { totalRevenue: -1, totalQuantity: -1 } },
  ]);

  const Category = require('../models/Category');
  const Subcategory = require('../models/Subcategory');

  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))];
  const subCategoryIds = [...new Set(rows.map((r) => r.subCategoryId).filter(Boolean))];

  const [categories, subCategories] = await Promise.all([
    categoryIds.length
      ? Category.find({ _id: { $in: categoryIds } }).select('name').lean()
      : [],
    subCategoryIds.length
      ? Subcategory.find({ _id: { $in: subCategoryIds } }).select('name').lean()
      : [],
  ]);

  const categoryMap = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const subCategoryMap = new Map(subCategories.map((c) => [c._id.toString(), c.name]));

  let skuRows = rows.map((row) => ({
    productId: row.productId,
    sku: row.sku,
    title: row.title,
    name: row.name,
    productName: row.productName,
    images: row.images || [],
    parentSkuOrAsin: row.parentSkuOrAsin,
    variation: row.variation,
    category: categoryMap.get(String(row.categoryId)) || '—',
    subCategory: subCategoryMap.get(String(row.subCategoryId)) || '—',
    hsnCode: row.hsnCode || '—',
    totalQuantity: row.totalQuantity,
    totalRevenue: row.totalRevenue,
    averageUnitPrice: row.averageUnitPrice,
    orderCount: row.orderCount,
  }));

  const { topSellingProducts, leastSellingProducts } = pickSellingExtremes(skuRows);

  skuRows = sortSkuRows(skuRows, sortBy, sortDir);

  const lineItemRevenue = Math.round(
    skuRows.reduce((sum, row) => sum + row.totalRevenue, 0) * 100
  ) / 100;

  const orderSummaryPipeline = [
    { $match: saleMatch },
    ...(search
      ? [
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              localField: 'items.product',
              foreignField: '_id',
              as: 'product',
            },
          },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
          {
            $match: {
              $or: [
                { 'product.sku': { $regex: search, $options: 'i' } },
                { 'product.title': { $regex: search, $options: 'i' } },
                { 'product.name': { $regex: search, $options: 'i' } },
              ],
            },
          },
          {
            $group: {
              _id: '$_id',
              orderTotal: { $first: '$total' },
              lineQuantity: { $sum: '$items.quantity' },
            },
          },
        ]
      : [
          {
            $project: {
              total: 1,
              lineQuantity: {
                $reduce: {
                  input: { $ifNull: ['$items', []] },
                  initialValue: 0,
                  in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
                },
              },
            },
          },
        ]),
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: search ? '$orderTotal' : '$total' },
        totalOrders: { $sum: 1 },
        totalQuantitySold: { $sum: '$lineQuantity' },
      },
    },
  ];

  const [orderSummary = {}] = await Sale.aggregate(orderSummaryPipeline);

  const summary = {
    totalSkus: skuRows.length,
    totalQuantitySold: orderSummary.totalQuantitySold || 0,
    totalRevenue: Math.round((orderSummary.totalRevenue || 0) * 100) / 100,
    totalOrders: orderSummary.totalOrders || 0,
    lineItemRevenue,
    topSellingProducts,
    leastSellingProducts,
  };

  return { summary, rows: skuRows };
}

// GET sales by SKU (aggregated across all sales)
router.get('/sales/by-sku', async (req, res) => {
  try {
    const result = await aggregateSalesBySku(req.query);
    res.json(result);
  } catch (error) {
    logger.backend.error('Error fetching sales by SKU', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET export sales business report as Excel
router.get('/sales/business-report/export', async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation, reportGroupBy = 'day' } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const currentRange = resolvePeriodRange('custom', startDate, endDate);
    const baseQuery = {};
    if (salesChannel) baseQuery.salesChannel = salesChannel;
    if (salesLocation) baseQuery.salesLocation = salesLocation;

    const sales = await Sale.find({
      ...baseQuery,
      salesDate: { $gte: currentRange.start, $lte: currentRange.end },
    })
      .populate('salesChannel', 'name code')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku')
      .sort({ salesDate: -1 });

    const reportRows = buildBusinessReport(
      sales,
      currentRange.start,
      currentRange.end,
      reportGroupBy
    );
    const exportRows = mapBusinessReportToExportRows(reportRows);
    const buffer = exportToExcel(exportRows, BUSINESS_REPORT_EXPORT_HEADERS);
    const filename = `sales_business_report_${startDate}_${endDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting sales business report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET export sales by SKU as Excel
router.get('/sales/by-sku/export', async (req, res) => {
  try {
    const exportFilters = { ...req.query };
    delete exportFilters.view;
    delete exportFilters.search;
    delete exportFilters.sortBy;
    delete exportFilters.sortDir;
    const { rows } = await aggregateSalesBySku(exportFilters);

    const buffer = exportToExcel(rows, SALES_SKU_EXPORT_HEADERS);
    const filename = `sales_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting sales by SKU', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET export sales by order as Excel
router.get('/sales/detailed/export', async (req, res) => {
  try {
    const exportFilters = { ...req.query };
    delete exportFilters.view;
    delete exportFilters.search;
    const { rows: sales } = await fetchSalesDetailedReport(exportFilters);
    const orderRows = mapSalesToExportRows(sales);
    const buffer = exportToExcel(orderRows, SALES_ORDER_EXPORT_HEADERS);
    const filename = `sales_report_by_sale_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting sales detailed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales dashboard (overview + period comparison)
router.get('/sales/dashboard', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate, salesChannel, salesLocation, chartTimeline, reportGroupBy = 'day' } = req.query;
    const currentRange = resolvePeriodRange(period, startDate, endDate);
    const previousRange = resolvePreviousRange(currentRange.start, currentRange.end, period);

    const now = new Date();
    const { weekStart, monthStart, yearStart } = buildOverviewRanges(now);

    const chartLookback = new Date(currentRange.start);
    chartLookback.setMonth(chartLookback.getMonth() - 1);

    const fetchStart = new Date(Math.min(
      previousRange.start.getTime(),
      startOfDay(chartLookback).getTime(),
      startOfDay(now).getTime(),
      startOfDay(weekStart).getTime(),
      startOfDay(monthStart).getTime(),
      startOfDay(yearStart).getTime()
    ));

    const baseQuery = {};
    if (salesChannel) baseQuery.salesChannel = salesChannel;
    if (salesLocation) baseQuery.salesLocation = salesLocation;

    const sales = await Sale.find({
      ...baseQuery,
      salesDate: { $gte: fetchStart },
    })
      .populate('salesChannel', 'name code')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku images parentSkuOrAsin variation')
      .sort({ salesDate: -1 });

    const currentSales = filterSalesInRange(sales, currentRange.start, currentRange.end);
    const previousSales = filterSalesInRange(sales, previousRange.start, previousRange.end);

    const currentPeriod = computeSaleStats(currentSales);
    const previousPeriod = computeSaleStats(previousSales);

    const change = {
      totalSales: pctChange(currentPeriod.totalSales, previousPeriod.totalSales),
      totalRevenue: pctChange(currentPeriod.totalRevenue, previousPeriod.totalRevenue),
      totalItemsSold: pctChange(currentPeriod.totalItemsSold, previousPeriod.totalItemsSold),
      averageOrderValue: pctChange(currentPeriod.averageOrderValue, previousPeriod.averageOrderValue),
    };

    const comparison = buildComparisonChart(
      period,
      currentSales,
      previousSales,
      currentRange,
      previousRange,
      chartTimeline,
      sales
    );

    res.json({
      period,
      periodLabel: currentRange.label,
      chartTimeline: comparison.timeline,
      chartTimelineLabel: CHART_TIMELINE_LABELS[comparison.timeline] || comparison.timeline,
      currentRange: {
        start: toDateInputStr(currentRange.start),
        end: toDateInputStr(currentRange.end),
      },
      previousRange: {
        start: toDateInputStr(previousRange.start),
        end: toDateInputStr(previousRange.end),
      },
      overview: {
        today: computeSaleStats(filterSalesInRange(sales, startOfDay(now), endOfDay(now))),
        thisWeek: computeSaleStats(filterSalesInRange(sales, startOfDay(weekStart), endOfDay(now))),
        thisMonth: computeSaleStats(filterSalesInRange(sales, startOfDay(monthStart), endOfDay(now))),
        thisYear: computeSaleStats(filterSalesInRange(sales, startOfDay(yearStart), endOfDay(now))),
      },
      currentPeriod,
      previousPeriod,
      change,
      comparisonChart: comparison.chart,
      channelBreakdown: buildChannelBreakdown(currentSales),
      businessReport: buildBusinessReport(sales, currentRange.start, currentRange.end, reportGroupBy),
      reportGroupBy: ['day', 'week', 'month'].includes(reportGroupBy) ? reportGroupBy : 'day',
    });
  } catch (error) {
    logger.backend.error('Error fetching sales dashboard', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales summary
router.get('/sales/summary', async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation, paymentStatus, orderStatus, groupBy } = req.query;
    const query = {};
    
    if (salesChannel) query.salesChannel = salesChannel;
    if (salesLocation) query.salesLocation = salesLocation;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (orderStatus) query.orderStatus = orderStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.salesDate = dateQuery;
    
    const sales = await Sale.find(query)
      .populate('salesChannel', 'name code')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku images parentSkuOrAsin variation')
      .sort({ salesDate: -1 });
    
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const totalItemsSold = sales.reduce((sum, s) => 
      sum + s.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    
    const groupedData = groupBy ? groupData(sales, groupBy, 'salesDate', true) : [];
    
    // Calculate statistics
    const productMap = {};
    const channelMap = {};
    const paymentStatusBreakdown = { pending: 0, paid: 0, partial: 0 };
    const orderStatusBreakdown = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
    
    sales.forEach(sale => {
      // Product statistics
      sale.items.forEach(item => {
        const productId = item.product?._id || item.product;
        if (!productMap[productId]) {
          productMap[productId] = {
            product: item.product,
            quantity: 0,
            revenue: 0
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].revenue += item.total || 0;
      });
      
      // Channel statistics
      const channelId = sale.salesChannel?._id || sale.salesChannel;
      if (!channelMap[channelId]) {
        channelMap[channelId] = {
          channel: sale.salesChannel,
          count: 0,
          revenue: 0
        };
      }
      channelMap[channelId].count += 1;
      channelMap[channelId].revenue += sale.total || 0;
      
      // Status breakdowns
      paymentStatusBreakdown[sale.paymentStatus] = (paymentStatusBreakdown[sale.paymentStatus] || 0) + 1;
      orderStatusBreakdown[sale.orderStatus] = (orderStatusBreakdown[sale.orderStatus] || 0) + 1;
    });
    
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    const topChannels = Object.values(channelMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    res.json({
      totalSales,
      totalRevenue,
      averageOrderValue,
      totalItemsSold,
      groupedData,
      statistics: {
        topProducts,
        topChannels,
        paymentStatusBreakdown,
        orderStatusBreakdown
      }
    });
  } catch (error) {
    logger.backend.error('Error fetching sales summary', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales detailed
router.get('/sales/detailed', async (req, res) => {
  try {
    const result = await fetchSalesDetailedReport(req.query);
    if (result.data) {
      res.json(result);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    logger.backend.error('Error fetching sales detailed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales statistics
router.get('/sales/statistics', async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation } = req.query;
    const query = {};
    
    if (salesChannel) query.salesChannel = salesChannel;
    if (salesLocation) query.salesLocation = salesLocation;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.salesDate = dateQuery;
    
    const sales = await Sale.find(query)
      .populate('salesChannel', 'name code')
      .populate('items.product', 'name title sku images parentSkuOrAsin variation');
    
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalSales = sales.length;
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    
    res.json({
      totalRevenue,
      totalSales,
      averageOrderValue
    });
  } catch (error) {
    logger.backend.error('Error fetching sales statistics', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases summary
router.get('/purchases/summary', async (req, res) => {
  try {
    const { startDate, endDate, supplier, location, paymentStatus, groupBy } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name')
      .populate('location', 'name code')
      .populate('items.product', 'name sku')
      .sort({ purchaseDate: -1 });
    
    const totalPurchases = purchases.length;
    const totalExpenditure = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const averagePurchaseValue = totalPurchases > 0 ? totalExpenditure / totalPurchases : 0;
    const totalItemsPurchased = purchases.reduce((sum, p) => 
      sum + p.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    
    const groupedData = groupBy ? groupData(purchases, groupBy, 'purchaseDate', false) : [];
    
    // Calculate statistics
    const productMap = {};
    const supplierMap = {};
    const paymentStatusBreakdown = { pending: 0, paid: 0, partial: 0 };
    
    purchases.forEach(purchase => {
      // Product statistics
      purchase.items.forEach(item => {
        const productId = item.product?._id || item.product;
        if (!productMap[productId]) {
          productMap[productId] = {
            product: item.product,
            quantity: 0,
            expenditure: 0
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].expenditure += item.total || 0;
      });
      
      // Supplier statistics
      const supplierId = purchase.supplier?._id || purchase.supplier;
      if (!supplierMap[supplierId]) {
        supplierMap[supplierId] = {
          supplier: purchase.supplier,
          count: 0,
          expenditure: 0
        };
      }
      supplierMap[supplierId].count += 1;
      supplierMap[supplierId].expenditure += purchase.total || 0;
      
      // Status breakdown
      paymentStatusBreakdown[purchase.paymentStatus] = (paymentStatusBreakdown[purchase.paymentStatus] || 0) + 1;
    });
    
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.expenditure - a.expenditure)
      .slice(0, 10);
    
    const topSuppliers = Object.values(supplierMap)
      .sort((a, b) => b.expenditure - a.expenditure)
      .slice(0, 10);
    
    res.json({
      totalPurchases,
      totalExpenditure,
      averagePurchaseValue,
      totalItemsPurchased,
      groupedData,
      statistics: {
        topProducts,
        topSuppliers,
        paymentStatusBreakdown
      }
    });
  } catch (error) {
    logger.backend.error('Error fetching purchases summary', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases detailed
router.get('/purchases/detailed', async (req, res) => {
  try {
    const { startDate, endDate, supplier, location, paymentStatus } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name')
      .populate('location', 'name code')
      .populate('items.product', 'name sku')
      .sort({ purchaseDate: -1 });
    
    res.json(purchases);
  } catch (error) {
    logger.backend.error('Error fetching purchases detailed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases statistics
router.get('/purchases/statistics', async (req, res) => {
  try {
    const { startDate, endDate, supplier, location } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name');
    
    const totalExpenditure = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalPurchases = purchases.length;
    const averagePurchaseValue = totalPurchases > 0 ? totalExpenditure / totalPurchases : 0;
    
    res.json({
      totalExpenditure,
      totalPurchases,
      averagePurchaseValue
    });
  } catch (error) {
    logger.backend.error('Error fetching purchases statistics', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST export sales report (placeholder - actual export implementation would require additional libraries)
router.post('/sales/export', async (req, res) => {
  try {
    const { format, filters, view } = req.body;
    // This is a placeholder - actual PDF/Excel export would be implemented here
    res.json({ message: 'Export functionality will be implemented', format, view });
  } catch (error) {
    logger.backend.error('Error exporting sales report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET export sales dashboard as Excel
router.get('/sales/dashboard/export', async (req, res) => {
  try {
    const { period = 'month', startDate, endDate, salesChannel, salesLocation } = req.query;
    const currentRange = resolvePeriodRange(period, startDate, endDate);
    const previousRange = resolvePreviousRange(currentRange.start, currentRange.end, period);

    const baseQuery = {};
    if (salesChannel) baseQuery.salesChannel = salesChannel;
    if (salesLocation) baseQuery.salesLocation = salesLocation;

    const sales = await Sale.find({
      ...baseQuery,
      salesDate: { $gte: previousRange.start, $lte: currentRange.end },
    })
      .populate('salesChannel', 'name code')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku images parentSkuOrAsin variation')
      .sort({ salesDate: -1 });

    const currentSales = filterSalesInRange(sales, currentRange.start, currentRange.end);
    const previousSales = filterSalesInRange(sales, previousRange.start, previousRange.end);
    const currentPeriod = computeSaleStats(currentSales);
    const previousPeriod = computeSaleStats(previousSales);
    const change = {
      totalSales: pctChange(currentPeriod.totalSales, previousPeriod.totalSales),
      totalRevenue: pctChange(currentPeriod.totalRevenue, previousPeriod.totalRevenue),
      totalItemsSold: pctChange(currentPeriod.totalItemsSold, previousPeriod.totalItemsSold),
      averageOrderValue: pctChange(currentPeriod.averageOrderValue, previousPeriod.averageOrderValue),
    };

    const channelBreakdown = buildChannelBreakdown(currentSales);
    const recordFilters = {
      startDate: toDateInputStr(currentRange.start),
      endDate: toDateInputStr(currentRange.end),
      salesChannel,
      salesLocation,
    };
    const { rows: orderRows } = await fetchSalesDetailedReport(recordFilters);

    const buffer = exportMultiSheetExcel([
      {
        name: 'Summary',
        headers: DASHBOARD_SUMMARY_HEADERS,
        data: buildDashboardSummaryRows(currentPeriod, previousPeriod, change),
      },
      {
        name: 'Channel Revenue',
        headers: CHANNEL_BREAKDOWN_EXPORT_HEADERS,
        data: mapChannelBreakdownToExportRows(channelBreakdown),
      },
      {
        name: 'Sales Records',
        headers: SALES_ORDER_EXPORT_HEADERS,
        data: mapSalesToExportRows(orderRows),
      },
    ]);

    const rangeLabel = `${toDateInputStr(currentRange.start)}_${toDateInputStr(currentRange.end)}`;
    const filename = `sales_dashboard_${rangeLabel}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting sales dashboard', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET export purchases report as Excel
router.get('/purchases/export', async (req, res) => {
  try {
    const { view = 'summary', groupBy = 'date', ...filters } = req.query;
    const purchases = await fetchPurchasesForReport(filters);

    if (view === 'detailed') {
      const buffer = exportToExcel(
        mapPurchasesToExportRows(purchases),
        PURCHASE_DETAILED_EXPORT_HEADERS
      );
      const filename = `purchase_report_detailed_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      return res.send(buffer);
    }

    const totalPurchases = purchases.length;
    const totalExpenditure = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const averagePurchaseValue = totalPurchases > 0 ? totalExpenditure / totalPurchases : 0;
    const totalItemsPurchased = purchases.reduce(
      (sum, p) => sum + p.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0),
      0
    );
    const groupedData = groupBy ? groupData(purchases, groupBy, 'purchaseDate', false) : [];

    const buffer = exportMultiSheetExcel([
      {
        name: 'Overview',
        headers: [
          { key: 'metric', label: 'Metric' },
          { key: 'value', label: 'Value' },
        ],
        data: [
          { metric: 'Total Purchases', value: totalPurchases },
          { metric: 'Total Expenditure', value: Math.round(totalExpenditure * 100) / 100 },
          { metric: 'Average Purchase Value', value: Math.round(averagePurchaseValue * 100) / 100 },
          { metric: 'Total Items Purchased', value: totalItemsPurchased },
        ],
      },
      {
        name: 'Grouped Data',
        headers: PURCHASE_SUMMARY_GROUP_HEADERS,
        data: mapPurchaseSummaryGroups(groupedData),
      },
      {
        name: 'Purchase Details',
        headers: PURCHASE_DETAILED_EXPORT_HEADERS,
        data: mapPurchasesToExportRows(purchases),
      },
    ]);

    const filename = `purchase_report_summary_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting purchases report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET replenishment report
async function buildReplenishReportData(query = {}) {
  const { category, subCategory, location, specificDate } = query;
    
    const productMatch = {};
    if (category) productMatch.category = category;
    if (subCategory) productMatch.subCategory = subCategory;
    
    const Product = require('../models/Product');
    const Stock = require('../models/Stock');
    const Location = require('../models/Location');
    const SalesLocation = require('../models/SalesLocation');
    const mongoose = require('mongoose');
    const monthBuckets = buildMonthBuckets();
    const specificDay = parseSpecificDate(specificDate);
    const dateWindow = {
      min: formatDateKey(monthBuckets[3].start),
      max: formatDateKey(monthBuckets[0].end),
    };
    
    const products = await Product.find(productMatch)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .sort({ name: 1 });
      
    const productIds = products.map(p => p._id);
    if (productIds.length === 0) {
      return {
        summary: {
          totalProducts: 0, reorderCount: 0, restockRequiredNextMonthQty: 0,
          unitsSoldCurrentMonth: 0, unitsSoldPastThreeMonths: 0,
          ...(specificDay ? { unitsSoldOnDate: 0 } : {}),
        },
        monthLabels: {
          current: monthBuckets[0].label,
          pastThreeMonths: `${monthBuckets[2].label} – ${monthBuckets[0].label}`,
        },
        monthKeys: monthBuckets.map((b) => b.key),
        dateWindow,
        specificDate: specificDay ? { value: specificDay.key, label: specificDay.label } : null,
        products: [],
        groupedByLocation: [],
      };
    }

    // 4. Sales locations to report on (sold qty per marketplace; stock from linked warehouse)
    const salesLocationFilter = { isActive: true };
    if (location) {
      salesLocationFilter.location = new mongoose.Types.ObjectId(location);
    }
    const salesLocations = await SalesLocation.find(salesLocationFilter)
      .populate('location', 'name code city country isActive')
      .sort({ name: 1 })
      .lean();

    // 5. Stock per product + warehouse location
    const stockMatch = { product: { $in: productIds } };
    if (location) {
      stockMatch.location = new mongoose.Types.ObjectId(location);
    }
    const stockRecords = await Stock.find(stockMatch).lean();
    const stockMap = new Map(
      stockRecords.map((s) => [`${s.product.toString()}-${s.location.toString()}`, s])
    );

    const homeLocation =
      (await Location.findOne({ isHomeBranch: true }).lean()) ||
      (await Location.findOne({ code: /^NOIDA63$/i }).lean());

    const homeStockByProduct = new Map();
    if (homeLocation) {
      const homeStockRecords = await Stock.find({
        product: { $in: productIds },
        location: homeLocation._id,
      }).lean();
      homeStockRecords.forEach((s) => {
        homeStockByProduct.set(s.product.toString(), computeAvailableStock(s));
      });
    }

    // 6. Monthly sales per product + warehouse location (via salesLocation mapping)
    const salesMonthlyMap = await aggregateReplenishSalesMonthly({
      productIds,
      monthBuckets,
      timeZone: SALES_REPORT_TIMEZONE,
      locationId: location || null,
    });

    let salesDailyMap = null;
    if (specificDay) {
      salesDailyMap = await aggregateReplenishSalesDaily({
        productIds,
        dayStart: specificDay.start,
        dayEnd: specificDay.end,
        locationId: location || null,
      });
    }

    // 7. Build sales-location-wise product rows
    const groupedByLocation = [];
    const combinedData = [];

    salesLocations.forEach((salesLoc) => {
      const warehouseLoc = salesLoc.location;
      if (!warehouseLoc?._id) return;

      const warehouseLocIdStr = warehouseLoc._id.toString();
      const salesLocIdStr = salesLoc._id.toString();
      const displayLocation = {
        _id: salesLoc._id,
        name: salesLoc.name,
        code: salesLoc.code,
        warehouse: {
          _id: warehouseLoc._id,
          name: warehouseLoc.name,
          code: warehouseLoc.code,
        },
      };
      const locationProducts = [];

      products.forEach((product) => {
        const productIdStr = product._id.toString();
        const stockKey = `${productIdStr}-${warehouseLocIdStr}`;
        const stockRec = stockMap.get(stockKey);

        const monthlyQty = monthBuckets.reduce((sum, bucket) => {
          const mapKey = `${productIdStr}-${salesLocIdStr}-${bucket.key}`;
          return sum + (salesMonthlyMap.get(mapKey) || 0);
        }, 0);

        const hasStock = stockRec && stockRec.quantity > 0;
        const hasSales = monthlyQty > 0;
        const hasSalesOnDate = salesDailyMap
          ? (salesDailyMap.get(`${productIdStr}-${salesLocIdStr}`) || 0) > 0
          : false;
        const hasHomeStock = (homeStockByProduct.get(productIdStr) ?? 0) > 0;
        if (!hasStock && !hasSales && !hasSalesOnDate && !hasHomeStock) {
          return;
        }

        const row = buildProductRow(
          product,
          displayLocation,
          salesLoc._id,
          warehouseLoc._id,
          stockRec,
          monthBuckets,
          salesMonthlyMap,
          salesDailyMap,
          buildHomeInventoryForProduct(productIdStr, homeLocation, homeStockByProduct)
        );
        locationProducts.push(row);
        combinedData.push(row);
      });

      if (locationProducts.length > 0) {
        groupedByLocation.push({
          location: displayLocation,
          summary: {
            totalProducts: locationProducts.length,
            reorderCount: locationProducts.filter((i) => i.replenishStatus === 'REORDER').length,
            lowCount: locationProducts.filter((i) => i.replenishStatus === 'LOW').length,
            currentStock: locationProducts.reduce((s, i) => s + i.inventory.currentStock, 0),
            unitsSoldCurrentMonth: locationProducts.reduce((s, i) => s + i.salesCurrent, 0),
            unitsSoldPastThreeMonths: locationProducts.reduce(
              (s, i) => s + i.salesPastThreeMonths,
              0
            ),
            ...(specificDay
              ? {
                  unitsSoldOnDate: locationProducts.reduce(
                    (s, i) => s + (i.salesOnDate || 0),
                    0
                  ),
                }
              : {}),
          },
          products: locationProducts,
        });
      }
    });

    applyHomeRefillAllocation(combinedData, homeLocation, homeStockByProduct);

    const totalProducts = combinedData.length;
    const reorderCount = combinedData.filter((i) => i.replenishStatus === 'REORDER').length;
    const restockRequiredNextMonthQty = combinedData.reduce(
      (sum, item) => sum + (item.requiredStockNextMonth || 0),
      0
    );
    const unitsSoldCurrentMonth = combinedData.reduce(
      (sum, item) => sum + (item.salesCurrent || 0),
      0
    );
    const unitsSoldPastThreeMonths = combinedData.reduce(
      (sum, item) => sum + (item.salesPastThreeMonths || 0),
      0
    );
    const unitsSoldOnDate = specificDay
      ? combinedData.reduce((s, i) => s + (i.salesOnDate || 0), 0)
      : undefined;

    return {
      summary: {
        totalProducts,
        reorderCount,
        restockRequiredNextMonthQty,
        unitsSoldCurrentMonth,
        unitsSoldPastThreeMonths,
        ...(unitsSoldOnDate !== undefined ? { unitsSoldOnDate } : {}),
      },
      monthLabels: {
        current: monthBuckets[0].label,
        pastThreeMonths: `${monthBuckets[2].label} – ${monthBuckets[0].label}`,
      },
      monthKeys: monthBuckets.map((b) => b.key),
      dateWindow,
      specificDate: specificDay ? { value: specificDay.key, label: specificDay.label } : null,
      homeBranch: homeLocation
        ? { _id: homeLocation._id, name: homeLocation.name, code: homeLocation.code }
        : null,
      products: combinedData,
      groupedByLocation,
    };
}

function formatRequiredStockDisplay(item) {
  const main = Number(item?.requiredStockNextMonth ?? 0);
  if (main <= 0) return '';
  const deduction = Number(item?.inventory?.availableStock ?? 0);
  return `${main} (${deduction})`;
}

function formatReorderDisplay(item) {
  const main = Number(item?.reorderQty ?? 0);
  if (main <= 0) return '';
  const deduction = Number(item?.refillQty ?? 0);
  return `${main} (${deduction})`;
}

function buildReplenishProductExportHeaders(monthLabels, showDateColumn) {
  const headers = [
    { key: 'sku', label: 'SKU' },
    { key: 'productName', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'currentStock', label: 'Stock' },
    { key: 'homeAvailableStock', label: 'Avail at Home' },
    { key: 'salesCurrent', label: `Sold (${monthLabels.current})` },
    { key: 'salesPastThreeMonths', label: `Sold (${monthLabels.pastThreeMonths})` },
  ];
  if (showDateColumn) {
    headers.push({
      key: 'salesOnDate',
      label: `Sold (${monthLabels.specificDate})`,
    });
  }
  headers.push(
    { key: 'highestMonthlySale', label: 'Highest Monthly Sale (Past 3 Mo.)' },
    { key: 'requiredStockDisplay', label: 'Req. Stock (Next Mo.)' },
    { key: 'reorderDisplay', label: 'Reorder' }
  );
  return headers;
}

const REPLENISH_CATEGORY_EXPORT_BASE_HEADERS = [
  { key: 'categoryName', label: 'Category' },
  { key: 'totalProducts', label: 'Products' },
  { key: 'needsReorder', label: 'Need Reorder' },
  { key: 'currentStock', label: 'Stock' },
];

function buildReplenishCategoryExportHeaders(monthLabels, showDateColumn) {
  const headers = [
    ...REPLENISH_CATEGORY_EXPORT_BASE_HEADERS,
    { key: 'unitsSoldCurrentMonth', label: `Sold (${monthLabels.current})` },
    { key: 'unitsSoldPastThreeMonths', label: `Sold (${monthLabels.pastThreeMonths})` },
  ];
  if (showDateColumn) {
    headers.push({
      key: 'unitsSoldOnDate',
      label: `Sold (${monthLabels.specificDate})`,
    });
  }
  return headers;
}

function mapReplenishItemToExportRow(item, monthLabels, showDateColumn) {
  const row = {
    sku: item.product?.sku || '',
    productName: item.product?.title || '',
    category: item.product?.category?.name || 'Uncategorized',
    currentStock: item.inventory?.currentStock ?? 0,
    homeAvailableStock: item.homeAvailableStock ?? item.homeInventory?.availableStock ?? 0,
    salesCurrent: item.salesCurrent ?? 0,
    salesPastThreeMonths: item.salesPastThreeMonths ?? 0,
    highestMonthlySale: item.highestMonthlySale ?? 0,
    requiredStockDisplay: formatRequiredStockDisplay(item),
    reorderDisplay: formatReorderDisplay(item),
  };
  if (showDateColumn) {
    row.salesOnDate = item.salesOnDate ?? 0;
  }
  return row;
}

function filterReplenishProductsForExport(products, { status, search, view }) {
  let result = [...products];

  if (status && status !== 'ALL') {
    result = result.filter((item) => item.replenishStatus === status);
  }

  const term = String(search || '').trim().toLowerCase();
  if (term) {
    result = result.filter((item) => {
      const titleMatch = item.product?.title && item.product.title.toLowerCase().includes(term);
      const skuMatch = item.product?.sku && item.product.sku.toLowerCase().includes(term);
      const locationMatch =
        view === 'products'
        && item.location?.name
        && item.location.name.toLowerCase().includes(term);
      return titleMatch || skuMatch || locationMatch;
    });
  }

  return result;
}

function mapReplenishCategoryToExportRow(cat, monthLabels, showDateColumn) {
  const row = {
    categoryName: cat.categoryName,
    totalProducts: cat.totalProducts,
    needsReorder: cat.needsReorder,
    currentStock: cat.currentStock,
    unitsSoldCurrentMonth: cat.unitsSoldCurrentMonth,
    unitsSoldPastThreeMonths: cat.unitsSoldPastThreeMonths,
  };
  if (showDateColumn) {
    row.unitsSoldOnDate = cat.unitsSoldOnDate ?? 0;
  }
  return row;
}

router.get('/replenish', async (req, res) => {
  try {
    const data = await buildReplenishReportData(req.query);
    res.json(data);
  } catch (error) {
    logger.backend.error('Error fetching replenishment report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.get('/replenish/export', async (req, res) => {
  try {
    const { status = 'ALL', search = '', ...reportQuery } = req.query;
    const data = await buildReplenishReportData(reportQuery);
    const showDateColumn = Boolean(data.specificDate?.label);
    const monthLabels = {
      current: data.monthLabels?.current || 'Previous Month',
      pastThreeMonths: data.monthLabels?.pastThreeMonths || 'Past 3 Months',
      specificDate: data.specificDate?.label || '',
    };

    const products = filterReplenishProductsForExport(data.products || [], {
      status,
      search,
      view: 'locations',
    });
    const productRows = products.map((item) =>
      mapReplenishItemToExportRow(item, monthLabels, showDateColumn)
    );
    const productHeaders = buildReplenishProductExportHeaders(monthLabels, showDateColumn);
    const sheets = [{
      name: 'Location-wise',
      headers: productHeaders,
      data: productRows,
    }];

    const buffer = exportMultiSheetExcel(sheets);
    const filename = `replenish_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting replenishment report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;

