import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { financeAPI } from '../services/financeApi';
import {
  FinanceKpiCard, FinanceFilters, FinanceEmpty, FinanceToast,
} from '../components/FinanceShared';
import { formatCurrency, formatPct, financialYearOptions } from '../utils/financeUtils';

function ProfitLoss() {
  const fyOptions = useMemo(() => financialYearOptions(), []);
  const [filters, setFilters] = useState({ fyOptions });
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const params = { ...filters };
        delete params.fyOptions;
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        const res = await financeAPI.getPnl(params);
        if (alive) setData(res.data);
      } catch (e) {
        if (alive) setToast(e.response?.data?.error || 'Failed to load P&L');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filters]);

  const kpis = data?.kpis || {};

  const hasActiveFilters = useMemo(
    () => !!(filters.dateFrom || filters.dateTo || filters.month || filters.financialYear),
    [filters]
  );

  const openFilters = () => {
    setDraftFilters({ ...filters });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters || { fyOptions });
    setShowFilters(false);
  };

  const clearFilters = () => {
    const cleared = { fyOptions };
    setDraftFilters(cleared);
    setFilters(cleared);
    setShowFilters(false);
  };

  const exportReport = async (format) => {
    try {
      await financeAPI.exportPnl({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        format,
      });
      setToast(`Exported as ${format.toUpperCase()}`);
      window.setTimeout(() => setToast(''), 2000);
    } catch (e) {
      alert('Export failed');
    }
  };

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Profit &amp; Loss</h1>
          <p className="fin-subtitle">Automated P&amp;L from sales, purchases, expenses and payroll.</p>
        </div>
        <div className="fin-actions">
          <button
            type="button"
            className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
            onClick={openFilters}
          >
            Filters{hasActiveFilters ? ' •' : ''}
          </button>
          <button type="button" className="fin-btn" onClick={() => exportReport('xlsx')}>Excel</button>
          <button type="button" className="fin-btn" onClick={() => exportReport('pdf')}>PDF</button>
          <button type="button" className="fin-btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <FinanceToast message={toast} />

      <div className="fin-kpi-grid">
        <FinanceKpiCard loading={loading} label="Gross Profit" value={formatCurrency(kpis.grossProfit)} tone="success" />
        <FinanceKpiCard loading={loading} label="Net Profit" value={formatCurrency(kpis.netProfit)} tone="info" />
        <FinanceKpiCard loading={loading} label="Gross Margin %" value={formatPct(kpis.grossMarginPct)} tone="info" />
        <FinanceKpiCard loading={loading} label="Net Margin %" value={formatPct(kpis.netMarginPct)} tone="warning" />
        <FinanceKpiCard loading={loading} label="COGS" value={formatCurrency(kpis.cogs)} tone="danger" />
        <FinanceKpiCard loading={loading} label="Operating Expense" value={formatCurrency(kpis.operatingExpense)} tone="warning" />
      </div>

      <div className="fin-charts-grid">
        <div className="fin-card">
          <h3>Revenue vs Expense</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data?.charts?.revenueVsExpense || []}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="fin-card">
          <h3>Gross Profit Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data?.charts?.grossProfitTrend || []}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip />
              <Line type="monotone" dataKey="grossProfit" stroke="#6B3894" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="fin-card">
          <h3>Net Profit Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data?.charts?.netProfitTrend || []}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip />
              <Line type="monotone" dataKey="netProfit" stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="fin-card">
        <h3>Profit Summary</h3>
        {loading ? <div className="fin-skeleton-list">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="fin-skeleton-row" />)}</div>
          : !(data?.summary || []).length ? <FinanceEmpty />
            : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead><tr><th>Particular</th><th>Amount</th></tr></thead>
                  <tbody>
                    {(data?.summary || []).map((row) => (
                      <tr key={row.particular} className={['Gross Profit', 'Net Profit', 'Operating Profit'].includes(row.particular) ? 'fin-row-emphasis' : undefined}>
                        <td data-label="Particular">{row.particular}</td>
                        <td data-label="Amount">{formatCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {showFilters && draftFilters ? (
        <div className="fin-modal-backdrop">
          <div className="fin-modal fin-filter-modal">
            <div className="fin-modal-header">
              <h2>Filter P&amp;L</h2>
              <button type="button" className="fin-link" onClick={() => setShowFilters(false)}>Close</button>
            </div>
            <div className="fin-filter-modal-body">
              <FinanceFilters filters={draftFilters} onChange={setDraftFilters} />
            </div>
            <div className="fin-modal-actions">
              <button type="button" className="fin-btn" onClick={clearFilters}>Clear</button>
              <button type="button" className="fin-btn fin-btn-primary" onClick={applyFilters}>Apply</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProfitLoss;
