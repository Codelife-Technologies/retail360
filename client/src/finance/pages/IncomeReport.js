import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { financeAPI } from '../services/financeApi';
import {
  FinanceKpiCard, FinanceFilters, FinanceEmpty, FinanceToast,
} from '../components/FinanceShared';
import {
  formatCurrency, formatDate, toInputDate, financialYearOptions,
} from '../utils/financeUtils';

const PIE_COLORS = ['#6B3894', '#10b981', '#f59e0b', '#3b82f6', '#ef4444'];

const emptyForm = () => ({
  date: toInputDate(new Date()),
  voucherNo: '',
  incomeType: 'Other Income',
  customer: '',
  description: '',
  amount: '',
  gst: '',
  status: 'Received',
  department: '',
});

function IncomeReport() {
  const { hasPermission } = useAuth();
  const canWrite =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.income.create');
  const canUpdate =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.income.update');
  const canDelete =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.income.delete');

  const fyOptions = useMemo(() => financialYearOptions(), []);
  const [filters, setFilters] = useState({ fyOptions, paymentStatus: '', search: '', customer: '' });
  const [meta, setMeta] = useState({ incomeTypes: [], incomeStatuses: [] });
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    financeAPI.getMeta().then((res) => setMeta(res.data || {})).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        paymentStatus: filters.paymentStatus,
        search: filters.search,
        customer: filters.customer,
        page,
        limit: 15,
      };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await financeAPI.getIncome(params);
      setPayload(res.data);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load income report');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cards = payload?.cards || {};
  const rows = payload?.data || [];
  const pagination = payload?.pagination;

  const hasActiveFilters = useMemo(
    () => !!(filters.dateFrom || filters.dateTo || filters.month || filters.financialYear || filters.paymentStatus || filters.search || filters.customer),
    [filters]
  );

  const openFilters = () => {
    setDraftFilters({ ...filters });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setPage(1);
    setFilters(draftFilters);
    setShowFilters(false);
  };

  const clearFilters = () => {
    const cleared = { fyOptions, paymentStatus: '', search: '', customer: '' };
    setDraftFilters(cleared);
    setPage(1);
    setFilters(cleared);
    setShowFilters(false);
  };

  const openAdd = () => {
    setEditing(null);
    setViewOnly(false);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (row, readOnly = false) => {
    setEditing(row);
    setViewOnly(readOnly);
    setForm({
      date: toInputDate(row.date),
      voucherNo: row.invoiceNo === '—' ? '' : row.invoiceNo || '',
      incomeType: row.incomeType || row.salesChannel || 'Other Income',
      customer: row.customer === '—' ? '' : row.customer || '',
      description: row.description || '',
      amount: row.revenue ?? '',
      gst: row.gst ?? '',
      status: row.paymentStatus || 'Received',
      department: row.department || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (viewOnly) return;
    try {
      const body = {
        ...form,
        amount: Number(form.amount) || 0,
        gst: Number(form.gst) || 0,
      };
      if (editing) await financeAPI.updateOtherIncome(editing._id, body);
      else await financeAPI.createOtherIncome(body);
      setShowModal(false);
      setToast(editing ? 'Income updated' : 'Income added');
      window.setTimeout(() => setToast(''), 2000);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete income entry ${row.invoiceNo}?`)) return;
    try {
      await financeAPI.deleteOtherIncome(row._id);
      setToast('Income deleted');
      window.setTimeout(() => setToast(''), 2000);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const exportReport = async (format) => {
    try {
      await financeAPI.exportIncome({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        paymentStatus: filters.paymentStatus,
        format,
      });
      setToast(`Exported as ${format.toUpperCase()}`);
      window.setTimeout(() => setToast(''), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    }
  };

  const printPage = () => window.print();

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Income Report</h1>
          <p className="fin-subtitle">Gross and net revenue from sales channels, customers, and manual income entries.</p>
        </div>
        <div className="fin-actions">
          {canWrite ? (
            <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Income</button>
          ) : null}
          <button
            type="button"
            className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
            onClick={openFilters}
          >
            Filters{hasActiveFilters ? ' •' : ''}
          </button>
          <button type="button" className="fin-btn" onClick={() => exportReport('xlsx')}>Export Excel</button>
          <button type="button" className="fin-btn" onClick={() => exportReport('pdf')}>PDF</button>
          <button type="button" className="fin-btn" onClick={printPage}>Print</button>
        </div>
      </div>

      <FinanceToast message={toast} />

      <div className="fin-kpi-grid">
        <FinanceKpiCard loading={loading} label="Gross Revenue" value={formatCurrency(cards.grossRevenue)} tone="success" />
        <FinanceKpiCard loading={loading} label="Net Revenue" value={formatCurrency(cards.netRevenue)} tone="info" />
        <FinanceKpiCard loading={loading} label="Product Sales" value={formatCurrency(cards.productSales)} tone="info" />
        <FinanceKpiCard loading={loading} label="Service Income" value={formatCurrency(cards.serviceIncome)} tone="warning" />
        <FinanceKpiCard loading={loading} label="GST Collected" value={formatCurrency(cards.gstCollected)} tone="warning" />
        <FinanceKpiCard loading={loading} label="Other Income" value={formatCurrency(cards.otherIncome)} tone="success" />
      </div>

      <div className="fin-charts-grid fin-charts-grid-3">
        <div className="fin-card">
          <h3>Monthly Revenue</h3>
          <div className="fin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={payload?.charts?.monthlyRevenue || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" /><YAxis /><Tooltip />
                <Bar dataKey="revenue" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="fin-card">
          <h3>Revenue by Sales Channel</h3>
          <div className="fin-chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={payload?.charts?.revenueByChannel || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                  {(payload?.charts?.revenueByChannel || []).map((e, i) => (
                    <Cell key={e.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="fin-card">
        <h3>Income Table</h3>
        {loading ? <div className="fin-skeleton-list">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="fin-skeleton-row" />)}</div>
          : rows.length === 0 ? (
            <FinanceEmpty
              title="No income records"
              subtitle={canWrite ? 'Sales and manual income entries will appear here.' : 'No income records match your filters.'}
              action={canWrite ? (
                <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Income</button>
              ) : null}
            />
          )
            : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Source</th><th>Invoice No</th><th>Order No</th><th>Customer</th><th>Type / Channel</th>
                      <th>Date</th><th>Revenue</th><th>GST</th><th>Discount</th><th>Net Amount</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.source}-${r._id}`}>
                        <td data-label="Source">{r.source === 'manual' ? 'Manual' : 'Sale'}</td>
                        <td data-label="Invoice No">{r.invoiceNo}</td>
                        <td data-label="Order No">{r.orderNo}</td>
                        <td data-label="Customer">{r.customer}</td>
                        <td data-label="Type / Channel">{r.salesChannel}</td>
                        <td data-label="Date">{formatDate(r.date)}</td>
                        <td data-label="Revenue">{formatCurrency(r.revenue)}</td>
                        <td data-label="GST">{formatCurrency(r.gst)}</td>
                        <td data-label="Discount">{formatCurrency(r.discount)}</td>
                        <td data-label="Net Amount">{formatCurrency(r.netAmount)}</td>
                        <td data-label="Status">{r.paymentStatus}</td>
                        <td data-label="Actions">
                          {r.source === 'manual' ? (
                            <div className="fin-row-actions">
                              <button type="button" className="fin-link" onClick={() => openEdit(r, true)}>View</button>
                              {canUpdate ? <button type="button" className="fin-link" onClick={() => openEdit(r, false)}>Edit</button> : null}
                              {canDelete ? <button type="button" className="fin-link danger" onClick={() => handleDelete(r)}>Delete</button> : null}
                            </div>
                          ) : (
                            <span className="fin-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {pagination ? (
          <div className="fin-pagination">
            <button type="button" className="fin-btn" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
            <button type="button" className="fin-btn" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        ) : null}
      </div>

      {showModal ? (
        <div className="fin-modal-backdrop">
          <div className="fin-modal">
            <div className="fin-modal-header">
              <h2>{viewOnly ? 'View' : editing ? 'Edit' : 'Add'} Income</h2>
              <button type="button" className="fin-link" onClick={() => setShowModal(false)}>Close</button>
            </div>
            <form className="fin-form" onSubmit={handleSave}>
              <div className="fin-form-grid">
                <label className="fin-field"><span>Date</span>
                  <input className="fin-input" type="date" disabled={viewOnly} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </label>
                <label className="fin-field"><span>Voucher / Invoice No</span>
                  <input
                    className="fin-input"
                    disabled={viewOnly}
                    placeholder="Auto-generated if left blank"
                    value={form.voucherNo}
                    onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  />
                </label>
                <label className="fin-field"><span>Income Type</span>
                  <select className="fin-input" disabled={viewOnly} value={form.incomeType} onChange={(e) => setForm({ ...form, incomeType: e.target.value })}>
                    {(meta.incomeTypes || ['Service Income', 'Other Income', 'Interest Income', 'Commission']).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="fin-field"><span>Customer</span>
                  <input className="fin-input" disabled={viewOnly} value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
                </label>
                <label className="fin-field"><span>Amount</span>
                  <input className="fin-input" type="number" disabled={viewOnly} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </label>
                <label className="fin-field"><span>GST</span>
                  <input className="fin-input" type="number" disabled={viewOnly} value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} />
                </label>
                <label className="fin-field"><span>Status</span>
                  <select className="fin-input" disabled={viewOnly} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {(meta.incomeStatuses || ['Pending', 'Received', 'Cancelled']).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="fin-field"><span>Department</span>
                  <input className="fin-input" disabled={viewOnly} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </label>
                <label className="fin-field full"><span>Description</span>
                  <textarea className="fin-input" rows={3} disabled={viewOnly} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </label>
              </div>
              {!viewOnly ? (
                <div className="fin-modal-actions">
                  <button type="button" className="fin-btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="fin-btn fin-btn-primary">Save</button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {showFilters && draftFilters ? (
        <div className="fin-modal-backdrop">
          <div className="fin-modal fin-filter-modal">
            <div className="fin-modal-header">
              <h2>Filter Income</h2>
              <button type="button" className="fin-link" onClick={() => setShowFilters(false)}>Close</button>
            </div>
            <div className="fin-filter-modal-body">
              <FinanceFilters
                filters={draftFilters}
                onChange={setDraftFilters}
                showStatus
                statusOptions={['pending', 'paid', 'partial', 'received', 'cancelled']}
                extra={(
                  <>
                    <input
                      className="fin-input"
                      placeholder="Search…"
                      value={draftFilters.search || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                    />
                    <input
                      className="fin-input"
                      placeholder="Customer"
                      value={draftFilters.customer || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, customer: e.target.value })}
                    />
                  </>
                )}
              />
            </div>
            <div className="fin-modal-actions">
              <button type="button" className="fin-btn" onClick={clearFilters}>Clear</button>
              <button type="button" className="fin-btn fin-btn-primary" onClick={applyFilters}>Apply Filters</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default IncomeReport;
