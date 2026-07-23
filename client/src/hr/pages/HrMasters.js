import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrMastersAPI } from '../services/hrApi';

const SECTIONS = [
  { id: 'departments', label: 'Departments', icon: '🏢' },
  { id: 'designations', label: 'Designations', icon: '💼' },
  { id: 'payroll', label: 'Payroll Components', icon: '💰' },
];

const CALC_TYPES = [
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent_of_basic', label: '% of basic' },
  { value: 'percent_of_gross', label: '% of gross' },
  { value: 'weight', label: 'Allowance weight' },
];

const CATEGORIES = [
  { value: 'earning', label: 'Earning' },
  { value: 'deduction', label: 'Deduction' },
  { value: 'employer', label: 'Employer contribution' },
];

const emptyDept = () => ({
  code: '',
  name: '',
  description: '',
  isActive: true,
  sortOrder: 0,
});

const emptyDesig = () => ({
  name: '',
  department: '',
  grade: '',
  description: '',
  isActive: true,
  sortOrder: 0,
});

const emptyPay = () => ({
  code: '',
  name: '',
  category: 'earning',
  calculationType: 'fixed',
  defaultValue: 0,
  isStatutory: false,
  isTaxable: true,
  isActive: true,
  description: '',
  sortOrder: 0,
});

function formatCalc(row) {
  const type = CALC_TYPES.find((t) => t.value === row.calculationType)?.label || row.calculationType;
  if (row.calculationType === 'fixed') return `${type}: ${row.defaultValue}`;
  if (row.calculationType === 'weight') return `${type}: ${row.defaultValue}`;
  return `${type}: ${row.defaultValue}%`;
}

function HrMasters() {
  const [section, setSection] = useState('departments');
  const [summary, setSummary] = useState({ departments: 0, designations: 0, payrollComponents: 0 });
  const [rows, setRows] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyDept());
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const sectionTitle = useMemo(
    () => SECTIONS.find((s) => s.id === section)?.label || 'HR Masters',
    [section]
  );

  const refreshSummary = useCallback(async () => {
    try {
      const res = await hrMastersAPI.getSummary();
      setSummary(res.data || { departments: 0, designations: 0, payrollComponents: 0 });
    } catch {
      /* ignore */
    }
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        search: searchTerm || undefined,
      };
      let response;
      if (section === 'departments') {
        response = await hrMastersAPI.getDepartments(params);
        setDepartmentOptions(
          (Array.isArray(response.data) ? response.data : [])
            .filter((d) => d.isActive)
            .map((d) => d.name)
        );
      } else if (section === 'designations') {
        const [desigRes, deptRes] = await Promise.all([
          hrMastersAPI.getDesignations(params),
          hrMastersAPI.getDepartments({ activeOnly: 'true' }),
        ]);
        response = desigRes;
        setDepartmentOptions((Array.isArray(deptRes.data) ? deptRes.data : []).map((d) => d.name));
      } else {
        response = await hrMastersAPI.getPayrollComponents({
          ...params,
          category: categoryFilter || undefined,
        });
      }
      setRows(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching HR masters:', error);
      setRows([]);
      alert(error.response?.data?.error || 'Failed to load HR masters');
    } finally {
      setLoading(false);
    }
  }, [section, searchTerm, categoryFilter]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openAdd = () => {
    setEditing(null);
    if (section === 'departments') setFormData(emptyDept());
    else if (section === 'designations') setFormData(emptyDesig());
    else setFormData(emptyPay());
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    if (section === 'departments') {
      setFormData({
        code: row.code || '',
        name: row.name || '',
        description: row.description || '',
        isActive: row.isActive !== false,
        sortOrder: row.sortOrder || 0,
      });
    } else if (section === 'designations') {
      setFormData({
        name: row.name || '',
        department: row.department || '',
        grade: row.grade || '',
        description: row.description || '',
        isActive: row.isActive !== false,
        sortOrder: row.sortOrder || 0,
      });
    } else {
      setFormData({
        code: row.code || '',
        name: row.name || '',
        category: row.category || 'earning',
        calculationType: row.calculationType || 'fixed',
        defaultValue: row.defaultValue ?? 0,
        isStatutory: Boolean(row.isStatutory),
        isTaxable: row.isTaxable !== false,
        isActive: row.isActive !== false,
        description: row.description || '',
        sortOrder: row.sortOrder || 0,
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (section === 'departments') {
        if (editing) await hrMastersAPI.updateDepartment(editing._id, formData);
        else await hrMastersAPI.createDepartment(formData);
      } else if (section === 'designations') {
        if (editing) await hrMastersAPI.updateDesignation(editing._id, formData);
        else await hrMastersAPI.createDesignation(formData);
      } else if (editing) {
        await hrMastersAPI.updatePayrollComponent(editing._id, formData);
      } else {
        await hrMastersAPI.createPayrollComponent(formData);
      }
      setShowModal(false);
      await Promise.all([fetchRows(), refreshSummary()]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    const label =
      section === 'payroll' ? row.name : section === 'departments' ? row.name : row.name;
    if (!window.confirm(`Remove "${label}"? In-use items are deactivated instead of deleted.`)) {
      return;
    }
    try {
      let response;
      if (section === 'departments') response = await hrMastersAPI.deleteDepartment(row._id);
      else if (section === 'designations') response = await hrMastersAPI.deleteDesignation(row._id);
      else response = await hrMastersAPI.deletePayrollComponent(row._id);
      if (response.data?.message) {
        // soft-deactivate message
      }
      await Promise.all([fetchRows(), refreshSummary()]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete');
    }
  };

  const handleSeed = async () => {
    try {
      setSeeding(true);
      const res = await hrMastersAPI.seed({ force: true });
      alert(res.data?.message || 'Defaults synced');
      await Promise.all([fetchRows(), refreshSummary()]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  const updateField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="hr-page">
      <div className="hr-page-header">
        <div>
          <h1>HR Masters</h1>
          <p className="hr-page-subtitle">
            Maintain departments, designations, and payroll components used across Employee Master
            and Payroll.
          </p>
        </div>
        <div className="hr-header-actions">
          <button type="button" className="hr-btn hr-btn-secondary" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Syncing…' : 'Sync defaults'}
          </button>
          <button type="button" className="hr-btn hr-btn-primary" onClick={openAdd}>
            + Add {section === 'payroll' ? 'component' : section.slice(0, -1)}
          </button>
        </div>
      </div>

      <div className="hr-kpi-grid hr-masters-kpi">
        <div className="hr-kpi-card">
          <div className="hr-kpi-body">
            <span>Departments</span>
            <h3>{summary.departments}</h3>
          </div>
        </div>
        <div className="hr-kpi-card">
          <div className="hr-kpi-body">
            <span>Designations</span>
            <h3>{summary.designations}</h3>
          </div>
        </div>
        <div className="hr-kpi-card">
          <div className="hr-kpi-body">
            <span>Payroll components</span>
            <h3>{summary.payrollComponents}</h3>
          </div>
        </div>
      </div>

      <div className="hr-masters-section-tabs">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`hr-masters-section-tab${section === item.id ? ' active' : ''}`}
            onClick={() => {
              setSection(item.id);
              setSearchTerm('');
              setCategoryFilter('');
            }}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      <div className="hr-filters-row">
        <input
          type="search"
          className="hr-filter-input"
          placeholder={`Search ${sectionTitle.toLowerCase()}…`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {section === 'payroll' && (
          <select
            className="hr-filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="hr-loading">Loading {sectionTitle.toLowerCase()}…</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              {section === 'departments' && (
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              )}
              {section === 'designations' && (
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              )}
              {section === 'payroll' && (
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Calculation</th>
                  <th>Flags</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hr-empty">
                    No records yet. Use Sync defaults or Add to create masters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id} className={row.isActive === false ? 'hr-row-inactive' : ''}>
                    {section === 'departments' && (
                      <>
                        <td><code>{row.code}</code></td>
                        <td>{row.name}</td>
                        <td>{row.description || '—'}</td>
                        <td>{row.isActive !== false ? 'Active' : 'Inactive'}</td>
                      </>
                    )}
                    {section === 'designations' && (
                      <>
                        <td>{row.name}</td>
                        <td>{row.department || '—'}</td>
                        <td>{row.grade || '—'}</td>
                        <td>{row.isActive !== false ? 'Active' : 'Inactive'}</td>
                      </>
                    )}
                    {section === 'payroll' && (
                      <>
                        <td><code>{row.code}</code></td>
                        <td>{row.name}</td>
                        <td className="hr-masters-category">{row.category}</td>
                        <td>{formatCalc(row)}</td>
                        <td>
                          {[row.isStatutory && 'Statutory', row.isTaxable && 'Taxable']
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </td>
                        <td>{row.isActive !== false ? 'Active' : 'Inactive'}</td>
                      </>
                    )}
                    <td>
                      <div className="hr-actions-cell">
                        <button
                          type="button"
                          className="hr-btn hr-btn-secondary hr-btn-sm"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="hr-btn hr-btn-danger hr-btn-sm"
                          onClick={() => handleDelete(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="hr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>
                {editing ? 'Edit' : 'Add'}{' '}
                {section === 'payroll'
                  ? 'Payroll Component'
                  : section === 'departments'
                    ? 'Department'
                    : 'Designation'}
              </h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  {section === 'departments' && (
                    <>
                      <div className="hr-form-group">
                        <label>Code <span className="required">*</span></label>
                        <input
                          value={formData.code}
                          onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                          required
                          maxLength={20}
                          placeholder="e.g. WHSE"
                        />
                      </div>
                      <div className="hr-form-group">
                        <label>Name <span className="required">*</span></label>
                        <input
                          value={formData.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          required
                          placeholder="e.g. Warehouse"
                        />
                      </div>
                      <div className="hr-form-group hr-form-span-2">
                        <label>Description</label>
                        <input
                          value={formData.description}
                          onChange={(e) => updateField('description', e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {section === 'designations' && (
                    <>
                      <div className="hr-form-group">
                        <label>Name <span className="required">*</span></label>
                        <input
                          value={formData.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          required
                          placeholder="e.g. Warehouse Executive"
                        />
                      </div>
                      <div className="hr-form-group">
                        <label>Department</label>
                        <select
                          value={formData.department}
                          onChange={(e) => updateField('department', e.target.value)}
                        >
                          <option value="">Any / not linked</option>
                          {departmentOptions.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="hr-form-group">
                        <label>Grade</label>
                        <input
                          value={formData.grade}
                          onChange={(e) => updateField('grade', e.target.value)}
                          placeholder="e.g. L2"
                        />
                      </div>
                      <div className="hr-form-group hr-form-span-2">
                        <label>Description</label>
                        <input
                          value={formData.description}
                          onChange={(e) => updateField('description', e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {section === 'payroll' && (
                    <>
                      <div className="hr-form-group">
                        <label>Code <span className="required">*</span></label>
                        <input
                          value={formData.code}
                          onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                          required
                          maxLength={30}
                          placeholder="e.g. HRA"
                        />
                      </div>
                      <div className="hr-form-group">
                        <label>Name <span className="required">*</span></label>
                        <input
                          value={formData.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          required
                        />
                      </div>
                      <div className="hr-form-group">
                        <label>Category <span className="required">*</span></label>
                        <select
                          value={formData.category}
                          onChange={(e) => updateField('category', e.target.value)}
                          required
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="hr-form-group">
                        <label>Calculation type</label>
                        <select
                          value={formData.calculationType}
                          onChange={(e) => updateField('calculationType', e.target.value)}
                        >
                          {CALC_TYPES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="hr-form-group">
                        <label>Default value</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.defaultValue}
                          onChange={(e) => updateField('defaultValue', e.target.value)}
                        />
                      </div>
                      <div className="hr-form-group hr-form-span-2">
                        <label>Description</label>
                        <input
                          value={formData.description}
                          onChange={(e) => updateField('description', e.target.value)}
                        />
                      </div>
                      <div className="hr-form-group">
                        <label className="hr-checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.isStatutory)}
                            onChange={(e) => updateField('isStatutory', e.target.checked)}
                          />
                          Statutory
                        </label>
                      </div>
                      <div className="hr-form-group">
                        <label className="hr-checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(formData.isTaxable)}
                            onChange={(e) => updateField('isTaxable', e.target.checked)}
                          />
                          Taxable
                        </label>
                      </div>
                    </>
                  )}

                  <div className="hr-form-group">
                    <label>Sort order</label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => updateField('sortOrder', e.target.value)}
                    />
                  </div>
                  <div className="hr-form-group">
                    <label className="hr-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.isActive !== false}
                        onChange={(e) => updateField('isActive', e.target.checked)}
                      />
                      Active
                    </label>
                  </div>
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="hr-btn hr-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HrMasters;
