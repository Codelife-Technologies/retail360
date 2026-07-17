import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  complianceFilingsAPI,
  complianceFilingMastersAPI,
} from '../services/complianceApi';
import {
  extractList,
  extractPagination,
  formatCurrency,
  formatDate,
  toInputDate,
} from '../utils/complianceUtils';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Filed', 'Overdue', 'Rejected'];
const CATEGORY_OPTIONS = ['', 'GST', 'TDS', 'ITR', 'EPF', 'ESIC', 'Labour', 'Other'];
const GOV_STATUS_COLORS = {
  'Not Submitted': 'cmp-badge-neutral',
  Submitted: 'cmp-badge-info',
  Acknowledged: 'cmp-badge-success',
  Rejected: 'cmp-badge-danger',
};

const emptyForm = () => ({
  filingMaster: '',
  period: '',
  dueDate: '',
  amount: '',
  status: 'Pending',
  department: '',
  remarks: '',
  attachment: '',
});

function FilingsPage() {
  const { hasPermission } = useAuth();
  const canCreate =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.filings.create');
  const canUpdate =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.filings.update');
  const canDelete =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.filings.delete');

  const [rows, setRows] = useState([]);
  const [masters, setMasters] = useState([]);
  const [govConfig, setGovConfig] = useState({ configured: false });
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [toast, setToast] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  };

  const fetchMasters = useCallback(async () => {
    try {
      const res = await complianceFilingsAPI.getActiveMasters();
      setMasters(res.data || []);
    } catch {
      const fallback = await complianceFilingMastersAPI.getAll({ isActive: true, limit: 200 });
      setMasters(extractList(fallback));
    }
  }, []);

  const fetchGovConfig = useCallback(async () => {
    try {
      const res = await complianceFilingsAPI.getGovConfig();
      setGovConfig(res.data || { configured: false });
    } catch {
      setGovConfig({ configured: false });
    }
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = { search: searchTerm, status, category, page, limit: 15 };
      Object.keys(params).forEach((k) => {
        if (!params[k]) delete params[k];
      });
      const res = await complianceFilingsAPI.getAll(params);
      setRows(extractList(res));
      setPagination(extractPagination(res));
    } catch (error) {
      setRows([]);
      showToast(error.response?.data?.error || 'Failed to load filings');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, status, category, page]);

  useEffect(() => {
    fetchMasters();
    fetchGovConfig();
  }, [fetchMasters, fetchGovConfig]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const selectedMaster = useMemo(
    () => masters.find((m) => m._id === form.filingMaster),
    [masters, form.filingMaster]
  );

  const previewDueDate = async (masterId, period) => {
    if (!masterId) return;
    try {
      const res = await complianceFilingsAPI.previewDueDate({
        filingMasterId: masterId,
        period: period || undefined,
      });
      setForm((prev) => ({
        ...prev,
        period: res.data.period || prev.period,
        dueDate: res.data.dueDate ? toInputDate(res.data.dueDate) : prev.dueDate,
        department: prev.department || res.data.master?.department || '',
      }));
    } catch (error) {
      showToast(error.response?.data?.error || 'Could not compute due date');
    }
  };

  const handleMasterChange = (masterId) => {
    setForm((prev) => ({ ...prev, filingMaster: masterId, period: '', dueDate: '' }));
    if (masterId) previewDueDate(masterId);
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
      filingMaster: row.filingMaster?._id || row.filingMaster || '',
      period: row.period || '',
      dueDate: row.dueDate ? toInputDate(row.dueDate) : '',
      amount: row.amount ?? '',
      status: row.status || 'Pending',
      department: row.department || '',
      remarks: row.remarks || '',
      attachment: row.attachment || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...form,
        amount: Number(form.amount) || 0,
        dueDate: form.dueDate || undefined,
      };
      if (editing) {
        await complianceFilingsAPI.update(editing._id, body);
        showToast('Filing updated');
      } else {
        await complianceFilingsAPI.create(body);
        showToast('Filing created');
      }
      setShowModal(false);
      fetchRows();
    } catch (error) {
      showToast(error.response?.data?.error || 'Save failed');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete filing ${row.formCode} — ${row.period}?`)) return;
    try {
      await complianceFilingsAPI.delete(row._id);
      showToast('Filing deleted');
      fetchRows();
    } catch (error) {
      showToast(error.response?.data?.error || 'Delete failed');
    }
  };

  const handleGenerateUpcoming = async () => {
    try {
      setGenerating(true);
      const res = await complianceFilingsAPI.generateUpcoming();
      showToast(`Created ${res.data.created} filing(s), skipped ${res.data.skipped} existing`);
      fetchRows();
    } catch (error) {
      showToast(error.response?.data?.error || 'Could not generate filings');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitGovernment = async (row) => {
    if (!govConfig.configured) {
      showToast('Government API key is not configured on the server');
      return;
    }
    if (!window.confirm(`Submit ${row.formCode} (${row.period}) to ${row.governmentPortal || 'government portal'}?`)) {
      return;
    }
    try {
      setSubmittingId(row._id);
      await complianceFilingsAPI.submitGovernment(row._id);
      showToast('Filing submitted to government portal');
      fetchRows();
    } catch (error) {
      showToast(error.response?.data?.error || 'Government submission failed');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleExport = async () => {
    try {
      await complianceFilingsAPI.export({ format: 'xlsx', search: searchTerm, status, category });
      showToast('Export started');
    } catch {
      showToast('Export failed');
    }
  };

  return (
    <div className="cmp-page">
      <div className="cmp-sticky-header">
        <div className="cmp-page-header">
          <div>
            <h1>Filings</h1>
            <p className="cmp-page-subtitle">
              Track and file GST, TDS, ITR, EPF, ESIC and other statutory returns from one place.
            </p>
          </div>
          <div className="cmp-page-actions">
            {canCreate ? (
              <>
                <button type="button" className="cmp-btn cmp-btn-primary" onClick={openAdd}>
                  + Add Filing
                </button>
                <button
                  type="button"
                  className="cmp-btn"
                  onClick={handleGenerateUpcoming}
                  disabled={generating}
                >
                  {generating ? 'Generating…' : 'Generate Upcoming'}
                </button>
              </>
            ) : null}
            <button type="button" className="cmp-btn" onClick={handleExport}>Export</button>
          </div>
        </div>

        <div className={`cmp-gov-banner${govConfig.configured ? ' cmp-gov-banner-ready' : ''}`}>
          <strong>Government API:</strong>{' '}
          {govConfig.configured
            ? `Connected to ${govConfig.portalHint || 'e-filing gateway'}`
            : 'Not configured — set GOVT_FILING_API_KEY and GOVT_FILING_API_BASE_URL in server .env'}
        </div>

        <div className="cmp-toolbar">
          <input
            className="cmp-input"
            placeholder="Search form, period, reference…"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
          <select className="cmp-select" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt || 'all'} value={opt}>{opt || 'All Categories'}</option>
            ))}
          </select>
          <select className="cmp-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      {toast ? <div className="cmp-toast">{toast}</div> : null}

      {loading ? (
        <div className="cmp-loading">Loading filings…</div>
      ) : rows.length === 0 ? (
        <div className="cmp-empty">
          <p>No filings found.</p>
          {canCreate ? (
            <button type="button" className="cmp-btn cmp-btn-primary" onClick={handleGenerateUpcoming}>
              Generate from Filing Master
            </button>
          ) : null}
        </div>
      ) : (
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <th>Form</th>
                <th>Category</th>
                <th>Period</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Gov Status</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    <div className="cmp-cell-title">{row.formCode}</div>
                    <div className="cmp-muted">{row.formName}</div>
                  </td>
                  <td>{row.category}</td>
                  <td>{row.period}</td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td><span className={`cmp-badge cmp-badge-${row.status?.toLowerCase().replace(/\s+/g, '-')}`}>{row.status}</span></td>
                  <td>
                    <span className={`cmp-badge ${GOV_STATUS_COLORS[row.governmentStatus] || 'cmp-badge-neutral'}`}>
                      {row.governmentStatus || 'Not Submitted'}
                    </span>
                  </td>
                  <td>{row.governmentReference || '—'}</td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td className="cmp-actions-cell">
                    <button type="button" className="cmp-link-btn" onClick={() => openEdit(row, true)}>View</button>
                    {canUpdate ? (
                      <button type="button" className="cmp-link-btn" onClick={() => openEdit(row)}>Edit</button>
                    ) : null}
                    {canUpdate && row.governmentStatus !== 'Acknowledged' ? (
                      <button
                        type="button"
                        className="cmp-link-btn"
                        disabled={submittingId === row._id || !govConfig.configured}
                        onClick={() => handleSubmitGovernment(row)}
                      >
                        {submittingId === row._id ? 'Submitting…' : 'File with Govt'}
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button type="button" className="cmp-link-btn cmp-link-danger" onClick={() => handleDelete(row)}>Delete</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination?.totalPages > 1 ? (
        <div className="cmp-pagination">
          <button type="button" className="cmp-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pagination.totalPages}</span>
          <button type="button" className="cmp-btn" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      ) : null}

      {showModal ? (
        <div className="cmp-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="cmp-modal cmp-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="cmp-modal-header">
              <h2>{viewOnly ? 'View Filing' : editing ? 'Edit Filing' : 'Add Filing'}</h2>
              <button type="button" className="cmp-link-btn" onClick={() => setShowModal(false)}>Close</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="cmp-form-grid">
                <label className="cmp-field">
                  <span>Form *</span>
                  <select
                    required
                    disabled={viewOnly || Boolean(editing)}
                    value={form.filingMaster}
                    onChange={(e) => handleMasterChange(e.target.value)}
                  >
                    <option value="">Select form from Filing Master</option>
                    {masters.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.code} — {m.name} ({m.frequency})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cmp-field">
                  <span>Period *</span>
                  <input
                    required
                    disabled={viewOnly}
                    placeholder="2026-04 / Q1-2026 / FY2025-26"
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value })}
                    onBlur={() => form.filingMaster && previewDueDate(form.filingMaster, form.period)}
                  />
                </label>
                <label className="cmp-field">
                  <span>Due Date</span>
                  <input
                    type="date"
                    disabled={viewOnly}
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </label>
                <label className="cmp-field">
                  <span>Status</span>
                  <select disabled={viewOnly} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </label>
                <label className="cmp-field">
                  <span>Amount</span>
                  <input
                    type="number"
                    step="0.01"
                    disabled={viewOnly}
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </label>
                <label className="cmp-field">
                  <span>Department</span>
                  <input
                    disabled={viewOnly}
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </label>
                {selectedMaster ? (
                  <div className="cmp-field cmp-field-full cmp-master-hint">
                    <span>Filing Master</span>
                    <p className="cmp-muted">
                      {selectedMaster.frequency} · Due day {selectedMaster.dueDay}
                      {selectedMaster.companyDueDateNote ? ` · ${selectedMaster.companyDueDateNote}` : ''}
                    </p>
                  </div>
                ) : null}
                <label className="cmp-field cmp-field-full">
                  <span>Remarks</span>
                  <textarea
                    rows={3}
                    disabled={viewOnly}
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  />
                </label>
                <label className="cmp-field cmp-field-full">
                  <span>Attachment (URL / reference)</span>
                  <input
                    disabled={viewOnly}
                    value={form.attachment}
                    onChange={(e) => setForm({ ...form, attachment: e.target.value })}
                  />
                </label>
              </div>
              {!viewOnly ? (
                <div className="cmp-modal-actions">
                  <button type="button" className="cmp-btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="cmp-btn cmp-btn-primary">Save</button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FilingsPage;
