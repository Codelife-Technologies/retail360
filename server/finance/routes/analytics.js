const express = require('express');
const { requireFinance } = require('../utils/auth');
const { getFinanceSnapshot } = require('../services/financeAnalytics');
const { sendWorkbook } = require('../utils/export');
const {
  EXPENSE_CATEGORIES,
  CATEGORY_LIST,
  PAYMENT_MODES,
  EXPENSE_STATUSES,
} = require('../utils/constants');
const SalesChannel = require('../../models/SalesChannel');

const router = express.Router();

router.get(
  '/meta',
  requireFinance('finance.dashboard.view', 'finance.expense.view', 'finance.income.view'),
  async (req, res) => {
    try {
      const salesChannels = await SalesChannel.find({})
        .select('_id name code isActive country defaultCurrency type')
        .sort({ name: 1 })
        .lean();

      res.json({
        expenseCategories: EXPENSE_CATEGORIES,
        categories: CATEGORY_LIST,
        paymentModes: PAYMENT_MODES,
        expenseStatuses: EXPENSE_STATUSES,
        incomeTypes: ['Service Income', 'Other Income', 'Interest Income', 'Commission'],
        incomeStatuses: ['Pending', 'Received', 'Cancelled'],
        salesChannels,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/dashboard', requireFinance('finance.dashboard.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);
    res.json({
      kpis: snap.kpis,
      charts: {
        revenueVsExpense: snap.charts.revenueVsExpense,
        monthlyProfit: snap.charts.monthlyProfit,
        expenseByCategory: snap.charts.expenseByCategory,
        salesChannelRevenue: snap.charts.salesChannelRevenue,
      },
      recentTransactions: snap.recentTransactions,
      topProducts: snap.topProducts,
      leastProducts: snap.leastProducts,
      channelAnalysis: snap.channelAnalysis,
      insights: snap.insights,
      filters: snap.filters,
      exchangeRates: snap.exchangeRates,
      countryBreakdown: snap.countryBreakdown,
      reportingCurrency: snap.reportingCurrency,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/income', requireFinance('finance.income.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);

    let rows = [
      ...snap.sales.map((s) => ({
        _id: s._id,
        source: 'sale',
        invoiceNo: s.salesNumber,
        orderNo: s.amazonOrderId || s.salesNumber,
        customer: s.customer?.name || '—',
        salesChannel: s.salesChannel?.name || '—',
        date: s.salesDate,
        revenue: s.subtotal || s.total,
        gst: s.tax || 0,
        discount: s.discount || 0,
        netAmount: s.total,
        paymentStatus: s.paymentStatus,
      })),
      ...snap.otherIncome.map((i) => ({
        _id: i._id,
        source: 'manual',
        invoiceNo: i.voucherNo || '—',
        orderNo: '—',
        customer: i.customer || '—',
        salesChannel: i.incomeType || 'Other Income',
        date: i.date,
        revenue: i.amount,
        gst: i.gst || 0,
        discount: 0,
        netAmount: (Number(i.amount) || 0) + (Number(i.gst) || 0),
        paymentStatus: i.status,
        description: i.description || '',
        department: i.department || '',
        incomeType: i.incomeType,
        bill: i.bill?.filePath ? i.bill : null,
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (req.query.paymentStatus) {
      const status = String(req.query.paymentStatus).toLowerCase();
      rows = rows.filter((r) => String(r.paymentStatus || '').toLowerCase() === status);
    }
    if (req.query.salesChannel) {
      // Sales are already filtered in the snapshot; hide manual income when a channel is selected
      rows = rows.filter((r) => r.source === 'sale');
    }
    if (req.query.customer) {
      const term = String(req.query.customer).toLowerCase();
      rows = rows.filter((r) => r.customer.toLowerCase().includes(term));
    }
    if (req.query.search) {
      const term = String(req.query.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          r.invoiceNo?.toLowerCase().includes(term) ||
          r.customer?.toLowerCase().includes(term) ||
          r.salesChannel?.toLowerCase().includes(term) ||
          r.description?.toLowerCase().includes(term)
      );
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    if (req.query.export) {
      return sendWorkbook(res, rows, 'Income_Report', req.query.export);
    }

    res.json({
      cards: snap.incomeCards,
      charts: {
        monthlyRevenue: snap.charts.revenueVsExpense.map((m) => ({
          month: m.month,
          revenue: m.revenue,
        })),
        revenueByChannel: snap.charts.salesChannelRevenue,
      },
      data,
      pagination: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.ceil(rows.length / limit) || 1,
        hasNextPage: start + limit < rows.length,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pnl', requireFinance('finance.pnl.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);
    const summary = [
      { particular: 'Gross Sales', amount: snap.pnl.grossSales },
      { particular: 'Sales Return', amount: snap.pnl.salesReturn },
      { particular: 'Net Sales', amount: snap.pnl.netSales },
      { particular: 'Purchase Cost', amount: snap.pnl.purchaseCost },
      { particular: 'COGS', amount: snap.pnl.cogs },
      { particular: 'Gross Profit', amount: snap.pnl.grossProfit },
      { particular: 'Salary', amount: snap.pnl.salary },
      { particular: 'Marketing', amount: snap.pnl.marketing },
      { particular: 'Rent', amount: snap.pnl.rent },
      { particular: 'Utilities', amount: snap.pnl.utilities },
      { particular: 'Shipping', amount: snap.pnl.shipping },
      { particular: 'Other Expenses', amount: snap.pnl.otherExpenses },
      { particular: 'Operating Profit', amount: snap.pnl.operatingProfit },
      { particular: 'Interest', amount: snap.pnl.interest },
      { particular: 'Taxes', amount: snap.pnl.taxes },
      { particular: 'Net Profit', amount: snap.pnl.netProfit },
    ];

    if (req.query.export) {
      return sendWorkbook(res, summary, 'Profit_and_Loss', req.query.export);
    }

    res.json({
      kpis: {
        grossProfit: snap.pnl.grossProfit,
        netProfit: snap.pnl.netProfit,
        grossMarginPct: snap.pnl.grossMarginPct,
        netMarginPct: snap.pnl.netMarginPct,
        cogs: snap.pnl.cogs,
        operatingExpense: snap.pnl.operatingExpenses,
      },
      summary,
      charts: {
        revenueVsExpense: snap.charts.revenueVsExpense,
        grossProfitTrend: snap.charts.monthlyProfit.map((m) => ({
          month: m.month,
          grossProfit: m.grossProfit,
        })),
        netProfitTrend: snap.charts.monthlyProfit.map((m) => ({
          month: m.month,
          netProfit: m.netProfit,
        })),
        profitBySalesChannel: snap.charts.profitBySalesChannel,
      },
      topProducts: snap.topProducts,
      leastProducts: snap.leastProducts,
      channelAnalysis: snap.channelAnalysis,
      insights: snap.insights,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/summary', requireFinance('finance.reports.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);
    res.json({
      kpis: snap.kpis,
      insights: snap.insights,
      channelAnalysis: snap.channelAnalysis,
      topProducts: snap.topProducts.slice(0, 5),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/records', requireFinance('finance.reports.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);

    let rows = [
      ...snap.sales.map((s) => ({
        id: `sale-${s._id}`,
        type: 'Sale',
        ref: s.salesNumber || '—',
        party: s.customer?.name || 'Walk-in',
        category: s.salesChannel?.name || 'Sales',
        date: s.salesDate,
        amount: Number(s.total) || 0,
        tax: Number(s.tax) || 0,
        status: s.paymentStatus || '—',
        description: s.amazonOrderId || '',
      })),
      ...snap.otherIncome.map((i) => ({
        id: `income-${i._id}`,
        type: 'Income',
        ref: i.voucherNo || '—',
        party: i.customer || '—',
        category: i.incomeType || 'Other Income',
        date: i.date,
        amount: (Number(i.amount) || 0) + (Number(i.gst) || 0),
        tax: Number(i.gst) || 0,
        status: i.status || '—',
        description: i.description || '',
      })),
      ...snap.expenses.map((e) => ({
        id: `expense-${e._id}`,
        type: 'Expense',
        ref: e.voucherNo || '—',
        party: e.vendor || '—',
        category: [e.category, e.subcategory].filter(Boolean).join(' / ') || 'Expense',
        date: e.date,
        amount: (Number(e.amount) || 0) + (Number(e.gst) || 0),
        tax: Number(e.gst) || 0,
        status: e.status || '—',
        description: e.description || '',
      })),
      ...snap.purchases.map((p) => ({
        id: `purchase-${p._id}`,
        type: 'Purchase',
        ref: p.purchaseNumber || '—',
        party: p.supplier?.name || '—',
        category: 'Purchase',
        date: p.purchaseDate,
        amount: Number(p.total) || 0,
        tax: Number(p.tax) || 0,
        status: p.paymentStatus || p.status || '—',
        description: p.notes || '',
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const typeFilter = String(req.query.type || '').trim().toLowerCase();
    if (typeFilter && typeFilter !== 'all') {
      rows = rows.filter((r) => String(r.type).toLowerCase() === typeFilter);
    }

    if (req.query.status) {
      const status = String(req.query.status).toLowerCase();
      rows = rows.filter((r) => String(r.status || '').toLowerCase() === status);
    }

    if (req.query.search) {
      const term = String(req.query.search).toLowerCase();
      rows = rows.filter(
        (r) =>
          r.ref?.toLowerCase().includes(term) ||
          r.party?.toLowerCase().includes(term) ||
          r.category?.toLowerCase().includes(term) ||
          r.description?.toLowerCase().includes(term) ||
          r.type?.toLowerCase().includes(term)
      );
    }

    const totals = rows.reduce(
      (acc, row) => {
        const amount = Number(row.amount) || 0;
        if (row.type === 'Sale') acc.sales += amount;
        else if (row.type === 'Income') acc.income += amount;
        else if (row.type === 'Expense') acc.expenses += amount;
        else if (row.type === 'Purchase') acc.purchases += amount;
        acc.count += 1;
        return acc;
      },
      { sales: 0, income: 0, expenses: 0, purchases: 0, count: 0 }
    );

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    if (req.query.export) {
      const exportRows = rows.map((r) => ({
        Type: r.type,
        Reference: r.ref,
        Category: r.category,
        Date: r.date,
        Amount: r.amount,
        Tax: r.tax,
        Status: r.status,
      }));
      return sendWorkbook(res, exportRows, 'Finance_Records', req.query.export);
    }

    res.json({
      cards: {
        salesTotal: Math.round(totals.sales),
        incomeTotal: Math.round(totals.income),
        expenseTotal: Math.round(totals.expenses),
        purchaseTotal: Math.round(totals.purchases),
        recordCount: totals.count,
      },
      data,
      pagination: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.ceil(rows.length / limit) || 1,
        hasNextPage: start + limit < rows.length,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/reports/:type/export', requireFinance('finance.reports.view'), async (req, res) => {
  try {
    const snap = await getFinanceSnapshot(req.query);
    const type = String(req.params.type || '').toLowerCase();
    const format = req.query.format || 'xlsx';
    let rows = [];
    let name = type;

    switch (type) {
      case 'sales':
      case 'sales-report':
        rows = snap.sales.map((s) => ({
          SalesNumber: s.salesNumber,
          OrderNumber: s.amazonOrderId || '',
          Customer: s.customer?.name || 'Walk-in',
          Channel: s.salesChannel?.name || '',
          Date: s.salesDate,
          Subtotal: s.subtotal,
          Tax: s.tax,
          Discount: s.discount,
          Total: s.total,
          PaymentStatus: s.paymentStatus,
        }));
        name = 'Sales_Report';
        break;
      case 'purchase':
      case 'purchase-report':
        rows = snap.purchases.map((p) => ({
          PurchaseNumber: p.purchaseNumber,
          Supplier: p.supplier?.name || '',
          PurchaseDate: p.purchaseDate,
          Subtotal: p.subtotal,
          Tax: p.tax,
          Shipping: p.shipping,
          Total: p.total,
          PaymentStatus: p.paymentStatus,
          Status: p.status,
        }));
        name = 'Purchase_Report';
        break;
      case 'income':
        rows = snap.sales.map((s) => ({
          Invoice: s.salesNumber,
          Customer: s.customer?.name,
          Channel: s.salesChannel?.name,
          Date: s.salesDate,
          Total: s.total,
          Tax: s.tax,
          Status: s.paymentStatus,
        }));
        name = 'Income_Report';
        break;
      case 'expense':
        rows = snap.expenses.map((e) => ({
          Date: e.date,
          Voucher: e.voucherNo,
          Category: e.category,
          Vendor: e.vendor,
          Amount: e.amount,
          GST: e.gst,
          Status: e.status,
        }));
        name = 'Expense_Report';
        break;
      case 'pnl':
      case 'profit-loss':
        rows = [
          { Particular: 'Gross Sales', Amount: snap.pnl.grossSales },
          { Particular: 'Net Sales', Amount: snap.pnl.netSales },
          { Particular: 'COGS', Amount: snap.pnl.cogs },
          { Particular: 'Gross Profit', Amount: snap.pnl.grossProfit },
          { Particular: 'Operating Expenses', Amount: snap.pnl.operatingExpenses },
          { Particular: 'Net Profit', Amount: snap.pnl.netProfit },
        ];
        name = 'Profit_and_Loss';
        break;
      case 'category-profit':
        rows = snap.topProducts.map((p) => ({
          SKU: p.sku,
          Product: p.product,
          Revenue: p.revenue,
          Cost: p.cost,
          Profit: p.profit,
          Margin: p.marginPct,
        }));
        name = 'Category_Wise_Profit';
        break;
      case 'vendor-expense':
        rows = Object.entries(
          snap.expenses.reduce((acc, e) => {
            const v = e.vendor || 'Unknown';
            acc[v] = (acc[v] || 0) + (Number(e.amount) || 0);
            return acc;
          }, {})
        ).map(([vendor, amount]) => ({ Vendor: vendor, Amount: amount }));
        name = 'Vendor_Expense';
        break;
      case 'customer-revenue':
        rows = Object.entries(
          snap.sales.reduce((acc, s) => {
            const c = s.customer?.name || 'Walk-in';
            acc[c] = (acc[c] || 0) + (Number(s.total) || 0);
            return acc;
          }, {})
        ).map(([customer, revenue]) => ({ Customer: customer, Revenue: revenue }));
        name = 'Customer_Revenue';
        break;
      case 'sales-channel':
        rows = snap.channelAnalysis.map((c) => ({
          Channel: c.channel,
          Orders: c.orders,
          Revenue: c.revenue,
          Expense: c.expense,
          Profit: c.profit,
          Margin: c.marginPct,
        }));
        name = 'Sales_Channel_Analysis';
        break;
      case 'tax-summary':
        rows = [
          { Particular: 'GST Collected (Sales Tax)', Amount: snap.incomeCards.gstCollected },
          { Particular: 'Tax Expenses (Finance)', Amount: snap.pnl.taxes },
        ];
        name = 'Tax_Summary';
        break;
      default:
        return res.status(400).json({ error: 'Unknown report type' });
    }

    return sendWorkbook(res, rows, name, format);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
