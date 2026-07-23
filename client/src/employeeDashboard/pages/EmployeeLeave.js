import React, { useCallback, useEffect, useState } from 'react';
import { hrLeavesAPI } from '../../hr/services/hrApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import {
  LEAVE_TYPES,
  getLeaveTypesForEmployee,
  buildMaternityLeavePeriod,
  isMaternityLeaveType,
  formatLeaveRemaining,
} from '../../hr/utils/leavePolicies';
import { extractList, formatDate } from '../../hr/utils/hrUtils';

const emptyForm = () => ({
  leaveType: 'Casual Leave',
  fromDate: '',
  toDate: '',
  days: 1,
  reason: '',
});

function EmployeeLeaveContent({ employeeId, employee }) {
  const currentYear = new Date().getFullYear();
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const applicableLeaveTypes = employee ? getLeaveTypesForEmployee(employee) : LEAVE_TYPES;
  const selectedBalance = balances.find((b) => b.leaveType === formData.leaveType);

  const fetchData = useCallback(async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const [leavesRes, balancesRes] = await Promise.all([
        hrLeavesAPI.getAll({ employee: employeeId, limit: 10 }),
        hrLeavesAPI.getBalances({ employee: employeeId, year: currentYear }),
      ]);
      setLeaves(extractList(leavesRes));
      setBalances(balancesRes.data?.balances || []);
    } catch (error) {
      console.error('Error fetching leave data:', error);
      setLeaves([]);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, currentYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const calcDays = (from, to) => {
    if (!from || !to) return 1;
    const start = new Date(from);
    const end = new Date(to);
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(diff, 1);
  };

  const validateForm = () => {
    const errors = {};
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
      errors.leaveType = `Only ${formatLeaveRemaining(selectedBalance)} remaining`;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setSubmitting(true);
      const days = calcDays(formData.fromDate, formData.toDate);
      await hrLeavesAPI.create({
        employee: employeeId,
        ...formData,
        days,
      });
      setFormData(emptyForm());
      setFormErrors({});
      fetchData();
      alert('Leave application submitted successfully.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to apply leave');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (leave) => {
    if (!window.confirm('Cancel this leave application?')) return;
    try {
      await hrLeavesAPI.cancel(leave._id, {});
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to cancel leave');
    }
  };

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>Apply Leave</h2>
          <p>Submit a leave request and track your applications.</p>
        </div>
      </header>

      <div className="ed-leave-layout">
        <section className="ed-panel">
          <h3>Leave Balances ({currentYear})</h3>
          {balances.length ? (
            <div className="ed-leave-balances">
              {balances.map((bal) => (
                <div key={bal.leaveType} className="ed-leave-balance">
                  <span>{bal.label}</span>
                  <strong>{bal.unlimited ? 'Unlimited' : formatLeaveRemaining(bal)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="ed-empty">No balance data available.</p>
          )}
        </section>

        <section className="ed-panel">
          <h3>New Leave Application</h3>
          <form className="ed-leave-form" onSubmit={handleSubmit}>
            <div className="ed-form-group">
              <label>Leave Type</label>
              <select
                value={formData.leaveType}
                onChange={(e) => {
                  const leaveType = e.target.value;
                  if (isMaternityLeaveType(leaveType)) {
                    const balance = balances.find((b) => b.leaveType === leaveType);
                    const period = buildMaternityLeavePeriod(new Date(), balance?.remaining);
                    setFormData((f) => ({
                      ...f,
                      leaveType,
                      ...period,
                      reason: f.reason || 'Maternity Leave',
                    }));
                    return;
                  }
                  setFormData((f) => ({ ...f, leaveType }));
                }}
              >
                {applicableLeaveTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              {formErrors.leaveType && <span className="ed-form-error">{formErrors.leaveType}</span>}
            </div>

            <div className="ed-form-row">
              <div className="ed-form-group">
                <label>From Date</label>
                <input
                  type="date"
                  value={formData.fromDate}
                  disabled={isMaternityLeaveType(formData.leaveType)}
                  onChange={(e) => {
                    const fromDate = e.target.value;
                    const toDate = formData.toDate || fromDate;
                    setFormData((f) => ({
                      ...f,
                      fromDate,
                      toDate: toDate < fromDate ? fromDate : toDate,
                      days: calcDays(fromDate, toDate < fromDate ? fromDate : toDate),
                    }));
                  }}
                />
                {formErrors.fromDate && <span className="ed-form-error">{formErrors.fromDate}</span>}
              </div>
              <div className="ed-form-group">
                <label>To Date</label>
                <input
                  type="date"
                  value={formData.toDate}
                  disabled={isMaternityLeaveType(formData.leaveType)}
                  onChange={(e) => {
                    const toDate = e.target.value;
                    setFormData((f) => ({
                      ...f,
                      toDate,
                      days: calcDays(f.fromDate, toDate),
                    }));
                  }}
                />
                {formErrors.toDate && <span className="ed-form-error">{formErrors.toDate}</span>}
              </div>
            </div>

            <div className="ed-form-group">
              <label>Days</label>
              <input type="number" min="0.5" step="0.5" value={formData.days} readOnly />
            </div>

            <div className="ed-form-group">
              <label>Reason</label>
              <textarea
                rows={3}
                value={formData.reason}
                onChange={(e) => setFormData((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Reason for leave"
              />
              {formErrors.reason && <span className="ed-form-error">{formErrors.reason}</span>}
            </div>

            <button type="submit" className="ed-btn ed-btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Apply Leave'}
            </button>
          </form>
        </section>
      </div>

      <section className="ed-panel ed-panel-wide">
        <h3>My Leave Applications</h3>
        {loading ? (
          <div className="ed-loading">Loading applications...</div>
        ) : (
          <div className="ed-table-card">
            <table className="ed-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>HR Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan={8} className="ed-empty">No leave applications yet.</td></tr>
                ) : (
                  leaves.map((leave) => (
                    <tr key={leave._id}>
                      <td>{leave.leaveType}</td>
                      <td>{formatDate(leave.fromDate)}</td>
                      <td>{formatDate(leave.toDate)}</td>
                      <td>{leave.days}</td>
                      <td>{leave.reason}</td>
                      <td><HrStatusBadge status={leave.status} /></td>
                      <td>
                        {leave.status === 'Rejected' && leave.reviewNotes
                          ? leave.reviewNotes
                          : '—'}
                      </td>
                      <td>
                        {(leave.status === 'Pending' || leave.status === 'Approved') && (
                          <button
                            type="button"
                            className="ed-btn ed-btn-secondary"
                            onClick={() => handleCancel(leave)}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function EmployeeLeave() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeLeaveContent employeeId={context.employeeId} employee={context.employee} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeLeave;
