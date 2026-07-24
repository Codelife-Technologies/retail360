import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ExcelUpload from '../../components/ExcelUpload';
import { financeAPI } from '../services/financeApi';
import {
  FinanceFilters, FinanceEmpty, FinanceToast, FinancePeriodToggle,
} from '../components/FinanceShared';
import {
  formatCurrency, formatDate, toInputDate, financialYearOptions,
  financeBillUrl, buildFinanceFormData, getFinPeriodRange,
} from '../utils/financeUtils';

const PRESET_INCOME_TYPES = ['Service Income', 'Other Income', 'Interest Income', 'Commission'];
const OTHER_TYPE_VALUE = '__other__';

const emptyForm = () => ({
  date: toInputDate(new Date()),
  voucherNo: '',
  incomeTypeSelect: 'Other Income',
  customIncomeType: '',
  customer: '',
  description: '',
  amount: '',
  gst: '',
  status: 'Received',
  department: '',
});

function resolveIncomeTypeFields(incomeType, presets = PRESET_INCOME_TYPES) {
  const value = String(incomeType || '').trim();
  if (presets.includes(value)) {
    return { incomeTypeSelect: value, customIncomeType: '' };
  }
  return { incomeTypeSelect: OTHER_TYPE_VALUE, customIncomeType: value };
}

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
  const defaultRange = useMemo(() => getFinPeriodRange('month'), []);
  const [filters, setFilters] = useState({
    fyOptions,
    period: 'month',
    dateFrom: defaultRange.dateFrom,
    dateTo: defaultRange.dateTo,
    salesChannel: '',
    paymentStatus: '',
    search: '',
    customer: '',
  });
  const [salesChannels, setSalesChannels] = useState([]);
  const [meta, setMeta] = useState({ incomeTypes: [], incomeStatuses: [] });
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [billFile, setBillFile] = useState(null);
  const [existingBill, setExistingBill] = useState(null);
  const [removeBill, setRemoveBill] = useState(false);

  useEffect(() => {
    financeAPI.getMeta().then((res) => {
      const data = res.data || {};
      setMeta(data);
      const channels = Array.isArray(data.salesChannels) ? data.salesChannels : [];
      setSalesChannels(channels);
    }).catch(() => {
      setMeta({});
      setSalesChannels([]);
    });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        salesChannel: filters.salesChannel,
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

  const rows = payload?.data || [];
  const pagination = payload?.pagination;

  const incomeTypeOptions = useMemo(() => {
    const list = meta.incomeTypes?.length ? meta.incomeTypes : PRESET_INCOME_TYPES;
    return list.filter((t) => t && t !== 'Other');
  }, [meta.incomeTypes]);

  const hasActiveFilters = useMemo(
    () => !!(filters.dateFrom || filters.dateTo || filters.month || filters.financialYear || filters.salesChannel || filters.paymentStatus || filters.search || filters.customer),
    [filters]
  );

  const openFilters = () => {
    setDraftFilters({ ...filters });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setPage(1);
    setFilters({ ...draftFilters, period: 'custom' });
    setShowFilters(false);
  };

  const clearFilters = () => {
    const range = getFinPeriodRange('month');
    const cleared = {
      fyOptions,
      period: 'month',
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      salesChannel: '',
      paymentStatus: '',
      search: '',
      customer: '',
    };
    setDraftFilters(cleared);
    setPage(1);
    setFilters(cleared);
    setShowFilters(false);
  };

  const handlePeriodChange = (periodId) => {
    setPage(1);
    if (periodId === 'custom') {
      setFilters((f) => ({
        ...f,
        period: 'custom',
        month: '',
        financialYear: '',
      }));
      return;
    }
    const range = getFinPeriodRange(periodId);
    setFilters((f) => ({
      ...f,
      period: periodId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      month: '',
      financialYear: '',
    }));
  };

  const handleCustomDateChange = (patch) => {
    setPage(1);
    setFilters((f) => ({
      ...f,
      period: 'custom',
      month: '',
      financialYear: '',
      ...patch,
    }));
  };

  const openAdd = () => {
    setEditing(null);
    setViewOnly(false);
    setForm(emptyForm());
    setBillFile(null);
    setExistingBill(null);
    setRemoveBill(false);
    setShowModal(true);
  };

  const openEdit = (row, readOnly = false) => {
    setEditing(row);
    setViewOnly(readOnly);
    const typeFields = resolveIncomeTypeFields(
      row.incomeType || row.salesChannel || 'Other Income',
      incomeTypeOptions
    );
    setForm({
      date: toInputDate(row.date),
      voucherNo: row.invoiceNo === '—' ? '' : row.invoiceNo || '',
      ...typeFields,
      customer: row.customer === '—' ? '' : row.customer || '',
      description: row.description || '',
      amount: row.revenue ?? '',
      gst: row.gst ?? '',
      status: row.paymentStatus || 'Received',
      department: row.department || '',
    });
    setBillFile(null);
    setExistingBill(row.bill?.filePath ? row.bill : null);
    setRemoveBill(false);
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (viewOnly) return;
    const incomeType = form.incomeTypeSelect === OTHER_TYPE_VALUE
      ? String(form.customIncomeType || '').trim()
      : form.incomeTypeSelect;
    if (!incomeType) {
      alert(form.incomeTypeSelect === OTHER_TYPE_VALUE
        ? 'Please enter a custom income type'
        : 'Please select an income type');
      return;
    }
    try {
      const body = {
        date: form.date,
        voucherNo: form.voucherNo,
        incomeType,
        customer: form.customer,
        description: form.description,
        amount: Number(form.amount) || 0,
        gst: Number(form.gst) || 0,
        status: form.status,
        department: form.department,
      };
      const payload = (billFile || removeBill)
        ? buildFinanceFormData(body, { billFile, removeBill })
        : body;
      if (editing) await financeAPI.updateOtherIncome(editing._id, payload);
      else await financeAPI.createOtherIncome(payload);
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
        salesChannel: filters.salesChannel,
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
          <h1>Income</h1>
        </div>
        <div className="fin-actions">
          {canWrite ? (
            <>
              <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Income</button>
              <button type="button" className="fin-btn" onClick={() => setShowImport(true)}>Import Excel</button>
            </>
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

      <FinancePeriodToggle
        period={filters.period || 'custom'}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onPeriodChange={handlePeriodChange}
        onCustomDateChange={handleCustomDateChange}
        extra={(
          <label className="fin-channel-filter">
            <span>Sales Channel</span>
            <select
              className="fin-input"
              value={filters.salesChannel || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, salesChannel: e.target.value }));
              }}
            >
              <option value="">All Channels</option>
              {salesChannels.map((channel) => (
                <option key={channel._id} value={channel._id}>
                  {channel.name}{channel.code ? ` (${channel.code})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      />

      <div className="fin-card">
        <h3>Income Records</h3>
        {loading ? <div className="fin-skeleton-list">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="fin-skeleton-row" />)}</div>
          : rows.length === 0 ? (
            <FinanceEmpty
              title="No income records"
              subtitle={canWrite ? 'Add income manually or import from Excel. Sales entries also appear here.' : 'No income records match your filters.'}
              action={canWrite ? (
                <div className="fin-empty-actions">
                  <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Income</button>
                  <button type="button" className="fin-btn" onClick={() => setShowImport(true)}>Import Excel</button>
                </div>
              ) : null}
            />
          )
            : (
              <div className="fin-table-wrap">
                <table className="fin-table">
                  <thead>
                    <tr>
                      <th>Source</th><th>Invoice No</th><th>Order No</th><th>Customer</th><th>Type / Channel</th>
                      <th>Date</th><th>Revenue</th><th>GST</th><th>Discount</th><th>Net Amount</th><th>Status</th><th>Bill</th><th>Actions</th>
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
                        <td data-label="Bill">
                          {r.bill?.filePath ? (
                            <a className="fin-link" href={financeBillUrl(r.bill)} target="_blank" rel="noopener noreferrer">
                              View
                            </a>
                          ) : (
                            <span className="fin-muted">—</span>
                          )}
                        </td>
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
                  <select
                    className="fin-input"
                    disabled={viewOnly}
                    value={form.incomeTypeSelect}
                    onChange={(e) => setForm({
                      ...form,
                      incomeTypeSelect: e.target.value,
                      customIncomeType: e.target.value === OTHER_TYPE_VALUE ? form.customIncomeType : '',
                    })}
                  >
                    {incomeTypeOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value={OTHER_TYPE_VALUE}>Other</option>
                  </select>
                </label>
                {form.incomeTypeSelect === OTHER_TYPE_VALUE ? (
                  <label className="fin-field"><span>Custom Income Type</span>
                    <input
                      className="fin-input"
                      disabled={viewOnly}
                      required
                      placeholder="Write new income type"
                      value={form.customIncomeType}
                      onChange={(e) => setForm({ ...form, customIncomeType: e.target.value })}
                    />
                  </label>
                ) : null}
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
                <label className="fin-field full"><span>Bill / Receipt</span>
                  {viewOnly ? (
                    existingBill?.filePath ? (
                      <a className="fin-link" href={financeBillUrl(existingBill)} target="_blank" rel="noopener noreferrer">
                        {existingBill.originalName || 'View bill'}
                      </a>
                    ) : (
                      <span className="fin-muted">No bill attached</span>
                    )
                  ) : (
                    <div className="fin-bill-upload">
                      {existingBill?.filePath && !removeBill && !billFile ? (
                        <div className="fin-bill-current">
                          <a className="fin-link" href={financeBillUrl(existingBill)} target="_blank" rel="noopener noreferrer">
                            {existingBill.originalName || 'Current bill'}
                          </a>
                          <button
                            type="button"
                            className="fin-link danger"
                            onClick={() => { setRemoveBill(true); setBillFile(null); }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                      <input
                        className="fin-input"
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                        onChange={(e) => {
                          setBillFile(e.target.files?.[0] || null);
                          setRemoveBill(false);
                        }}
                      />
                      <span className="fin-muted">PDF or image, max 10 MB</span>
                    </div>
                  )}
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
                    <label className="fin-field">
                      <span>Sales Channel</span>
                      <select
                        className="fin-input"
                        value={draftFilters.salesChannel || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, salesChannel: e.target.value })}
                      >
                        <option value="">All Channels</option>
                        {salesChannels.map((channel) => (
                          <option key={channel._id} value={channel._id}>
                            {channel.name}{channel.code ? ` (${channel.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Search</span>
                      <input
                        className="fin-input"
                        placeholder="Search…"
                        value={draftFilters.search || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                      />
                    </label>
                    <label className="fin-field">
                      <span>Customer</span>
                      <input
                        className="fin-input"
                        placeholder="Customer"
                        value={draftFilters.customer || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, customer: e.target.value })}
                      />
                    </label>
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

      {showImport ? (
        <ExcelUpload
          moduleName="finance/other-income"
          templateEndpoint="/finance/other-income/template"
          mandatoryFieldsHelp={[
            'Date * — income date (YYYY-MM-DD)',
            'Amount * — income amount in INR',
            'Income Type — e.g. Service Income, or any custom type',
            'Voucher No — optional; auto-generated when blank',
          ]}
          onUploadComplete={() => {
            setShowImport(false);
            setToast('Income import completed');
            window.setTimeout(() => setToast(''), 2500);
            fetchData();
          }}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

export default IncomeReport;
