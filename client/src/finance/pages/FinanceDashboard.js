import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { financeAPI } from '../services/financeApi';
import {
  FinanceKpiCard, FinanceInsights, FinanceEmpty, FinanceToast,
} from '../components/FinanceShared';
import {
  formatCurrency, formatPct, formatDate,
} from '../utils/financeUtils';

const PIE_COLORS = ['#6B3894', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#8b5cf6'];

const DASHBOARD_INSIGHTS = ['Highest Revenue Month', 'Highest Expense Category'];

function currentYearRange() {
  const year = new Date().getFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    year,
  };
}

function FinanceDashboard() {
  const yearParams = useMemo(() => currentYearRange(), []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await financeAPI.getDashboard({
          dateFrom: yearParams.dateFrom,
          dateTo: yearParams.dateTo,
        });
        if (alive) setData(res.data);
      } catch (e) {
        if (alive) {
          setData(null);
          setToast(e.response?.data?.error || 'Failed to load finance dashboard');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [yearParams]);

  const kpis = data?.kpis || {};

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Finance Dashboard</h1>
          <p className="fin-subtitle">
            Revenue, expenses, and margin overview for {yearParams.year}.
          </p>
        </div>
      </div>

      <FinanceToast message={toast} />

      <div className="fin-kpi-grid">
        <FinanceKpiCard loading={loading} label="Total Revenue" value={formatCurrency(kpis.totalRevenue)} tone="success" />
        <FinanceKpiCard loading={loading} label="Total Expenses" value={formatCurrency(kpis.totalExpenses)} tone="danger" />
        <FinanceKpiCard loading={loading} label="Gross Profit" value={formatCurrency(kpis.grossProfit)} tone="info" />
        <FinanceKpiCard loading={loading} label="Net Profit" value={formatCurrency(kpis.netProfit)} tone="success" />
        <FinanceKpiCard loading={loading} label="Gross Margin %" value={formatPct(kpis.grossMarginPct)} tone="info" />
        <FinanceKpiCard loading={loading} label="Net Margin %" value={formatPct(kpis.netMarginPct)} tone="warning" />
        <FinanceKpiCard loading={loading} label="Total Purchase Cost" value={formatCurrency(kpis.totalPurchaseCost)} tone="warning" />
      </div>

      <FinanceInsights insights={data?.insights} include={DASHBOARD_INSIGHTS} />

      <div className="fin-charts-grid">
        <div className="fin-card">
          <h3>Revenue vs Expense</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data?.charts?.revenueVsExpense || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="fin-card">
          <h3>Monthly Profit Trend</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data?.charts?.monthlyProfit || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="profit" stroke="#6B3894" strokeWidth={2} name="Profit" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="fin-card">
          <h3>Expense by Category</h3>
          <div className="fin-chart-wrap">
            {loading ? <div className="fin-skeleton-chart" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={data?.charts?.expenseByCategory || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {(data?.charts?.expenseByCategory || []).map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
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
                    <td>{formatDate(t.date)}</td><td>{formatCurrency(t.amount)}</td><td>{t.status}</td>
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
