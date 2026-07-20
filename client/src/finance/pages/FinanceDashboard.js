import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { financeAPI } from '../services/financeApi';
import {
  FinanceKpiCard, FinanceInsights, FinanceEmpty, FinanceToast,
} from '../components/FinanceShared';
import {
  formatPct, formatDate, formatCountryName, toInputDate, currentFinancialYear,
} from '../utils/financeUtils';
import { useCurrency } from '../../currency/CurrencyContext';
import { CurrencySelector, DualKpiValue } from '../../currency/CurrencyUI';
import '../../currency/currency.css';

const PIE_COLORS = ['#6B3894', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#8b5cf6'];

const DASHBOARD_INSIGHTS = ['Highest Revenue Month', 'Highest Expense Category'];

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_fy', label: 'This Financial Year' },
  { value: 'this_year', label: 'This Calendar Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];

function toDateInputLocal(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolvePeriodRange(period, customFrom, customTo) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (period === 'all_time') {
    return { dateFrom: undefined, dateTo: undefined, label: 'all available data' };
  }

  if (period === 'custom') {
    return {
      dateFrom: customFrom || undefined,
      dateTo: customTo || undefined,
      label: customFrom && customTo
        ? `${formatDate(customFrom)} – ${formatDate(customTo)}`
        : customFrom
          ? `from ${formatDate(customFrom)}`
          : customTo
            ? `until ${formatDate(customTo)}`
            : 'custom range',
    };
  }

  if (period === 'this_month') {
    const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      dateFrom: toDateInputLocal(dateFrom),
      dateTo: toDateInputLocal(end),
      label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    };
  }

  if (period === 'last_3_months' || period === 'last_6_months') {
    const months = period === 'last_3_months' ? 3 : 6;
    const dateFrom = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    return {
      dateFrom: toDateInputLocal(dateFrom),
      dateTo: toDateInputLocal(end),
      label: `last ${months} months`,
    };
  }

  if (period === 'this_fy') {
    const fy = currentFinancialYear();
    const startYear = Number(fy.split('-')[0]);
    const dateFrom = new Date(startYear, 3, 1);
    const dateTo = new Date(startYear + 1, 2, 31);
    return {
      dateFrom: toDateInputLocal(dateFrom),
      dateTo: toDateInputLocal(dateTo),
      label: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    };
  }

  // this_year (default)
  const year = now.getFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    label: String(year),
  };
}

function FinanceDashboard({ onNavigate }) {
  const go = (tab) => {
    if (onNavigate) onNavigate(`finance:${tab}`);
  };
  const {
    displayCurrency,
    convert,
    formatCurrencyAmount,
  } = useCurrency();
  // Default to the last 6 months as requested (so dashboard charts don't show full-year history by default).
  const [period, setPeriod] = useState('last_6_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const range = useMemo(
    () => resolvePeriodRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (range.dateFrom) params.dateFrom = range.dateFrom;
      if (range.dateTo) params.dateTo = range.dateTo;
      const res = await financeAPI.getDashboard(params);
      setData(res.data);
    } catch (e) {
      setData(null);
      setToast(e.response?.data?.error || 'Failed to load finance dashboard');
    } finally {
      setLoading(false);
    }
  }, [range.dateFrom, range.dateTo]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const kpis = data?.kpis || {};
  const countryBreakdown = data?.countryBreakdown || [];

  const chartRevenueExpense = useMemo(() => (
    (data?.charts?.revenueVsExpense || []).map((row) => ({
      ...row,
      revenue: Math.round(convert(row.revenue) * 100) / 100,
      expense: Math.round(convert(row.expense) * 100) / 100,
    }))
  ), [data?.charts?.revenueVsExpense, convert, displayCurrency]);

  const chartMonthlyProfit = useMemo(() => (
    (data?.charts?.monthlyProfit || []).map((row) => ({
      ...row,
      profit: Math.round(convert(row.profit) * 100) / 100,
    }))
  ), [data?.charts?.monthlyProfit, convert, displayCurrency]);

  const chartExpenseCats = useMemo(() => (
    (data?.charts?.expenseByCategory || []).map((row) => ({
      ...row,
      value: Math.round(convert(row.value) * 100) / 100,
    }))
  ), [data?.charts?.expenseByCategory, convert, displayCurrency]);

  const moneyTip = (value) => [formatCurrencyAmount(value, displayCurrency), ''];

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Finance Dashboard</h1>
          <p className="fin-subtitle">
            KPIs and charts follow display currency ({displayCurrency}). Country rows stay in local currency. Period: {range.label}.
          </p>
        </div>
        <div className="fin-actions fin-dashboard-period">
          <CurrencySelector />
          <label className="fin-field fin-period-field">
            <span>KPI data period</span>
            <select
              className="fin-input"
              value={period}
              onChange={(e) => {
                const next = e.target.value;
                setPeriod(next);
                if (next === 'custom' && !customFrom && !customTo) {
                  const year = new Date().getFullYear();
                  setCustomFrom(`${year}-01-01`);
                  setCustomTo(toInputDate(new Date()));
                }
              }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          {period === 'custom' ? (
            <>
              <label className="fin-field fin-period-field">
                <span>From</span>
                <input
                  type="date"
                  className="fin-input"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="fin-field fin-period-field">
                <span>To</span>
                <input
                  type="date"
                  className="fin-input"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <FinanceToast message={toast} />

      <div className="fin-kpi-grid">
        <FinanceKpiCard loading={loading} label="Total Revenue" value={<DualKpiValue amountInInr={kpis.totalRevenue} loading={loading} />} tone="success" onClick={() => go('sales-report')} />
        <FinanceKpiCard loading={loading} label="Total Expenses" value={<DualKpiValue amountInInr={kpis.totalExpenses} loading={loading} />} tone="danger" onClick={() => go('expense-report')} />
        <FinanceKpiCard loading={loading} label="Gross Profit" value={<DualKpiValue amountInInr={kpis.grossProfit} loading={loading} />} tone="info" onClick={() => go('profit-loss')} />
        <FinanceKpiCard loading={loading} label="Net Profit" value={<DualKpiValue amountInInr={kpis.netProfit} loading={loading} />} tone="success" onClick={() => go('profit-loss')} />
        <FinanceKpiCard loading={loading} label="Gross Margin %" value={formatPct(kpis.grossMarginPct)} tone="info" onClick={() => go('profit-loss')} />
        <FinanceKpiCard loading={loading} label="Net Margin %" value={formatPct(kpis.netMarginPct)} tone="warning" onClick={() => go('profit-loss')} />
        <FinanceKpiCard loading={loading} label="Total Purchase Cost" value={<DualKpiValue amountInInr={kpis.totalPurchaseCost} loading={loading} />} tone="warning" onClick={() => go('purchase-report')} />
      </div>

      <FinanceInsights insights={data?.insights} include={DASHBOARD_INSIGHTS} />

      <div className="fin-card">
        <h3>Country-wise Sales</h3>
        <p className="fin-chart-note">Amounts shown in each country&apos;s local currency (with INR reference).</p>
        {!loading && countryBreakdown.length === 0 ? (
          <FinanceEmpty title="No country data" subtitle="Sales with channel/location country will appear here." />
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table fx-country-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Orders</th>
                  <th>Local currency</th>
                  <th>Amount (local)</th>
                  <th>Amount (INR / USD)</th>
                </tr>
              </thead>
              <tbody>
                {countryBreakdown.map((row) => (
                  <tr key={row.country}>
                    <td>{formatCountryName(row.country)}</td>
                    <td>{row.orders}</td>
                    <td>{row.currency}</td>
                    <td>{formatCurrencyAmount(row.amountLocal, row.currency)}</td>
                    <td>
                      <DualKpiValue amountInInr={row.amountInr} loading={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fin-charts-grid">
        <div className="fin-card">
          <h3>Revenue vs Expense ({displayCurrency})</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartRevenueExpense}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={moneyTip} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="fin-card">
          <h3>Monthly Profit Trend ({displayCurrency})</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartMonthlyProfit}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={moneyTip} />
                  <Legend />
                  <Line type="monotone" dataKey="profit" stroke="#6B3894" strokeWidth={2} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="fin-card">
          <h3>Expense by Category ({displayCurrency})</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={chartExpenseCats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {chartExpenseCats.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={moneyTip} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="fin-card">
        <h3>Recent Transactions</h3>
        {!loading && !(data?.recentTransactions || []).length ? <FinanceEmpty /> : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr><th>Type</th><th>Ref</th><th>Party</th><th>Date</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(data?.recentTransactions || []).map((t) => (
                  <tr key={`${t.type}-${t.id}`}>
                    <td>{t.type}</td><td>{t.ref}</td><td>{t.party}</td>
                    <td>{formatDate(t.date)}</td>
                    <td><DualKpiValue amountInInr={t.amount} loading={false} /></td>
                    <td>{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default FinanceDashboard;
