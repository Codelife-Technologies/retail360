import React from 'react';
import { FIN_PERIOD_OPTIONS, formatFinPeriodLabel } from '../utils/financeUtils';

export function FinanceKpiCard({ label, value, tone = 'info', loading, onClick, title }) {
  if (loading) return <div className="fin-skeleton-card" />;
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`fin-kpi-card ${tone}${clickable ? ' clickable' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title || (clickable ? `Go to ${label}` : undefined)}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
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
    <div className="fin-toolbar fin-filters-grid">
      <label className="fin-field">
        <span>From Date</span>
        <input
          type="date"
          className="fin-input"
          value={filters.dateFrom || ''}
          onChange={(e) => set('dateFrom', e.target.value)}
        />
      </label>
      <label className="fin-field">
        <span>To Date</span>
        <input
          type="date"
          className="fin-input"
          value={filters.dateTo || ''}
          onChange={(e) => set('dateTo', e.target.value)}
        />
      </label>
      <label className="fin-field">
        <span>Month</span>
        <input
          type="month"
          className="fin-input"
          value={filters.month || ''}
          onChange={(e) => set('month', e.target.value)}
        />
      </label>
      <label className="fin-field">
        <span>Financial Year</span>
        <select
          className="fin-input"
          value={filters.financialYear || ''}
          onChange={(e) => set('financialYear', e.target.value)}
        >
          <option value="">All</option>
          {(filters.fyOptions || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {showCategory ? (
        <label className="fin-field">
          <span>Category</span>
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
        </label>
      ) : null}
      {showStatus ? (
        <label className="fin-field">
          <span>Status</span>
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
        </label>
      ) : null}
      {extra}
    </div>
  );
}

export function FinancePeriodToggle({
  period,
  dateFrom,
  dateTo,
  onPeriodChange,
  onCustomDateChange,
  showHint = true,
  extra = null,
}) {
  return (
    <div className="fin-period-bar">
      <div className="fin-period-row">
        <div className="fin-period-toggle">
          {FIN_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={period === opt.id ? 'active' : ''}
              onClick={() => onPeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {extra}
      </div>
      {period === 'custom' ? (
        <div className="fin-period-custom">
          <input
            type="date"
            className="fin-input"
            value={dateFrom || ''}
            max={dateTo || undefined}
            onChange={(e) => onCustomDateChange({ dateFrom: e.target.value })}
            title="From date"
          />
          <input
            type="date"
            className="fin-input"
            value={dateTo || ''}
            min={dateFrom || undefined}
            onChange={(e) => onCustomDateChange({ dateTo: e.target.value })}
            title="To date"
          />
        </div>
      ) : null}
      {showHint ? (
        <p className="fin-period-hint">
          Showing: <strong>{formatFinPeriodLabel(period, dateFrom, dateTo)}</strong>
        </p>
      ) : null}
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
