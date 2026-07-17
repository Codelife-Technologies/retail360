const Sale = require('../../models/Sale');
const Purchase = require('../../models/Purchase');
const Price = require('../../models/Price');
const FinanceExpense = require('../models/FinanceExpense');
const FinanceOtherIncome = require('../models/FinanceOtherIncome');
const {
  parseDateRange,
  buildDateQuery,
  pct,
  monthKey,
  SALES_CHANNELS_COMPARE,
} = require('../utils/constants');
const { getRates, rateToInr, convertAmount } = require('../../currency/services/exchangeRateService');
const { currencyForCountry, BASE_CURRENCY } = require('../../currency/constants');
const { resolveSaleCurrency } = require('../../currency/utils/saleCurrency');

let PayrollModel = null;
try {
  PayrollModel = require('../../hr/models/Payroll');
} catch (_e) {
  PayrollModel = null;
}

function resolveTxnInr(doc, amount, defaultCurrency = BASE_CURRENCY, rates) {
  const currency = String(doc.currency || defaultCurrency).toUpperCase();
  const original =
    doc.originalAmount != null ? Number(doc.originalAmount) : Number(amount) || 0;
  if (Number(doc.exchangeRateToInr) > 0) {
    return {
      currency,
      originalAmount: original,
      exchangeRateToInr: Number(doc.exchangeRateToInr),
      amountInr: original * Number(doc.exchangeRateToInr),
    };
  }
  const rate = rateToInr(currency, rates);
  return {
    currency,
    originalAmount: original,
    exchangeRateToInr: rate,
    amountInr: original * rate,
  };
}

function withSaleInr(sale, rates) {
  const currency = resolveSaleCurrency(sale);
  const original =
    sale.originalAmount != null ? Number(sale.originalAmount) : Number(sale.total) || 0;
  // Prefer live/location-resolved rate when stored currency disagrees (legacy AED hardcode).
  const storedCurrency = String(sale.currency || '').toUpperCase();
  const useStoredRate =
    Number(sale.exchangeRateToInr) > 0 && storedCurrency === currency;
  const rate = useStoredRate
    ? Number(sale.exchangeRateToInr)
    : rateToInr(currency, rates);
  const fx = {
    currency,
    originalAmount: original,
    exchangeRateToInr: rate,
    amountInr: original * rate,
  };

  const items = (sale.items || []).map((item) => ({
    ...item,
    unitPrice: (Number(item.unitPrice) || 0) * rate,
    total: (Number(item.total) || 0) * rate,
  }));

  return {
    ...sale,
    currency,
    total: fx.amountInr,
    tax: (Number(sale.tax) || 0) * rate,
    discount: (Number(sale.discount) || 0) * rate,
    subtotal: (Number(sale.subtotal) || 0) * rate,
    items,
    _fx: fx,
  };
}

function withPurchaseInr(p, rates) {
  const fx = resolveTxnInr(p, p.total, p.currency || BASE_CURRENCY, rates);
  return { ...p, total: fx.amountInr, _fx: fx };
}

function withExpenseInr(e, rates) {
  const amt = (Number(e.amount) || 0) + (Number(e.gst) || 0);
  const fx = resolveTxnInr(
    {
      ...e,
      originalAmount:
        e.originalAmount != null ? e.originalAmount : amt,
    },
    amt,
    e.currency || BASE_CURRENCY,
    rates
  );
  // Keep amount/gst split proportional in INR for category sums
  const base = (Number(e.amount) || 0) + (Number(e.gst) || 0);
  const share = base > 0 ? (Number(e.amount) || 0) / base : 1;
  return {
    ...e,
    amount: fx.amountInr * share,
    gst: fx.amountInr * (1 - share),
    _fx: fx,
  };
}

function withIncomeInr(i, rates) {
  const amt = (Number(i.amount) || 0) + (Number(i.gst) || 0);
  const fx = resolveTxnInr(
    {
      ...i,
      originalAmount: i.originalAmount != null ? i.originalAmount : Number(i.amount) || 0,
    },
    Number(i.amount) || 0,
    i.currency || BASE_CURRENCY,
    rates
  );
  const gstFx = resolveTxnInr(
    { ...i, originalAmount: i.gst, exchangeRateToInr: fx.exchangeRateToInr },
    i.gst,
    i.currency || BASE_CURRENCY,
    rates
  );
  return {
    ...i,
    amount: fx.amountInr,
    gst: gstFx.amountInr,
    _fx: fx,
  };
}

function buildCountryBreakdown(salesInr, rates) {
  const map = new Map();
  salesInr.forEach((s) => {
    const country =
      s.salesChannel?.country ||
      s.salesLocation?.location?.country ||
      (String(s.currency || '').toUpperCase() === 'AED' ? 'UAE' : 'India');
    const localCurrency = currencyForCountry(country);
    const key = String(country);
    if (!map.has(key)) {
      map.set(key, {
        country: key,
        currency: localCurrency,
        orders: 0,
        amountLocal: 0,
        amountInr: 0,
      });
    }
    const row = map.get(key);
    row.orders += 1;
    row.amountInr += Number(s.total) || 0;
    if (String(s._fx?.currency || s.currency || '').toUpperCase() === localCurrency) {
      row.amountLocal += Number(s._fx?.originalAmount) || 0;
    } else {
      row.amountLocal += convertAmount(Number(s.total) || 0, BASE_CURRENCY, localCurrency, rates);
    }
  });
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      amountLocal: Math.round(r.amountLocal * 100) / 100,
      amountInr: Math.round(r.amountInr),
      amountUsd: Math.round(convertAmount(r.amountInr, BASE_CURRENCY, 'USD', rates) * 100) / 100,
    }))
    .sort((a, b) => b.amountInr - a.amountInr);
}

async function getPriceMap() {
  const prices = await Price.find({ isActive: { $ne: false } })
    .select('product purchasePrice salesPrice effectiveDate currency')
    .sort({ effectiveDate: -1 })
    .lean();
  const map = new Map();
  prices.forEach((p) => {
    const id = String(p.product);
    if (!map.has(id)) map.set(id, p);
  });
  return map;
}

function purchaseUnitCostInr(priceDoc, rates) {
  if (!priceDoc) return 0;
  const amount = Number(priceDoc.purchasePrice) || 0;
  const currency = String(priceDoc.currency || BASE_CURRENCY).toUpperCase();
  if (currency === BASE_CURRENCY) return amount;
  return amount * rateToInr(currency, rates);
}

function computeProductProfits(sales, priceMap, rates) {
  const bySku = new Map();
  sales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const product = item.product;
      if (!product) return;
      const id = String(product._id || product);
      const sku = product.sku || id;
      const name = product.name || 'Product';
      const revenue = Number(item.total) || 0;
      const qty = Number(item.quantity) || 0;
      const unitCost = purchaseUnitCostInr(priceMap.get(id), rates);
      const cost = unitCost * qty;
      if (!bySku.has(id)) {
        bySku.set(id, { sku, product: name, revenue: 0, cost: 0, qty: 0 });
      }
      const row = bySku.get(id);
      row.revenue += revenue;
      row.cost += cost;
      row.qty += qty;
    });
  });

  return Array.from(bySku.values()).map((row) => {
    const profit = row.revenue - row.cost;
    return {
      ...row,
      profit,
      loss: profit < 0 ? Math.abs(profit) : 0,
      marginPct: pct(profit, row.revenue),
    };
  });
}

async function loadSales(dateFrom, dateTo, extra = {}) {
  const query = {
    ...buildDateQuery('salesDate', dateFrom, dateTo),
    ...extra,
  };
  return Sale.find(query)
    .populate('salesChannel', 'name code type country defaultCurrency')
    .populate({
      path: 'salesLocation',
      select: 'name code location country currency',
      populate: { path: 'location', select: 'name country city' },
    })
    .populate('items.product', 'sku name category')
    .sort({ salesDate: -1 })
    .lean();
}

async function loadPurchases(dateFrom, dateTo) {
  return Purchase.find(buildDateQuery('purchaseDate', dateFrom, dateTo))
    .populate('supplier', 'name')
    .populate('location', 'name country city')
    .sort({ purchaseDate: -1 })
    .lean();
}

async function loadExpenses(dateFrom, dateTo, filters = {}) {
  const query = { ...buildDateQuery('date', dateFrom, dateTo) };
  if (filters.category) query.category = filters.category;
  if (filters.status) query.status = filters.status;
  if (filters.vendor) query.vendor = { $regex: filters.vendor, $options: 'i' };
  if (filters.department) query.department = filters.department;
  if (filters.paymentMode) query.paymentMode = filters.paymentMode;
  return FinanceExpense.find(query).sort({ date: -1 }).lean();
}

async function loadOtherIncome(dateFrom, dateTo) {
  return FinanceOtherIncome.find(buildDateQuery('date', dateFrom, dateTo)).lean();
}

async function loadPayrollExpense(dateFrom, dateTo) {
  if (!PayrollModel) return 0;
  const query = {};
  // Payroll uses month/year — approximate with paidAt or createdAt
  if (dateFrom || dateTo) {
    query.$or = [
      buildDateQuery('paidAt', dateFrom, dateTo),
      buildDateQuery('createdAt', dateFrom, dateTo),
    ].filter((q) => Object.keys(q).length);
    if (!query.$or.length) delete query.$or;
  }
  const rows = await PayrollModel.find(query).select('netSalary').lean();
  return sumBy(rows, 'netSalary');
}

function sumBy(arr, field) {
  return arr.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}

function buildMonthlySeries(sales, expenses, purchases) {
  const map = {};
  const ensure = (key) => {
    if (!map[key]) map[key] = { month: key, revenue: 0, expense: 0, profit: 0, purchase: 0 };
    return map[key];
  };
  sales.forEach((s) => {
    const row = ensure(monthKey(s.salesDate));
    row.revenue += Number(s.total) || 0;
  });
  expenses.forEach((e) => {
    const row = ensure(monthKey(e.date));
    row.expense += (Number(e.amount) || 0) + (Number(e.gst) || 0);
  });
  purchases.forEach((p) => {
    const row = ensure(monthKey(p.purchaseDate));
    row.purchase += Number(p.total) || 0;
    row.expense += Number(p.total) || 0;
  });
  Object.values(map).forEach((row) => {
    row.profit = row.revenue - row.expense;
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
}

function channelBreakdown(sales, expenses, purchases) {
  const map = new Map();
  const ensure = (name) => {
    const key = name || 'Unassigned';
    if (!map.has(key)) {
      map.set(key, { channel: key, orders: 0, revenue: 0, expense: 0, profit: 0, marginPct: 0 });
    }
    return map.get(key);
  };

  sales.forEach((s) => {
    const name = s.salesChannel?.name || 'Unassigned';
    const row = ensure(name);
    row.orders += 1;
    row.revenue += Number(s.total) || 0;
  });

  // Allocate purchase + expense proportionally by revenue share (simple ERP allocation)
  const totalRev = Array.from(map.values()).reduce((a, r) => a + r.revenue, 0) || 1;
  const totalOpEx =
    expenses.reduce((a, e) => a + (Number(e.amount) || 0) + (Number(e.gst) || 0), 0) +
    purchases.reduce((a, p) => a + (Number(p.total) || 0), 0);

  map.forEach((row) => {
    row.expense = Math.round((row.revenue / totalRev) * totalOpEx);
    row.profit = row.revenue - row.expense;
    row.marginPct = pct(row.profit, row.revenue);
  });

  // Ensure compare channels exist
  SALES_CHANNELS_COMPARE.forEach((name) => {
    if (![...map.keys()].some((k) => k.toLowerCase().includes(name.toLowerCase()))) {
      // only add empty card if no fuzzy match — keep as optional empty
    }
  });

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

function expenseByCategory(expenses) {
  const map = {};
  expenses.forEach((e) => {
    const key = e.category || 'Other';
    map[key] = (map[key] || 0) + (Number(e.amount) || 0) + (Number(e.gst) || 0);
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function buildInsights({ monthly, products, channels, expenseCats, revenue, expense }) {
  const bestMonth = [...monthly].sort((a, b) => b.revenue - a.revenue)[0];
  const topExpense = [...expenseCats].sort((a, b) => b.value - a.value)[0];
  const topProduct = [...products].sort((a, b) => b.profit - a.profit)[0];
  const leastProduct = [...products].sort((a, b) => a.profit - b.profit)[0];
  const topChannel = [...channels].sort((a, b) => b.revenue - a.revenue)[0];

  let revenueGrowth = 0;
  let expenseGrowth = 0;
  let profitGrowth = 0;
  if (monthly.length >= 2) {
    const prev = monthly[monthly.length - 2];
    const curr = monthly[monthly.length - 1];
    revenueGrowth = pct(curr.revenue - prev.revenue, prev.revenue || 1);
    expenseGrowth = pct(curr.expense - prev.expense, prev.expense || 1);
    profitGrowth = pct(curr.profit - prev.profit, Math.abs(prev.profit) || 1);
  }

  return {
    highestRevenueMonth: bestMonth?.month || '—',
    highestExpenseCategory: topExpense?.name || '—',
    mostProfitableProduct: topProduct?.product || '—',
    leastProfitableProduct: leastProduct?.product || '—',
    highestRevenueSalesChannel: topChannel?.channel || '—',
    lowestPerformingCategory: [...expenseCats].sort((a, b) => a.value - b.value)[0]?.name || '—',
    profitGrowthPct: profitGrowth,
    expenseGrowthPct: expenseGrowth,
    revenueGrowthPct: revenueGrowth,
    totalRevenue: revenue,
    totalExpense: expense,
  };
}

async function getFinanceSnapshot(query = {}) {
  const { dateFrom, dateTo } = parseDateRange(query);
  const saleFilter = {};
  if (query.salesChannel) saleFilter.salesChannel = query.salesChannel;
  if (query.paymentStatus) saleFilter.paymentStatus = query.paymentStatus;

  const ratesPayload = await getRates();
  const rates = ratesPayload.rates;

  const [salesRaw, purchasesRaw, expensesRaw, otherIncomeRaw, priceMap, payrollExpense] = await Promise.all([
    loadSales(dateFrom, dateTo, saleFilter),
    loadPurchases(dateFrom, dateTo),
    loadExpenses(dateFrom, dateTo, query),
    loadOtherIncome(dateFrom, dateTo),
    getPriceMap(),
    loadPayrollExpense(dateFrom, dateTo),
  ]);

  const sales = salesRaw.map((s) => withSaleInr(s, rates));
  const purchases = purchasesRaw.map((p) => withPurchaseInr(p, rates));
  const expenses = expensesRaw.map((e) => withExpenseInr(e, rates));
  const otherIncome = otherIncomeRaw.map((i) => withIncomeInr(i, rates));
  const countryBreakdown = buildCountryBreakdown(sales, rates);

  const productSales = sumBy(sales, 'total');
  const gstCollected = sumBy(sales, 'tax');
  const discountTotal = sumBy(sales, 'discount');
  const serviceIncome = otherIncome
    .filter((i) => i.incomeType === 'Service Income')
    .reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const otherInc = otherIncome
    .filter((i) => i.incomeType !== 'Service Income')
    .reduce((a, i) => a + (Number(i.amount) || 0), 0);

  const grossRevenue = productSales + serviceIncome + otherInc;
  const netRevenue = grossRevenue - discountTotal;
  const purchaseCost = sumBy(purchases, 'total');

  const products = computeProductProfits(sales, priceMap, rates);
  const cogs = products.reduce((a, p) => a + p.cost, 0) || purchaseCost;

  const recordedExpenses = expenses.reduce(
    (a, e) => a + (Number(e.amount) || 0) + (Number(e.gst) || 0),
    0
  );
  const salaryExpense =
    payrollExpense +
    expenses
      .filter((e) => e.category === 'Employee')
      .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const marketingCost = expenses
    .filter((e) => e.category === 'Marketing')
    .reduce((a, e) => a + (Number(e.amount) || 0) + (Number(e.gst) || 0), 0);
  const logisticsCost = expenses
    .filter((e) => e.category === 'Operations' || e.subcategory === 'Freight')
    .reduce((a, e) => a + (Number(e.amount) || 0) + (Number(e.gst) || 0), 0);

  const totalExpenses = recordedExpenses + purchaseCost + (payrollExpense > 0 ? payrollExpense : 0);
  // Avoid double-counting salary if also in expenses as Employee + payroll
  const operatingExpenses = recordedExpenses + (payrollExpense > 0 ? payrollExpense : 0);
  const grossProfit = netRevenue - cogs;
  const taxExpense = expenses
    .filter((e) => e.category === 'Finance' && (e.subcategory === 'GST' || e.subcategory === 'TDS'))
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const interestExpense = expenses
    .filter((e) => e.subcategory === 'Interest')
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const operatingProfit = grossProfit - operatingExpenses + purchaseCost; // purchase in COGS path already; keep opEx without purchase
  // Clarify:
  // Gross profit = Net sales - COGS
  // Operating expenses = recorded expenses + payroll (not purchase/COGS)
  // Net profit = Gross profit - operating expenses - interest - tax
  const cleanOperatingExpenses = recordedExpenses + (payrollExpense || 0);
  const cleanOperatingProfit = grossProfit - cleanOperatingExpenses;
  const netProfit = cleanOperatingProfit - interestExpense - taxExpense;

  const monthly = buildMonthlySeries(sales, expenses, purchases);
  const channels = channelBreakdown(sales, expenses, purchases);
  const expenseCats = expenseByCategory(expenses);
  if (purchaseCost > 0) {
    expenseCats.push({ name: 'Purchases (Inventory)', value: purchaseCost });
  }

  const recentTransactions = [
    ...sales.slice(0, 8).map((s) => ({
      id: String(s._id),
      type: 'Income',
      ref: s.salesNumber,
      party: s.customer?.name || '—',
      date: s.salesDate,
      amount: s.total,
      status: s.paymentStatus,
    })),
    ...expenses.slice(0, 8).map((e) => ({
      id: String(e._id),
      type: 'Expense',
      ref: e.voucherNo,
      party: e.vendor || e.category,
      date: e.date,
      amount: (Number(e.amount) || 0) + (Number(e.gst) || 0),
      status: e.status,
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);

  const insights = buildInsights({
    monthly,
    products,
    channels,
    expenseCats,
    revenue: grossRevenue,
    expense: totalExpenses,
  });

  return {
    filters: { dateFrom, dateTo },
    exchangeRates: {
      base: ratesPayload.base,
      rates,
      source: ratesPayload.source,
      fetchedAt: ratesPayload.fetchedAt,
      nextRefreshAt: ratesPayload.nextRefreshAt,
      refreshMinutes: ratesPayload.refreshMinutes,
    },
    reportingCurrency: BASE_CURRENCY,
    countryBreakdown,
    kpis: {
      totalRevenue: Math.round(grossRevenue),
      totalExpenses: Math.round(totalExpenses),
      grossProfit: Math.round(grossProfit),
      netProfit: Math.round(netProfit),
      grossMarginPct: pct(grossProfit, netRevenue || grossRevenue),
      netMarginPct: pct(netProfit, netRevenue || grossRevenue),
      totalOrders: sales.length,
      totalPurchaseCost: Math.round(purchaseCost),
      // Dual display helpers (INR primary; USD secondary)
      totalRevenueUsd: Math.round(convertAmount(grossRevenue, BASE_CURRENCY, 'USD', rates) * 100) / 100,
      totalExpensesUsd: Math.round(convertAmount(totalExpenses, BASE_CURRENCY, 'USD', rates) * 100) / 100,
      grossProfitUsd: Math.round(convertAmount(grossProfit, BASE_CURRENCY, 'USD', rates) * 100) / 100,
      netProfitUsd: Math.round(convertAmount(netProfit, BASE_CURRENCY, 'USD', rates) * 100) / 100,
      totalPurchaseCostUsd: Math.round(convertAmount(purchaseCost, BASE_CURRENCY, 'USD', rates) * 100) / 100,
    },
    incomeCards: {
      grossRevenue: Math.round(grossRevenue),
      netRevenue: Math.round(netRevenue),
      productSales: Math.round(productSales),
      serviceIncome: Math.round(serviceIncome),
      gstCollected: Math.round(gstCollected),
      otherIncome: Math.round(otherInc),
    },
    expenseCards: {
      totalExpense: Math.round(totalExpenses),
      purchaseCost: Math.round(purchaseCost),
      employeeSalary: Math.round(salaryExpense),
      marketingCost: Math.round(marketingCost),
      logisticsCost: Math.round(logisticsCost),
      otherExpenses: Math.round(
        Math.max(0, recordedExpenses - marketingCost - logisticsCost - (salaryExpense - payrollExpense))
      ),
    },
    pnl: {
      grossSales: Math.round(productSales + serviceIncome + otherInc),
      salesReturn: 0,
      netSales: Math.round(netRevenue),
      purchaseCost: Math.round(purchaseCost),
      cogs: Math.round(cogs),
      grossProfit: Math.round(grossProfit),
      salary: Math.round(salaryExpense),
      marketing: Math.round(marketingCost),
      rent: Math.round(
        expenses
          .filter((e) => e.subcategory === 'Rent')
          .reduce((a, e) => a + (Number(e.amount) || 0), 0)
      ),
      utilities: Math.round(
        expenses
          .filter((e) => ['Electricity', 'Internet'].includes(e.subcategory))
          .reduce((a, e) => a + (Number(e.amount) || 0), 0)
      ),
      shipping: Math.round(logisticsCost),
      otherExpenses: Math.round(
        Math.max(
          0,
          cleanOperatingExpenses - salaryExpense - marketingCost - logisticsCost
        )
      ),
      operatingExpenses: Math.round(cleanOperatingExpenses),
      operatingProfit: Math.round(cleanOperatingProfit),
      interest: Math.round(interestExpense),
      taxes: Math.round(taxExpense),
      netProfit: Math.round(netProfit),
      grossMarginPct: pct(grossProfit, netRevenue || 1),
      netMarginPct: pct(netProfit, netRevenue || 1),
    },
    charts: {
      revenueVsExpense: monthly.map((m) => ({
        month: m.month,
        revenue: Math.round(m.revenue),
        expense: Math.round(m.expense),
      })),
      monthlyProfit: monthly.map((m) => ({
        month: m.month,
        profit: Math.round(m.profit),
        grossProfit: Math.round(m.revenue - m.purchase),
        netProfit: Math.round(m.profit),
      })),
      expenseByCategory: expenseCats,
      salesChannelRevenue: channels.map((c) => ({
        name: c.channel,
        value: Math.round(c.revenue),
      })),
      expenseByDepartment: Object.entries(
        expenses.reduce((acc, e) => {
          const d = e.department || e.category || 'General';
          acc[d] = (acc[d] || 0) + (Number(e.amount) || 0);
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value })),
      expenseByPaymentMode: Object.entries(
        expenses.reduce((acc, e) => {
          const m = e.paymentMode || 'Other';
          acc[m] = (acc[m] || 0) + (Number(e.amount) || 0);
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value })),
      profitByCategory: products.reduce((acc, p) => {
        // limited without category on aggregated products well — skip heavy
        return acc;
      }, []),
      profitBySalesChannel: channels.map((c) => ({
        name: c.channel,
        profit: Math.round(c.profit),
      })),
    },
    topProducts: [...products].sort((a, b) => b.profit - a.profit).slice(0, 10),
    leastProducts: [...products].sort((a, b) => a.profit - b.profit).slice(0, 10),
    channelAnalysis: channels,
    recentTransactions,
    insights,
    sales,
    expenses,
    purchases,
    otherIncome,
  };
}

module.exports = {
  getFinanceSnapshot,
  loadSales,
  loadExpenses,
  loadPurchases,
  parseDateRange,
  buildDateQuery,
};
