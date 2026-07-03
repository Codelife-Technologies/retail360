import React, { useState, useEffect, useCallback } from 'react';
import { hrEmployeesAPI } from '../services/hrApi';
import HrPagination from '../components/HrPagination';
import HrStatusBadge from '../components/HrStatusBadge';
import HrEmployeeAvatar from '../components/HrEmployeeAvatar';
import HrLeaveBalancePanel from '../components/HrLeaveBalancePanel';
import {
  extractList,
  extractPagination,
  formatDate,
  employeeName,
  toInputDate,
  validateEmail,
  validatePhone,
} from '../utils/hrUtils';
import { mergeDepartments } from '../utils/departments';

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];
const STATUS_OPTIONS = ['Active', 'Inactive', 'On Leave', 'Terminated'];
const GENDER_OPTIONS = ['', 'Male', 'Female', 'Other'];
const MARITAL_OPTIONS = ['', 'Single', 'Married', 'Divorced', 'Widowed'];

const emptyForm = () => ({
  employeeId: '',
  photo: '',
  firstName: '',
  lastName: '',
  department: '',
  designation: '',
  email: '',
  phone: '',
  joiningDate: '',
  employmentType: 'Full-time',
  status: 'Active',
  basicSalary: 0,
  personalInfo: { dateOfBirth: '', gender: '', maritalStatus: '' },
  contactInfo: { address: '', city: '', state: '', pinCode: '' },
  emergencyContact: { name: '', relationship: '', phone: '' },
  bankDetails: { bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' },
});

function EmployeeMaster() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ department: '', status: '', employmentType: '' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hrEmployeesAPI.getAll({
        search: searchTerm,
        ...filters,
        page,
        limit: 15,
        sortBy,
        sortOrder,
      });
      setEmployees(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, page, sortBy, sortOrder]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    hrEmployeesAPI
      .getDepartments()
      .then((res) => setDepartments(mergeDepartments(res.data || [])))
      .catch(() => setDepartments(mergeDepartments([])));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, filters]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.department.trim()) errors.department = 'Department is required';
    if (!formData.designation.trim()) errors.designation = 'Designation is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!validateEmail(formData.email)) errors.email = 'Invalid email address';
    if (!formData.phone.trim()) errors.phone = 'Phone is required';
    else if (!validatePhone(formData.phone)) errors.phone = 'Invalid phone number';
    if (!formData.joiningDate) errors.joiningDate = 'Joining date is required';
    if (formData.emergencyContact.phone && !validatePhone(formData.emergencyContact.phone)) {
      errors.emergencyPhone = 'Invalid emergency contact phone';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const payload = {
        ...formData,
        joiningDate: formData.joiningDate,
        basicSalary: parseFloat(formData.basicSalary) || 0,
        personalInfo: {
          ...formData.personalInfo,
          dateOfBirth: formData.personalInfo.dateOfBirth || undefined,
        },
      };
      if (editingEmployee) {
        await hrEmployeesAPI.update(editingEmployee._id, payload);
      } else {
        await hrEmployeesAPI.create(payload);
      }
      setShowModal(false);
      setEditingEmployee(null);
      setFormData(emptyForm());
      fetchEmployees();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save employee');
    }
  };

  const employeeToForm = (emp) => ({
    employeeId: emp.employeeId || '',
    photo: emp.photo || '',
    firstName: emp.firstName || '',
    lastName: emp.lastName || '',
    department: emp.department || '',
    designation: emp.designation || '',
    email: emp.email || '',
    phone: emp.phone || '',
    joiningDate: toInputDate(emp.joiningDate),
    employmentType: emp.employmentType || 'Full-time',
    status: emp.status || 'Active',
    basicSalary: emp.basicSalary ?? 0,
    personalInfo: {
      dateOfBirth: toInputDate(emp.personalInfo?.dateOfBirth),
      gender: emp.personalInfo?.gender || '',
      maritalStatus: emp.personalInfo?.maritalStatus || '',
    },
    contactInfo: { ...emptyForm().contactInfo, ...emp.contactInfo },
    emergencyContact: { ...emptyForm().emergencyContact, ...emp.emergencyContact },
    bankDetails: { ...emptyForm().bankDetails, ...emp.bankDetails },
  });

  const openAdd = () => {
    setEditingEmployee(null);
    setFormData(emptyForm());
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (emp) => {
    setEditingEmployee(emp);
    setFormData(employeeToForm(emp));
    setFormErrors({});
    setShowModal(true);
    setShowViewModal(false);
  };

  const openView = (emp) => {
    setViewingEmployee(emp);
    setShowViewModal(true);
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete employee ${employeeName(emp)}?`)) return;
    try {
      await hrEmployeesAPI.delete(emp._id);
      fetchEmployees();
      setShowViewModal(false);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete employee');
    }
  };

  const updateField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const updateNested = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const sortIndicator = (field) => {
    if (sortBy !== field) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Employee Master</h1>
          <p className="hr-page-subtitle">Manage employee records, profiles, and employment details</p>
        </div>
        <button type="button" className="hr-btn hr-btn-primary" onClick={openAdd}>
          + Add Employee
        </button>
      </header>

      <div className="hr-filters-row">
        <input
          type="text"
          className="hr-search-input"
          placeholder="Search by name, ID, email, department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="hr-filter-select"
          value={filters.department}
          onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          className="hr-filter-select"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="hr-filter-select"
          value={filters.employmentType}
          onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}
        >
          <option value="">All Types</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="hr-loading">Loading employees...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('employeeId')}>
                  Employee ID{sortIndicator('employeeId')}
                </th>
                <th>Photo</th>
                <th className="sortable" onClick={() => handleSort('firstName')}>
                  Employee Name{sortIndicator('firstName')}
                </th>
                <th className="sortable" onClick={() => handleSort('department')}>
                  Department{sortIndicator('department')}
                </th>
                <th>Designation</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="sortable" onClick={() => handleSort('joiningDate')}>
                  Joining Date{sortIndicator('joiningDate')}
                </th>
                <th>Employment Type</th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status{sortIndicator('status')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="hr-empty">No employees found</td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp._id} className="clickable-row" onClick={() => openView(emp)}>
                    <td>{emp.employeeId}</td>
                    <td><HrEmployeeAvatar employee={emp} /></td>
                    <td>{employeeName(emp)}</td>
                    <td>{emp.department}</td>
                    <td>{emp.designation}</td>
                    <td>{emp.email}</td>
                    <td>{emp.phone}</td>
                    <td>{formatDate(emp.joiningDate)}</td>
                    <td>{emp.employmentType}</td>
                    <td><HrStatusBadge status={emp.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="hr-actions-cell">
                        <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => openView(emp)}>View</button>
                        <button type="button" className="hr-btn hr-btn-primary hr-btn-sm" onClick={() => openEdit(emp)}>Edit</button>
                        <button type="button" className="hr-btn hr-btn-danger hr-btn-sm" onClick={() => handleDelete(emp)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
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
              <h2>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-section">
                  <h3>Personal Information</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group">
                      <label>Employee ID</label>
                      <input value={formData.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} placeholder="Auto-generated if empty" />
                    </div>
                    <div className="hr-form-group">
                      <label>Photo URL</label>
                      <input value={formData.photo} onChange={(e) => updateField('photo', e.target.value)} placeholder="https://..." />
                    </div>
                    <div className="hr-form-group">
                      <label>First Name <span className="required">*</span></label>
                      <input value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} />
                      {formErrors.firstName && <span className="hr-form-error">{formErrors.firstName}</span>}
                    </div>
                    <div className="hr-form-group">
                      <label>Last Name</label>
                      <input value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Date of Birth</label>
                      <input type="date" value={formData.personalInfo.dateOfBirth} onChange={(e) => updateNested('personalInfo', 'dateOfBirth', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Gender</label>
                      <select value={formData.personalInfo.gender} onChange={(e) => updateNested('personalInfo', 'gender', e.target.value)}>
                        {GENDER_OPTIONS.map((g) => <option key={g || 'none'} value={g}>{g || 'Select'}</option>)}
                      </select>
                    </div>
                    <div className="hr-form-group">
                      <label>Marital Status</label>
                      <select value={formData.personalInfo.maritalStatus} onChange={(e) => updateNested('personalInfo', 'maritalStatus', e.target.value)}>
                        {MARITAL_OPTIONS.map((m) => <option key={m || 'none'} value={m}>{m || 'Select'}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="hr-form-section">
                  <h3>Employment Information</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group">
                      <label>Department <span className="required">*</span></label>
                      <select value={formData.department} onChange={(e) => updateField('department', e.target.value)}>
                        <option value="">Select department</option>
                        {departments.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      {formErrors.department && <span className="hr-form-error">{formErrors.department}</span>}
                    </div>
                    <div className="hr-form-group">
                      <label>Designation <span className="required">*</span></label>
                      <input value={formData.designation} onChange={(e) => updateField('designation', e.target.value)} />
                      {formErrors.designation && <span className="hr-form-error">{formErrors.designation}</span>}
                    </div>
                    <div className="hr-form-group">
                      <label>Joining Date <span className="required">*</span></label>
                      <input type="date" value={formData.joiningDate} onChange={(e) => updateField('joiningDate', e.target.value)} />
                      {formErrors.joiningDate && <span className="hr-form-error">{formErrors.joiningDate}</span>}
                    </div>
                    <div className="hr-form-group">
                      <label>Employment Type</label>
                      <select value={formData.employmentType} onChange={(e) => updateField('employmentType', e.target.value)}>
                        {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="hr-form-group">
                      <label>Status</label>
                      <select value={formData.status} onChange={(e) => updateField('status', e.target.value)}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="hr-form-group">
                      <label>Basic Salary</label>
                      <input type="number" min="0" value={formData.basicSalary} onChange={(e) => updateField('basicSalary', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="hr-form-section">
                  <h3>Contact Information</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group">
                      <label>Email <span className="required">*</span></label>
                      <input type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} />
                      {formErrors.email && <span className="hr-form-error">{formErrors.email}</span>}
                    </div>
                    <div className="hr-form-group">
                      <label>Phone <span className="required">*</span></label>
                      <input value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} />
                      {formErrors.phone && <span className="hr-form-error">{formErrors.phone}</span>}
                    </div>
                  </div>
                </div>

                <div className="hr-form-section">
                  <h3>Address</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Address</label>
                      <textarea value={formData.contactInfo.address} onChange={(e) => updateNested('contactInfo', 'address', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>City</label>
                      <input value={formData.contactInfo.city} onChange={(e) => updateNested('contactInfo', 'city', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>State</label>
                      <input value={formData.contactInfo.state} onChange={(e) => updateNested('contactInfo', 'state', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Pin Code</label>
                      <input value={formData.contactInfo.pinCode} onChange={(e) => updateNested('contactInfo', 'pinCode', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="hr-form-section">
                  <h3>Emergency Contact</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group">
                      <label>Name</label>
                      <input value={formData.emergencyContact.name} onChange={(e) => updateNested('emergencyContact', 'name', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Relationship</label>
                      <input value={formData.emergencyContact.relationship} onChange={(e) => updateNested('emergencyContact', 'relationship', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Phone</label>
                      <input value={formData.emergencyContact.phone} onChange={(e) => updateNested('emergencyContact', 'phone', e.target.value)} />
                      {formErrors.emergencyPhone && <span className="hr-form-error">{formErrors.emergencyPhone}</span>}
                    </div>
                  </div>
                </div>

                <div className="hr-form-section">
                  <h3>Bank Details</h3>
                  <div className="hr-form-grid">
                    <div className="hr-form-group">
                      <label>Bank Name</label>
                      <input value={formData.bankDetails.bankName} onChange={(e) => updateNested('bankDetails', 'bankName', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Account Holder Name</label>
                      <input value={formData.bankDetails.accountHolderName} onChange={(e) => updateNested('bankDetails', 'accountHolderName', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>Account Number</label>
                      <input value={formData.bankDetails.accountNumber} onChange={(e) => updateNested('bankDetails', 'accountNumber', e.target.value)} />
                    </div>
                    <div className="hr-form-group">
                      <label>IFSC Code</label>
                      <input value={formData.bankDetails.ifscCode} onChange={(e) => updateNested('bankDetails', 'ifscCode', e.target.value)} />
                    </div>
                  </div>
                </div>

                {editingEmployee && (
                  <HrLeaveBalancePanel employeeId={editingEmployee._id} compact />
                )}
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">{editingEmployee ? 'Update' : 'Save'} Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showViewModal && viewingEmployee && (
        <div className="hr-modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="hr-modal hr-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>{employeeName(viewingEmployee)}</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowViewModal(false)}>×</button>
            </div>
            <div className="hr-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <HrEmployeeAvatar employee={viewingEmployee} size={64} />
                <div>
                  <p><strong>{viewingEmployee.employeeId}</strong> · {viewingEmployee.designation}</p>
                  <p>{viewingEmployee.department} · <HrStatusBadge status={viewingEmployee.status} /></p>
                </div>
              </div>
              <div className="hr-form-grid">
                <div><strong>Email:</strong> {viewingEmployee.email}</div>
                <div><strong>Phone:</strong> {viewingEmployee.phone}</div>
                <div><strong>Joining Date:</strong> {formatDate(viewingEmployee.joiningDate)}</div>
                <div><strong>Employment Type:</strong> {viewingEmployee.employmentType}</div>
                <div><strong>Basic Salary:</strong> ₹{viewingEmployee.basicSalary?.toLocaleString() || 0}</div>
                <div><strong>Address:</strong> {[viewingEmployee.contactInfo?.address, viewingEmployee.contactInfo?.city, viewingEmployee.contactInfo?.state].filter(Boolean).join(', ') || '—'}</div>
                <div><strong>Emergency Contact:</strong> {viewingEmployee.emergencyContact?.name ? `${viewingEmployee.emergencyContact.name} (${viewingEmployee.emergencyContact.phone})` : '—'}</div>
                <div><strong>Bank:</strong> {viewingEmployee.bankDetails?.bankName || '—'} {viewingEmployee.bankDetails?.accountNumber ? `· A/C ${viewingEmployee.bankDetails.accountNumber}` : ''}</div>
              </div>

              <HrLeaveBalancePanel employeeId={viewingEmployee._id} />
            </div>
            <div className="hr-modal-footer">
              <button type="button" className="hr-btn hr-btn-danger" onClick={() => handleDelete(viewingEmployee)}>Delete</button>
              <button type="button" className="hr-btn hr-btn-primary" onClick={() => openEdit(viewingEmployee)}>Edit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeMaster;
