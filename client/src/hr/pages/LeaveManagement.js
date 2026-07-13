import React, { useState, useEffect, useCallback } from 'react';
import { hrLeavesAPI, hrEmployeesAPI } from '../services/hrApi';
import HrPagination from '../components/HrPagination';
import HrStatusBadge from '../components/HrStatusBadge';
import {
  LEAVE_TYPES,
  getLeaveTypesForEmployee,
  buildMaternityLeavePeriod,
  isMaternityLeaveType,
  formatLeaveRemaining,
} from '../utils/leavePolicies';
import {
  extractList,
  extractPagination,
  formatDate,
  employeeName,
} from '../utils/hrUtils';

const emptyForm = () => ({
  employee: '',
  leaveType: 'Casual Leave',
  fromDate: '',
  toDate: '',
  days: 1,
  reason: '',
});

function LeaveManagement() {
  const currentYear = new Date().getFullYear();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ status: '', leaveType: '', employee: '' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [balances, setBalances] = useState([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hrLeavesAPI.getAll({
        search: searchTerm,
        ...filters,
        page,
        limit: 15,
      });
      setLeaves(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      console.error('Error fetching leaves:', error);
      setLeaves([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, page]);

  const fetchBalances = useCallback(async (employeeId) => {
    if (!employeeId) {
      setBalances([]);
      return;
    }
    try {
      setBalanceLoading(true);
      const response = await hrLeavesAPI.getBalances({ employee: employeeId, year: currentYear });
      setBalances(response.data?.balances || []);
    } catch (error) {
      console.error('Error fetching leave balances:', error);
      setBalances([]);
    } finally {
      setBalanceLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    hrEmployeesAPI.getAll({ status: 'Active' }).then((res) => setEmployees(extractList(res))).catch(() => {});
  }, []);

  useEffect(() => {
    if (filters.employee) {
      fetchBalances(filters.employee);
    } else {
      setBalances([]);
    }
  }, [filters.employee, fetchBalances]);

  useEffect(() => {
    if (showModal && formData.employee) {
      fetchBalances(formData.employee);
    }
  }, [showModal, formData.employee, fetchBalances]);

  useEffect(() => {
    if (!showModal || !formData.employee || !isMaternityLeaveType(formData.leaveType) || balanceLoading) {
      return;
    }
    const balance = balances.find((b) => b.leaveType === formData.leaveType);
    if (!balance) return;
    setFormData((f) => {
      if (!isMaternityLeaveType(f.leaveType)) return f;
      const period = buildMaternityLeavePeriod(f.fromDate || new Date(), balance.remaining);
      if (f.fromDate === period.fromDate && f.toDate === period.toDate && f.days === period.days) {
        return f;
      }
      return { ...f, ...period };
    });
  }, [showModal, formData.employee, formData.leaveType, balances, balanceLoading]);

  const calcDays = (from, to) => {
    if (!from || !to) return 1;
    const start = new Date(from);
    const end = new Date(to);
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(diff, 1);
  };

  const applyMaternityDefaults = (prev, leaveType, balance, startDate) => {
    if (!isMaternityLeaveType(leaveType)) {
      return { ...prev, leaveType };
    }
    const period = buildMaternityLeavePeriod(startDate || prev.fromDate || new Date(), balance?.remaining);
    return {
      ...prev,
      leaveType,
      ...period,
      reason: prev.reason?.trim() ? prev.reason : 'Maternity Leave',
    };
  };

  const isMaternityForm = isMaternityLeaveType(formData.leaveType);

  const selectedEmployee = employees.find((emp) => emp._id === formData.employee);
  const applicableLeaveTypes = selectedEmployee
    ? getLeaveTypesForEmployee(selectedEmployee)
    : LEAVE_TYPES;

  const selectedBalance = balances.find((b) => b.leaveType === formData.leaveType);

  const validateForm = () => {
    const errors = {};
    if (!formData.employee) errors.employee = 'Employee is required';
    if (!formData.fromDate) errors.fromDate = 'From date is required';
    if (!formData.toDate) errors.toDate = 'To date is required';
    if (formData.fromDate && formData.toDate && new Date(formData.toDate) < new Date(formData.fromDate)) {
      errors.toDate = 'To date must be on or after from date';
    }
    if (!formData.reason.trim()) errors.reason = 'Reason is required';
    if (
      selectedBalance &&
      !selectedBalance.unlimited &&
      formData.days > selectedBalance.remaining
    ) {
      errors.leaveType = `Only ${formatLeaveRemaining(selectedBalance)} remaining for ${formData.leaveType}`;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const days = calcDays(formData.fromDate, formData.toDate);
      await hrLeavesAPI.create({ ...formData, days });
      setShowModal(false);
      setFormData(emptyForm());
      fetchLeaves();
      if (filters.employee) fetchBalances(filters.employee);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to apply leave');
    }
  };

  const handleAction = async (leave, action) => {
    try {
      if (action === 'approve') await hrLeavesAPI.approve(leave._id, {});
      else if (action === 'reject') await hrLeavesAPI.reject(leave._id, {});
      else if (action === 'cancel') await hrLeavesAPI.cancel(leave._id, {});
      fetchLeaves();
      const empId = leave.employee?._id || leave.employee;
      if (filters.employee === empId || formData.employee === empId) {
        fetchBalances(empId);
      }
    } catch (error) {
      alert(error.response?.data?.error || `Failed to ${action} leave`);
    }
  };

  const handleDelete = async (leave) => {
    if (!window.confirm('Delete this leave application?')) return;
    try {
      await hrLeavesAPI.delete(leave._id);
      fetchLeaves();
      if (filters.employee) fetchBalances(filters.employee);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete leave');
    }
  };

  const renderBalanceCards = (list) => (
    <div className="hr-leave-balance-grid">
      {list.map((bal) => (
        <div key={bal.leaveType} className="hr-leave-balance-card">
          <h4>{bal.label}</h4>
          {!bal.unlimited && (
            <>
              <p>Used: {bal.used} days</p>
              <p>Pending: {bal.pending} days</p>
              <p className="hr-leave-balance-remaining">
                <strong>Leaves left: {formatLeaveRemaining(bal)}</strong>
              </p>
            </>
          )}
          {bal.unlimited && (
            <p className="hr-leave-balance-remaining">Unlimited (with approval)</p>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Leave Management</h1>
          <p className="hr-page-subtitle">
            Select an employee below to view total leaves left by type.
          </p>
        </div>
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          onClick={() => {
            setFormData(emptyForm());
            setFormErrors({});
            setShowModal(true);
          }}
        >
          + Apply Leave
        </button>
      </header>

      <div className="hr-filters-row">
        <input
          type="text"
          className="hr-search-input"
          placeholder="Search employee..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          className="hr-filter-select"
          value={filters.employee}
          onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
        >
          <option value="">Select employee to view leaves left</option>
          {employees.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {employeeName(emp)}
            </option>
          ))}
        </select>
        <select className="hr-filter-select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          {['Pending', 'Approved', 'Rejected', 'Cancelled'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select className="hr-filter-select" value={filters.leaveType} onChange={(e) => setFilters((f) => ({ ...f, leaveType: e.target.value }))}>
          <option value="">All Leave Types</option>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {filters.employee ? (
        <div className="hr-panel-card">
          <h3>
            Total Leaves Left — {employeeName(employees.find((e) => e._id === filters.employee))} ({currentYear})
          </h3>
          {balanceLoading ? (
            <p className="hr-loading">Loading leaves left...</p>
          ) : (
            renderBalanceCards(balances)
          )}
        </div>
      ) : (
        <div className="hr-panel-card hr-leave-balance-hint">
          <p>Select an employee from the dropdown above to see total leaves left for each leave type.</p>
        </div>
      )}

      {loading ? (
        <div className="hr-loading">Loading leave applications...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr><td colSpan={8} className="hr-empty">No leave applications found</td></tr>
              ) : (
                leaves.map((leave) => (
                  <tr key={leave._id}>
                    <td>{employeeName(leave.employee)}</td>
                    <td>{leave.leaveType}</td>
                    <td>{formatDate(leave.fromDate)}</td>
                    <td>{formatDate(leave.toDate)}</td>
                    <td>{leave.days}</td>
                    <td>{leave.reason}</td>
                    <td><HrStatusBadge status={leave.status} /></td>
                    <td>
                      <div className="hr-actions-cell">
                        {leave.status === 'Pending' && (
                          <>
                            <button type="button" className="hr-btn hr-btn-success hr-btn-sm" onClick={() => handleAction(leave, 'approve')}>Approve</button>
                            <button type="button" className="hr-btn hr-btn-danger hr-btn-sm" onClick={() => handleAction(leave, 'reject')}>Reject</button>
                          </>
                        )}
                        {(leave.status === 'Pending' || leave.status === 'Approved') && (
                          <button type="button" className="hr-btn hr-btn-warning hr-btn-sm" onClick={() => handleAction(leave, 'cancel')}>Cancel</button>
                        )}
                        <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => handleDelete(leave)}>Delete</button>
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
              <h2>Apply Leave</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleApplyLeave}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  <div className="hr-form-group">
                    <label>Employee <span className="required">*</span></label>
                    <select
                      value={formData.employee}
                      onChange={(e) => {
                        const employeeId = e.target.value;
                        const emp = employees.find((item) => item._id === employeeId);
                        setFormData((f) => {
                          const allowedTypes = emp ? getLeaveTypesForEmployee(emp) : LEAVE_TYPES;
                          const nextLeaveType = allowedTypes.includes(f.leaveType)
                            ? f.leaveType
                            : allowedTypes[0] || 'Casual Leave';
                          const nextBalance = balances.find((b) => b.leaveType === nextLeaveType);
                          return applyMaternityDefaults(
                            { ...f, employee: employeeId, leaveType: nextLeaveType },
                            nextLeaveType,
                            nextBalance
                          );
                        });
                      }}
                    >
                      <option value="">Select employee</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{employeeName(emp)}</option>
                      ))}
                    </select>
                    {formErrors.employee && <span className="hr-form-error">{formErrors.employee}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Leave Type</label>
                    <select
                      value={formData.leaveType}
                      onChange={(e) => {
                        const leaveType = e.target.value;
                        const balance = balances.find((b) => b.leaveType === leaveType);
                        setFormData((f) => applyMaternityDefaults(f, leaveType, balance));
                      }}
                    >
                      {applicableLeaveTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {formErrors.leaveType && <span className="hr-form-error">{formErrors.leaveType}</span>}
                    {selectedBalance && (
                      <small className="form-hint">
                        Leaves left: {formatLeaveRemaining(selectedBalance)}
                      </small>
                    )}
                  </div>
                  <div className="hr-form-group">
                    <label>From Date <span className="required">*</span></label>
                    <input
                      type="date"
                      value={formData.fromDate}
                      onChange={(e) => {
                        const fromDate = e.target.value;
                        if (isMaternityLeaveType(formData.leaveType)) {
                          setFormData((f) =>
                            applyMaternityDefaults(f, f.leaveType, selectedBalance, fromDate)
                          );
                          return;
                        }
                        setFormData((f) => ({
                          ...f,
                          fromDate,
                          days: calcDays(fromDate, f.toDate || fromDate),
                        }));
                      }}
                    />
                    {isMaternityForm && (
                      <small className="form-hint">Maternity leave duration is set automatically (26 weeks).</small>
                    )}
                    {formErrors.fromDate && <span className="hr-form-error">{formErrors.fromDate}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>To Date <span className="required">*</span></label>
                    <input
                      type="date"
                      value={formData.toDate}
                      readOnly={isMaternityForm}
                      onChange={(e) => {
                        if (isMaternityForm) return;
                        const toDate = e.target.value;
                        setFormData((f) => ({
                          ...f,
                          toDate,
                          days: calcDays(f.fromDate || toDate, toDate),
                        }));
                      }}
                    />
                    {formErrors.toDate && <span className="hr-form-error">{formErrors.toDate}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Days</label>
                    <input type="number" min="0.5" step="0.5" value={formData.days} readOnly />
                  </div>
                  <div className="hr-form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Reason <span className="required">*</span></label>
                    <textarea value={formData.reason} onChange={(e) => setFormData((f) => ({ ...f, reason: e.target.value }))} />
                    {formErrors.reason && <span className="hr-form-error">{formErrors.reason}</span>}
                  </div>
                </div>

                {formData.employee && balances.length > 0 && (
                  <div className="hr-form-section">
                    <h3>Total Leaves Left</h3>
                    {renderBalanceCards(balances)}
                  </div>
                )}
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">Submit Application</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default LeaveManagement;
