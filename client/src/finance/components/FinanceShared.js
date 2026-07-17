import React from 'react';

export function FinanceKpiCard({ label, value, tone = 'info', loading }) {
  if (loading) return <div className="fin-skeleton-card" />;
  return (
    <div className={`fin-kpi-card ${tone}`}>
      <div className="fin-kpi-body">
        <h3>{value}</h3>
        <p>{label}</p>
      </div>
    </div>
  );
}

export function FinanceFilters({
  filters,
  onChange,
  showStatus,
  statusOptions = [],
  showCategory,
  categoryOptions = [],
  extra,
}) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="fin-toolbar">
      <input
        type="date"
        className="fin-input"
        title="From"
        value={filters.dateFrom || ''}
        onChange={(e) => set('dateFrom', e.target.value)}
      />
      <input
        type="date"
        className="fin-input"
        title="To"
        value={filters.dateTo || ''}
        onChange={(e) => set('dateTo', e.target.value)}
      />
      <input
        type="month"
        className="fin-input"
        title="Month"
        value={filters.month || ''}
        onChange={(e) => set('month', e.target.value)}
      />
      <select
        className="fin-input"
        value={filters.financialYear || ''}
        onChange={(e) => set('financialYear', e.target.value)}
      >
        <option value="">Financial Year</option>
        {(filters.fyOptions || []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {showCategory ? (
        <select
          className="fin-input"
          value={filters.category || ''}
          onChange={(e) => set('category', e.target.value)}
        >
          <option value="">All Categories</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : null}
      {showStatus ? (
        <select
          className="fin-input"
          value={filters.status || filters.paymentStatus || ''}
          onChange={(e) =>
            set(filters.status !== undefined || showStatus === 'status' ? 'status' : 'paymentStatus', e.target.value)
          }
        >
          <option value="">All Status</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}
      {extra}
    </div>
  );
}

export function FinanceInsights({ insights, include }) {
  if (!insights) return null;
  const all = [
    ['Highest Revenue Month', insights.highestRevenueMonth],
    ['Highest Expense Category', insights.highestExpenseCategory],
    ['Most Profitable Product', insights.mostProfitableProduct],
    ['Least Profitable Product', insights.leastProfitableProduct],
    ['Top Sales Channel', insights.highestRevenueSalesChannel],
    ['Revenue Growth', `${insights.revenueGrowthPct ?? 0}%`],
    ['Expense Growth', `${insights.expenseGrowthPct ?? 0}%`],
    ['Profit Growth', `${insights.profitGrowthPct ?? 0}%`],
  ];
  const items = include?.length ? all.filter(([label]) => include.includes(label)) : all;
  if (!items.length) return null;
  return (
    <div className="fin-insights">
      {items.map(([label, value]) => (
        <div key={label} className="fin-insight-chip">
          <span>{label}</span>
          <strong>{value || '—'}</strong>
        </div>
      ))}
    </div>
  );
}

export function FinanceEmpty({ title = 'No data', subtitle = 'Try adjusting filters or add records.', action = null }) {
  return (
    <div className="fin-empty">
      <div className="fin-empty-icon">📭</div>
      <h3>{title}</h3>
      <p>{subtitle}</p>
      {action ? <div className="fin-empty-actions">{action}</div> : null}
    </div>
  );
}

export function FinanceToast({ message }) {
  if (!message) return null;
  return <div className="fin-toast">{message}</div>;
}
