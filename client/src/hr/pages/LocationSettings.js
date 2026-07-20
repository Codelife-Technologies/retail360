import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrEmployeesAPI, hrOfficeLocationsAPI } from '../services/hrApi';
import HrPagination from '../components/HrPagination';
import { extractList, extractPagination, employeeName } from '../utils/hrUtils';
import { googleMapsUrl } from '../utils/attendanceGeo';

const emptyForm = () => ({
  name: '',
  latitude: '',
  longitude: '',
  radiusMeters: 100,
  address: '',
  assignedDepartments: [],
  assignedEmployees: [],
  isActive: true,
  isDefault: false,
  notes: '',
});

function LocationSettings() {
  const [offices, setOffices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const fetchOffices = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hrOfficeLocationsAPI.getAll({
        search: searchTerm,
        page,
        limit: 15,
      });
      setOffices(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      console.error('Error fetching office locations:', error);
      setOffices([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page]);

  const loadLookups = useCallback(async () => {
    try {
      const [empRes, deptRes] = await Promise.all([
        hrEmployeesAPI.getAll({ status: 'Active', limit: 500 }),
        hrEmployeesAPI.getDepartments(),
      ]);
      setEmployees(extractList(empRes));
      setDepartments(deptRes.data?.departments || deptRes.data || []);
    } catch (error) {
      console.error('Error loading employees/departments:', error);
    }
  }, []);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const departmentOptions = useMemo(() => {
    if (Array.isArray(departments) && departments.length && typeof departments[0] === 'string') {
      return departments;
    }
    if (Array.isArray(departments)) {
      return departments.map((d) => d.name || d).filter(Boolean);
    }
    return [];
  }, [departments]);

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Office name is required';
    const lat = Number(formData.latitude);
    const lng = Number(formData.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.latitude = 'Valid latitude is required';
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.longitude = 'Valid longitude is required';
    const radius = Number(formData.radiusMeters);
    if (!Number.isFinite(radius) || radius < 10) errors.radiusMeters = 'Radius must be at least 10 meters';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm());
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (office) => {
    setEditing(office);
    setFormData({
      name: office.name || '',
      latitude: office.latitude ?? '',
      longitude: office.longitude ?? '',
      radiusMeters: office.radiusMeters ?? 200,
      address: office.address || '',
      assignedDepartments: office.assignedDepartments || [],
      assignedEmployees: (office.assignedEmployees || []).map((e) => e._id || e),
      isActive: office.isActive !== false,
      isDefault: Boolean(office.isDefault),
      notes: office.notes || '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      ...formData,
      latitude: Number(formData.latitude),
      longitude: Number(formData.longitude),
      radiusMeters: Number(formData.radiusMeters),
    };

    try {
      setSaving(true);
      if (editing) {
        await hrOfficeLocationsAPI.update(editing._id, payload);
      } else {
        await hrOfficeLocationsAPI.create(payload);
      }
      setShowModal(false);
      setEditing(null);
      setFormData(emptyForm());
      fetchOffices();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save office location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (office) => {
    if (!window.confirm(`Delete office "${office.name}"?`)) return;
    try {
      await hrOfficeLocationsAPI.delete(office._id);
      fetchOffices();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete office location');
    }
  };

  const fillFromBrowser = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported in this browser.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((f) => ({
          ...f,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setGeoBusy(false);
      },
      (error) => {
        setGeoBusy(false);
        alert(error.message || 'Unable to read current location');
      },
      { enableHighAccuracy: true, timeout: 20000 }
    );
  };

  const toggleDepartment = (dept) => {
    setFormData((f) => {
      const set = new Set(f.assignedDepartments);
      if (set.has(dept)) set.delete(dept);
      else set.add(dept);
      return { ...f, assignedDepartments: [...set] };
    });
  };

  const toggleEmployee = (id) => {
    setFormData((f) => {
      const set = new Set(f.assignedEmployees.map(String));
      if (set.has(String(id))) set.delete(String(id));
      else set.add(String(id));
      return { ...f, assignedEmployees: [...set] };
    });
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Location Settings</h1>
          <p>
            Configure office GPS coordinates and allowed attendance radius.
            Employee GPS is optional — when location is available and outside the radius,
            attendance is auto-marked Work From Home. Without GPS, employees can still mark Office or Home.
          </p>
        </div>
        <button type="button" className="hr-btn hr-btn-primary" onClick={openCreate}>
          + Add Office Location
        </button>
      </header>

      <div className="hr-filters-row">
        <input
          className="hr-filter-input"
          type="search"
          placeholder="Search office name…"
          value={searchTerm}
          onChange={(e) => {
            setPage(1);
            setSearchTerm(e.target.value);
          }}
        />
      </div>

      {loading ? (
        <div className="hr-loading">Loading office locations…</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Office</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Radius</th>
                <th>Assignments</th>
                <th>Status</th>
                <th>Map</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hr-empty">
                    No office locations configured yet. Add one to enable GPS attendance checks.
                  </td>
                </tr>
              ) : (
                offices.map((office) => {
                  const mapUrl = googleMapsUrl(office.latitude, office.longitude);
                  return (
                    <tr key={office._id}>
                      <td>
                        <strong>{office.name}</strong>
                        {office.isDefault ? <span className="hr-chip" style={{ marginLeft: 8 }}>Default</span> : null}
                        {office.address ? <div className="hr-muted">{office.address}</div> : null}
                      </td>
                      <td>{office.latitude}</td>
                      <td>{office.longitude}</td>
                      <td>{office.radiusMeters} m</td>
                      <td>
                        <div className="hr-muted">
                          {(office.assignedDepartments || []).length} dept
                          {' · '}
                          {(office.assignedEmployees || []).length} employees
                        </div>
                      </td>
                      <td>{office.isActive ? 'Active' : 'Inactive'}</td>
                      <td>
                        {mapUrl ? (
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" title="Open in Google Maps">
                            📍 Map
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="hr-actions-cell">
                          <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => openEdit(office)}>
                            Edit
                          </button>
                          <button type="button" className="hr-btn hr-btn-danger hr-btn-sm" onClick={() => handleDelete(office)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <HrPagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}

      {showModal && (
        <div className="hr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="hr-modal hr-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>{editing ? 'Edit Office Location' : 'Add Office Location'}</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  <div className="hr-form-group">
                    <label>Office Name <span className="required">*</span></label>
                    <input
                      value={formData.name}
                      onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Head Office"
                    />
                    {formErrors.name && <span className="hr-field-error">{formErrors.name}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Allowed Radius (meters) <span className="required">*</span></label>
                    <input
                      type="number"
                      min={10}
                      max={50000}
                      value={formData.radiusMeters}
                      onChange={(e) => setFormData((f) => ({ ...f, radiusMeters: e.target.value }))}
                    />
                    {formErrors.radiusMeters && <span className="hr-field-error">{formErrors.radiusMeters}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Latitude <span className="required">*</span></label>
                    <input
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) => setFormData((f) => ({ ...f, latitude: e.target.value }))}
                      placeholder="28.613900"
                    />
                    {formErrors.latitude && <span className="hr-field-error">{formErrors.latitude}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Longitude <span className="required">*</span></label>
                    <input
                      type="number"
                      step="any"
                      value={formData.longitude}
                      onChange={(e) => setFormData((f) => ({ ...f, longitude: e.target.value }))}
                      placeholder="77.209000"
                    />
                    {formErrors.longitude && <span className="hr-field-error">{formErrors.longitude}</span>}
                  </div>
                  <div className="hr-form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Address</label>
                    <input
                      value={formData.address}
                      onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                      placeholder="Optional street address"
                    />
                  </div>
                  <div className="hr-form-group" style={{ gridColumn: '1 / -1' }}>
                    <button type="button" className="hr-btn hr-btn-secondary" onClick={fillFromBrowser} disabled={geoBusy}>
                      {geoBusy ? 'Reading GPS…' : 'Use my current GPS'}
                    </button>
                  </div>
                  <div className="hr-form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.isDefault}
                        onChange={(e) => setFormData((f) => ({ ...f, isDefault: e.target.checked }))}
                      />
                      {' '}Default office (fallback for unassigned staff)
                    </label>
                  </div>
                  <div className="hr-form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData((f) => ({ ...f, isActive: e.target.checked }))}
                      />
                      {' '}Active
                    </label>
                  </div>
                </div>

                <div className="hr-form-group" style={{ marginTop: '1rem' }}>
                  <label>Assign Departments</label>
                  <div className="hr-chip-select">
                    {departmentOptions.length === 0 ? (
                      <span className="hr-muted">No departments found</span>
                    ) : (
                      departmentOptions.map((dept) => (
                        <label key={dept} className="hr-chip-option">
                          <input
                            type="checkbox"
                            checked={formData.assignedDepartments.includes(dept)}
                            onChange={() => toggleDepartment(dept)}
                          />
                          {dept}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="hr-form-group" style={{ marginTop: '1rem' }}>
                  <label>Assign Employees</label>
                  <div className="hr-chip-select hr-chip-select-scroll">
                    {employees.map((emp) => (
                      <label key={emp._id} className="hr-chip-option">
                        <input
                          type="checkbox"
                          checked={formData.assignedEmployees.map(String).includes(String(emp._id))}
                          onChange={() => toggleEmployee(emp._id)}
                        />
                        {employeeName(emp)} ({emp.employeeId})
                      </label>
                    ))}
                  </div>
                </div>

                <div className="hr-form-group" style={{ marginTop: '1rem' }}>
                  <label>Notes</label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="hr-btn hr-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LocationSettings;
