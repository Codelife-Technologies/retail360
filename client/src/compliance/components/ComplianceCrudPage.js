import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  extractList,
  extractPagination,
  formatDate,
  toInputDate,
} from '../utils/complianceUtils';

function getFieldValue(row, key) {
  const value = row?.[key];
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
    return formatDate(value);
  }
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function ComplianceCrudPage({
  title,
  subtitle,
  api,
  columns,
  fields,
  createPermission,
  updatePermission,
  deletePermission,
  statusOptions = ['Pending', 'Completed', 'Overdue', 'In Progress'],
  departmentOptions = ['HR', 'Accounts', 'Compliance', 'Management', 'Operations'],
  extraFilters = [],
  defaultForm = {},
  statusField = 'status',
  dateFilterFieldHint = 'Due date',
  showStatusFilter = true,
  showDepartmentFilter = true,
  showDateFilter = true,
  rowClassName,
  canWriteOverride,
}) {
  const { hasPermission } = useAuth();
  const canCreate =
    canWriteOverride !== false &&
    (hasPermission('admin.all') ||
      hasPermission('compliance.full') ||
      (createPermission && hasPermission(createPermission)));
  const canUpdate =
    canWriteOverride !== false &&
    (hasPermission('admin.all') ||
      hasPermission('compliance.full') ||
      (updatePermission && hasPermission(updatePermission)));
  const canDelete =
    canWriteOverride !== false &&
    (hasPermission('admin.all') ||
      hasPermission('compliance.full') ||
      (deletePermission && hasPermission(deletePermission)));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [extraFilterValues, setExtraFilterValues] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [toast, setToast] = useState('');

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        search: searchTerm,
        status,
        department,
        dateFrom,
        dateTo,
        page,
        limit: 15,
        ...extraFilterValues,
      };
      Object.keys(params).forEach((key) => {
        if (params[key] === '' || params[key] === undefined || params[key] === null) {
          delete params[key];
        }
      });
      const response = await api.getAll(params);
      setRows(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      console.error(error);
      setRows([]);
      showToast(error.response?.data?.error || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [api, searchTerm, status, department, dateFrom, dateTo, page, extraFilterValues]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const emptyForm = useMemo(() => {
    const base = { ...defaultForm };
    fields.forEach((field) => {
      if (base[field.name] === undefined) {
        if (field.type === 'checkbox') base[field.name] = false;
        else if (field.type === 'number') base[field.name] = '';
        else base[field.name] = field.defaultValue ?? '';
      }
    });
    return base;
  }, [defaultForm, fields]);

  const openAdd = () => {
    setEditing(null);
    setViewOnly(false);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEdit = (row, readOnly = false) => {
    const next = { ...emptyForm };
    fields.forEach((field) => {
      if (field.type === 'date') next[field.name] = toInputDate(row[field.name]);
      else if (field.type === 'checkbox') next[field.name] = Boolean(row[field.name]);
      else next[field.name] = row[field.name] ?? '';
    });
    setEditing(row);
    setFormData(next);
    setViewOnly(readOnly);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (viewOnly) return;
    try {
      const payload = { ...formData };
      fields.forEach((field) => {
        if (field.type === 'number') {
          payload[field.name] =
            payload[field.name] === '' || payload[field.name] === null
              ? 0
              : Number(payload[field.name]);
        }
        if (field.type === 'date' && !payload[field.name]) {
          payload[field.name] = null;
        }
      });
      if (editing) await api.update(editing._id, payload);
      else await api.create(payload);
      setShowModal(false);
      showToast(editing ? 'Record updated' : 'Record created');
      fetchRows();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save record');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await api.delete(row._id);
      showToast('Record deleted');
      fetchRows();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete record');
    }
  };

  const handleExport = async (format) => {
    try {
      await api.export({
        search: searchTerm,
        status,
        department,
        dateFrom,
        dateTo,
        format,
        ...extraFilterValues,
      });
      showToast(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      alert(error.response?.data?.error || 'Export failed');
    }
  };

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="cmp-page-subtitle">{subtitle}</p> : null}
        </div>
        <div className="cmp-page-actions">
          {canCreate ? (
            <button type="button" className="cmp-btn cmp-btn-primary" onClick={openAdd}>
              + Add
            </button>
          ) : null}
          <button type="button" className="cmp-btn" onClick={() => handleExport('xlsx')}>
            Excel
          </button>
          <button type="button" className="cmp-btn" onClick={() => handleExport('csv')}>
            CSV
          </button>
          <button type="button" className="cmp-btn" onClick={() => handleExport('pdf')}>
            PDF
          </button>
        </div>
      </div>

      <div className="cmp-toolbar">
        <input
          type="search"
          className="cmp-input"
          placeholder="Search…"
          value={searchTerm}
          onChange={(e) => {
            setPage(1);
            setSearchTerm(e.target.value);
          }}
        />
        {showStatusFilter ? (
          <select
            className="cmp-input"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All Status</option>
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : null}
        {showDepartmentFilter ? (
          <select
            className="cmp-input"
            value={department}
            onChange={(e) => {
              setPage(1);
              setDepartment(e.target.value);
            }}
          >
            <option value="">All Departments</option>
            {departmentOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : null}
        {extraFilters.map((filter) => (
          <select
            key={filter.name}
            className="cmp-input"
            value={extraFilterValues[filter.name] || ''}
            onChange={(e) => {
              setPage(1);
              setExtraFilterValues((prev) => ({ ...prev, [filter.name]: e.target.value }));
            }}
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => {
              const value = typeof opt === 'object' ? opt.value : opt;
              const label = typeof opt === 'object' ? opt.label : opt;
              return (
                <option key={value} value={value}>
                  {label}
                </option>
              );
            })}
          </select>
        ))}
        {showDateFilter ? (
          <>
            <input
              type="date"
              className="cmp-input"
              title={`${dateFilterFieldHint} from`}
              value={dateFrom}
              onChange={(e) => {
                setPage(1);
                setDateFrom(e.target.value);
              }}
            />
            <input
              type="date"
              className="cmp-input"
              title={`${dateFilterFieldHint} to`}
              value={dateTo}
              onChange={(e) => {
                setPage(1);
                setDateTo(e.target.value);
              }}
            />
          </>
        ) : null}
      </div>

      {toast ? <div className="cmp-toast">{toast}</div> : null}

      <div className="cmp-card cmp-table-card">
        {loading ? (
          <div className="cmp-skeleton-list">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="cmp-skeleton-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="cmp-empty">
            <h3>No records found</h3>
            <p>Try adjusting filters or add a new record.</p>
          </div>
        ) : (
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className={rowClassName ? rowClassName(row) : undefined}>
                    {columns.map((col) => (
                      <td key={col.key} data-label={col.label}>
                        {col.render
                          ? col.render(row[col.key], row)
                          : getFieldValue(row, col.key)}
                      </td>
                    ))}
                    <td data-label="Actions">
                      <div className="cmp-row-actions">
                        <button type="button" className="cmp-link-btn" onClick={() => openEdit(row, true)}>
                          View
                        </button>
                        {canUpdate ? (
                          <button type="button" className="cmp-link-btn" onClick={() => openEdit(row, false)}>
                            Edit
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button type="button" className="cmp-link-btn danger" onClick={() => handleDelete(row)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination ? (
          <div className="cmp-pagination">
            <button
              type="button"
              className="cmp-btn"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages || 1} ({pagination.total} records)
            </span>
            <button
              type="button"
              className="cmp-btn"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {showModal ? (
        <div className="cmp-modal-backdrop" role="dialog" aria-modal="true">
          <div className="cmp-modal">
            <div className="cmp-modal-header">
              <h2>{viewOnly ? 'View' : editing ? 'Edit' : 'Add'} {title}</h2>
              <button type="button" className="cmp-link-btn" onClick={() => setShowModal(false)}>
                Close
              </button>
            </div>
            <form className="cmp-form" onSubmit={handleSubmit}>
              <div className="cmp-form-grid">
                {fields.map((field) => (
                  <label key={field.name} className={`cmp-field${field.fullWidth ? ' full' : ''}`}>
                    <span>{field.label}</span>
                    {field.type === 'textarea' ? (
                      <textarea
                        className="cmp-input"
                        rows={3}
                        disabled={viewOnly}
                        value={formData[field.name] ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        className="cmp-input"
                        disabled={viewOnly}
                        value={formData[field.name] ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                        required={field.required}
                      >
                        <option value="">Select</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        disabled={viewOnly}
                        checked={Boolean(formData[field.name])}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                      />
                    ) : (
                      <input
                        className="cmp-input"
                        type={field.type || 'text'}
                        disabled={viewOnly}
                        required={field.required}
                        value={formData[field.name] ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              {!viewOnly ? (
                <div className="cmp-modal-actions">
                  <button type="button" className="cmp-btn" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="cmp-btn cmp-btn-primary">
                    Save
                  </button>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ComplianceCrudPage;
