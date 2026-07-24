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

const OTHER_VALUE = '__other__';

const emptyForm = () => ({
  date: toInputDate(new Date()),
  voucherNo: '',
  categorySelect: 'Office',
  customCategory: '',
  subcategorySelect: 'Rent',
  customSubcategory: '',
  vendor: '',
  description: '',
  amount: '',
  gst: '',
  paymentMode: 'Bank Transfer',
  status: 'Paid',
  department: '',
});

function resolveCategoryFields(category, presets = []) {
  const value = String(category || '').trim();
  if (presets.includes(value)) {
    return { categorySelect: value, customCategory: '' };
  }
  if (!value) return { categorySelect: presets[0] || 'Office', customCategory: '' };
  return { categorySelect: OTHER_VALUE, customCategory: value };
}

function resolveSubcategoryFields(subcategory, presets = []) {
  const value = String(subcategory || '').trim();
  if (!value) return { subcategorySelect: '', customSubcategory: '' };
  if (presets.includes(value)) {
    return { subcategorySelect: value, customSubcategory: '' };
  }
  return { subcategorySelect: OTHER_VALUE, customSubcategory: value };
}

function ExpenseReport() {
  const { hasPermission } = useAuth();
  const canWrite =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.expense.create');
  const canUpdate =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.expense.update');
  const canDelete =
    hasPermission('admin.all') ||
    hasPermission('finance.full') ||
    hasPermission('finance.expense.delete');

  const fyOptions = useMemo(() => financialYearOptions(), []);
  const defaultRange = useMemo(() => getFinPeriodRange('month'), []);
  const [filters, setFilters] = useState({
    fyOptions,
    period: 'month',
    dateFrom: defaultRange.dateFrom,
    dateTo: defaultRange.dateTo,
    status: '',
    category: '',
    search: '',
  });
  const [meta, setMeta] = useState({ expenseCategories: {}, paymentModes: [], expenseStatuses: [] });
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
        status: filters.status,
        category: filters.category,
        search: filters.search,
        page,
        limit: 15,
      };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await financeAPI.getExpenses(params);
      setPayload(res.data);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = payload?.data || [];
  const pagination = payload?.pagination;

  const categoryOptions = useMemo(
    () => Object.keys(meta.expenseCategories || {}).filter((c) => c && c !== 'Other'),
    [meta.expenseCategories]
  );

  const subcats = useMemo(() => {
    if (form.categorySelect === OTHER_VALUE) return [];
    return meta.expenseCategories?.[form.categorySelect] || [];
  }, [meta.expenseCategories, form.categorySelect]);

  const hasActiveFilters = useMemo(
    () => !!(filters.dateFrom || filters.dateTo || filters.month || filters.financialYear || filters.status || filters.category || filters.search),
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
      status: '',
      category: '',
      search: '',
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
    const cats = Object.keys(meta.expenseCategories || {}).filter((c) => c && c !== 'Other');
    const categoryFields = resolveCategoryFields(row.category || 'Office', cats);
    const subPreset = categoryFields.categorySelect === OTHER_VALUE
      ? []
      : (meta.expenseCategories?.[categoryFields.categorySelect] || []);
    const subcategoryFields = resolveSubcategoryFields(row.subcategory || '', subPreset);
    setForm({
      date: toInputDate(row.date),
      voucherNo: row.voucherNo || '',
      ...categoryFields,
      ...subcategoryFields,
      vendor: row.vendor || '',
      description: row.description || '',
      amount: row.amount ?? '',
      gst: row.gst ?? '',
      paymentMode: row.paymentMode || 'Bank Transfer',
      status: row.status || 'Paid',
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
    const category = form.categorySelect === OTHER_VALUE
      ? String(form.customCategory || '').trim()
      : form.categorySelect;
    const subcategory = form.subcategorySelect === OTHER_VALUE
      ? String(form.customSubcategory || '').trim()
      : form.subcategorySelect;
    if (!category) {
      alert(form.categorySelect === OTHER_VALUE
        ? 'Please enter a custom category'
        : 'Please select a category');
      return;
    }
    if (form.subcategorySelect === OTHER_VALUE && !subcategory) {
      alert('Please enter a custom subcategory');
      return;
    }
    try {
      const body = {
        date: form.date,
        voucherNo: form.voucherNo,
        category,
        subcategory,
        vendor: form.vendor,
        description: form.description,
        amount: Number(form.amount) || 0,
        gst: Number(form.gst) || 0,
        paymentMode: form.paymentMode,
        status: form.status,
        department: form.department,
      };
      const payload = (billFile || removeBill)
        ? buildFinanceFormData(body, { billFile, removeBill })
        : body;
      if (editing) await financeAPI.updateExpense(editing._id, payload);
      else await financeAPI.createExpense(payload);
      setShowModal(false);
      setToast(editing ? 'Expense updated' : 'Expense added');
      window.setTimeout(() => setToast(''), 2000);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete expense voucher ${row.voucherNo}?`)) return;
    try {
      await financeAPI.deleteExpense(row._id);
      setToast('Expense deleted');
      window.setTimeout(() => setToast(''), 2000);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const exportReport = async (format) => {
    try {
      await financeAPI.exportExpenses({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        month: filters.month,
        financialYear: filters.financialYear,
        category: filters.category,
        status: filters.status,
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
          <h1>Expense</h1>
        </div>
        <div className="fin-actions">
          {canWrite ? (
            <>
              <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Expense</button>
              <button
                type="button"
                className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
                onClick={openFilters}
              >
                Filters{hasActiveFilters ? ' •' : ''}
              </button>
              <button type="button" className="fin-btn" onClick={() => setShowImport(true)}>Import Excel</button>
            </>
          ) : (
            <button
              type="button"
              className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
              onClick={openFilters}
            >
              Filters{hasActiveFilters ? ' •' : ''}
            </button>
          )}
          <button type="button" className="fin-btn" onClick={() => exportReport('xlsx')}>Export Excel</button>
          <button type="button" className="fin-btn" onClick={() => exportReport('pdf')}>PDF</button>
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
            <span>Payment Status</span>
            <select
              className="fin-input"
              value={filters.status || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, status: e.target.value }));
              }}
            >
              <option value="">All Statuses</option>
              {(meta.expenseStatuses || ['Pending', 'Paid', 'Partial', 'Cancelled']).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        )}
      />

      <div className="fin-card">
        <h3>Expense Records</h3>
        {loading ? <div className="fin-skeleton-list">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="fin-skeleton-row" />)}</div>
          : rows.length === 0 ? (
            <FinanceEmpty
              title="No expenses"
              subtitle={canWrite ? 'Add an expense manually or import from Excel to get started.' : 'No expense records match your filters.'}
              action={canWrite ? (
                <div className="fin-empty-actions">
                  <button type="button" className="fin-btn fin-btn-primary" onClick={openAdd}>+ Add Expense</button>
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
                      <th>Date</th><th>Voucher No</th><th>Category</th><th>Vendor</th><th>Description</th>
                      <th>Amount</th><th>GST</th><th>Payment Mode</th><th>Status</th><th>Bill</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r._id}>
                        <td data-label="Date">{formatDate(r.date)}</td>
                        <td data-label="Voucher No">{r.voucherNo}</td>
                        <td data-label="Category">{r.category}{r.subcategory ? ` / ${r.subcategory}` : ''}</td>
                        <td data-label="Vendor">{r.vendor || '—'}</td>
                        <td data-label="Description">{r.description || '—'}</td>
                        <td data-label="Amount">{formatCurrency(r.amount)}</td>
                        <td data-label="GST">{formatCurrency(r.gst)}</td>
                        <td data-label="Payment Mode">{r.paymentMode}</td>
                        <td data-label="Status">{r.status}</td>
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
                          <div className="fin-row-actions">
                            <button type="button" className="fin-link" onClick={() => openEdit(r, true)}>View</button>
                            {canUpdate ? <button type="button" className="fin-link" onClick={() => openEdit(r, false)}>Edit</button> : null}
                            {canDelete ? <button type="button" className="fin-link danger" onClick={() => handleDelete(r)}>Delete</button> : null}
                          </div>
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
              <h2>{viewOnly ? 'View' : editing ? 'Edit' : 'Add'} Expense</h2>
              <button type="button" className="fin-link" onClick={() => setShowModal(false)}>Close</button>
            </div>
            <form className="fin-form" onSubmit={handleSave}>
              <div className="fin-form-grid">
                <label className="fin-field"><span>Date</span>
                  <input className="fin-input" type="date" disabled={viewOnly} required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </label>
                <label className="fin-field"><span>Voucher No</span>
                  <input
                    className="fin-input"
                    disabled={viewOnly}
                    placeholder="Auto-generated if left blank"
                    value={form.voucherNo}
                    onChange={(e) => setForm({ ...form, voucherNo: e.target.value })}
                  />
                </label>
                <label className="fin-field"><span>Category</span>
                  <select
                    className="fin-input"
                    disabled={viewOnly}
                    value={form.categorySelect}
                    onChange={(e) => {
                      const next = e.target.value;
                      const nextSubs = next === OTHER_VALUE ? [] : (meta.expenseCategories?.[next] || []);
                      setForm({
                        ...form,
                        categorySelect: next,
                        customCategory: next === OTHER_VALUE ? form.customCategory : '',
                        subcategorySelect: nextSubs[0] || '',
                        customSubcategory: '',
                      });
                    }}
                  >
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value={OTHER_VALUE}>Other</option>
                  </select>
                </label>
                {form.categorySelect === OTHER_VALUE ? (
                  <label className="fin-field"><span>Custom Category</span>
                    <input
                      className="fin-input"
                      disabled={viewOnly}
                      required
                      placeholder="Write new category"
                      value={form.customCategory}
                      onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className="fin-field"><span>Subcategory</span>
                  <select
                    className="fin-input"
                    disabled={viewOnly}
                    value={form.subcategorySelect}
                    onChange={(e) => setForm({
                      ...form,
                      subcategorySelect: e.target.value,
                      customSubcategory: e.target.value === OTHER_VALUE ? form.customSubcategory : '',
                    })}
                  >
                    <option value="">Select</option>
                    {subcats.map((s) => <option key={s} value={s}>{s}</option>)}
                    <option value={OTHER_VALUE}>Other</option>
                  </select>
                </label>
                {form.subcategorySelect === OTHER_VALUE ? (
                  <label className="fin-field"><span>Custom Subcategory</span>
                    <input
                      className="fin-input"
                      disabled={viewOnly}
                      required
                      placeholder="Write new subcategory"
                      value={form.customSubcategory}
                      onChange={(e) => setForm({ ...form, customSubcategory: e.target.value })}
                    />
                  </label>
                ) : null}
                <label className="fin-field"><span>Vendor</span>
                  <input className="fin-input" disabled={viewOnly} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
                </label>
                <label className="fin-field"><span>Amount</span>
                  <input className="fin-input" type="number" disabled={viewOnly} required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </label>
                <label className="fin-field"><span>GST</span>
                  <input className="fin-input" type="number" disabled={viewOnly} value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} />
                </label>
                <label className="fin-field"><span>Payment Mode</span>
                  <select className="fin-input" disabled={viewOnly} value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                    {(meta.paymentModes || []).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="fin-field"><span>Status</span>
                  <select className="fin-input" disabled={viewOnly} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {(meta.expenseStatuses || []).map((s) => <option key={s} value={s}>{s}</option>)}
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
              <h2>Filter Expenses</h2>
              <button type="button" className="fin-link" onClick={() => setShowFilters(false)}>Close</button>
            </div>
            <div className="fin-filter-modal-body">
              <FinanceFilters
                filters={draftFilters}
                onChange={setDraftFilters}
                showCategory
                categoryOptions={Object.keys(meta.expenseCategories || {})}
                showStatus="status"
                statusOptions={meta.expenseStatuses || ['Pending', 'Paid', 'Partial', 'Cancelled']}
                extra={(
                  <label className="fin-field">
                    <span>Search</span>
                    <input
                      className="fin-input"
                      placeholder="Search…"
                      value={draftFilters.search || ''}
                      onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                    />
                  </label>
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
          moduleName="finance/expenses"
          templateEndpoint="/finance/expenses/template"
          mandatoryFieldsHelp={[
            'Date * — expense date (YYYY-MM-DD)',
            'Category * — e.g. Office, Inventory, Marketing, or any custom category',
            'Amount * — expense amount in INR',
            'Voucher No — optional; auto-generated when blank',
          ]}
          onUploadComplete={(result) => {
            const imported = result?.imported || 0;
            const updated = result?.updated || 0;
            const failed = result?.failed || 0;
            if (imported + updated > 0) {
              // Show a wider range so newly imported rows are visible
              const range = getFinPeriodRange('year');
              setPage(1);
              setFilters((f) => ({
                ...f,
                period: 'year',
                dateFrom: range.dateFrom,
                dateTo: range.dateTo,
                month: '',
                financialYear: '',
              }));
            }
            setToast(
              imported + updated > 0
                ? `Expense import done: ${imported} added, ${updated} updated${failed ? `, ${failed} failed` : ''}`
                : `Expense import finished with no new rows${failed ? ` (${failed} failed)` : ''}`
            );
            window.setTimeout(() => setToast(''), 4000);
            // Keep the upload modal open so the full error/success summary stays visible
          }}
          onClose={() => {
            setShowImport(false);
            fetchData();
          }}
        />
      ) : null}
    </div>
  );
}

export default ExpenseReport;
