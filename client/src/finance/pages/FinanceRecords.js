import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { financeAPI } from '../services/financeApi';
import {
  FinanceKpiCard, FinanceFilters, FinanceEmpty, FinanceToast,
} from '../components/FinanceShared';
import {
  formatCurrency, formatDate, financialYearOptions,
} from '../utils/financeUtils';

const RECORD_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'Sale', label: 'Sales' },
  { value: 'Income', label: 'Income' },
  { value: 'Expense', label: 'Expenses' },
  { value: 'Purchase', label: 'Purchases' },
];

const TYPE_CLASS = {
  Sale: 'fin-type-sale',
  Income: 'fin-type-income',
  Expense: 'fin-type-expense',
  Purchase: 'fin-type-purchase',
};

function FinanceRecords() {
  const fyOptions = useMemo(() => financialYearOptions(), []);
  const [filters, setFilters] = useState({
    fyOptions,
    type: '',
    status: '',
    search: '',
  });
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        type: filters.type,
        status: filters.status,
        search: filters.search,
        page,
        limit: 25,
      };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await financeAPI.getRecords(params);
      setPayload(res.data);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load finance records');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cards = payload?.cards || {};
  const rows = payload?.data || [];
  const pagination = payload?.pagination;

  const hasActiveFilters = useMemo(
    () => !!(
      filters.dateFrom
      || filters.dateTo
      || filters.month
      || filters.financialYear
      || filters.type
      || filters.status
      || filters.search
    ),
    [filters]
  );

  const openFilters = () => {
    setDraftFilters({ ...filters });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setPage(1);
    setFilters(draftFilters || { fyOptions, type: '', status: '', search: '' });
    setShowFilters(false);
  };

  const clearFilters = () => {
    const cleared = { fyOptions, type: '', status: '', search: '' };
    setDraftFilters(cleared);
    setPage(1);
    setFilters(cleared);
    setShowFilters(false);
  };

  const exportReport = async (format) => {
    try {
      const params = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        type: filters.type,
        status: filters.status,
        search: filters.search,
        format,
      };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      await financeAPI.exportRecords(params);
      setToast(`Exported records as ${format.toUpperCase()}`);
      window.setTimeout(() => setToast(''), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    }
  };

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Finance Records</h1>
          <p className="fin-subtitle">
            All income, expense, sales, and purchase records in one place.
          </p>
        </div>
        <div className="fin-actions">
          <button
            type="button"
            className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
            onClick={openFilters}
          >
            Filters{hasActiveFilters ? ' •' : ''}
          </button>
          <button type="button" className="fin-btn" onClick={() => exportReport('xlsx')}>
            Export Excel
          </button>
          <button type="button" className="fin-btn" onClick={() => exportReport('csv')}>
            CSV
          </button>
          <button type="button" className="fin-btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <FinanceToast message={toast} />

      <div className="fin-kpi-grid">
        <FinanceKpiCard loading={loading} label="Sales" value={formatCurrency(cards.salesTotal)} tone="success" />
        <FinanceKpiCard loading={loading} label="Other Income" value={formatCurrency(cards.incomeTotal)} tone="info" />
        <FinanceKpiCard loading={loading} label="Expenses" value={formatCurrency(cards.expenseTotal)} tone="danger" />
        <FinanceKpiCard loading={loading} label="Purchases" value={formatCurrency(cards.purchaseTotal)} tone="warning" />
        <FinanceKpiCard loading={loading} label="Total Records" value={cards.recordCount ?? 0} tone="info" />
      </div>

      <div className="fin-card">
        <div className="fin-records-toolbar">
          <h3>All Records</h3>
          <div className="fin-type-filters">
            {RECORD_TYPES.map((opt) => (
              <button
                key={opt.value || 'all'}
                type="button"
                className={`fin-btn fin-btn-sm${(filters.type || '') === opt.value ? ' fin-btn-primary' : ''}`}
                onClick={() => {
                  setPage(1);
                  setFilters((f) => ({ ...f, type: opt.value }));
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="fin-skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="fin-skeleton-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <FinanceEmpty
            title="No records found"
            subtitle="Sales, income, expenses, and purchases matching your filters will appear here."
          />
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Party</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Tax</th>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Type">
                      <span className={`fin-type-badge ${TYPE_CLASS[r.type] || ''}`}>{r.type}</span>
                    </td>
                    <td data-label="Reference">{r.ref}</td>
                    <td data-label="Party">{r.party}</td>
                    <td data-label="Category">{r.category}</td>
                    <td data-label="Date">{formatDate(r.date)}</td>
                    <td data-label="Amount">{formatCurrency(r.amount)}</td>
                    <td data-label="Tax">{formatCurrency(r.tax)}</td>
                    <td data-label="Status">{r.status}</td>
                    <td data-label="Description">{r.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination ? (
          <div className="fin-pagination">
            <button
              type="button"
              className="fin-btn"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
              {pagination.total != null ? ` · ${pagination.total} records` : ''}
            </span>
            <button
              type="button"
              className="fin-btn"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {showFilters && draftFilters ? (
        <div className="fin-modal-backdrop">
          <div className="fin-modal fin-filter-modal">
            <div className="fin-modal-header">
              <h2>Filter Finance Records</h2>
              <button type="button" className="fin-link" onClick={() => setShowFilters(false)}>
                Close
              </button>
            </div>
            <div className="fin-filter-modal-body">
              <FinanceFilters
                filters={draftFilters}
                onChange={setDraftFilters}
                extra={(
                  <>
                    <select
                      className="fin-input"
                      value={draftFilters.type || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, type: e.target.value })}
                    >
                      {RECORD_TYPES.map((opt) => (
                        <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <input
                      className="fin-input"
                      placeholder="Status"
                      value={draftFilters.status || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}
                    />
                    <input
                      className="fin-input"
                      placeholder="Search ref, party, category…"
                      value={draftFilters.search || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                    />
                  </>
                )}
              />
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

export default FinanceRecords;
