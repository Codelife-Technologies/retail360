import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { hrAttendanceAPI, hrEmployeesAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrPagination from '../components/HrPagination';
import HrStatusBadge from '../components/HrStatusBadge';
import HrEmployeeAvatar from '../components/HrEmployeeAvatar';
import { extractList, extractPagination, formatDate, employeeName, toInputDate } from '../utils/hrUtils';

const STATUS_OPTIONS = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home'];

const emptyForm = () => ({
  employee: '',
  date: toInputDate(new Date()),
  checkIn: '',
  checkOut: '',
  workingHours: 0,
  status: 'Present',
  notes: '',
});

function Attendance() {
  const [viewMode, setViewMode] = useState('daily');
  const [canManageAll, setCanManageAll] = useState(false);
  const [linkedEmployeeId, setLinkedEmployeeId] = useState(null);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [trendError, setTrendError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    date: toInputDate(new Date()),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    employee: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [formData, setFormData] = useState(emptyForm());

  const fetchRecords = useCallback(async () => {
    if (!accessLoaded) return;
    try {
      setLoading(true);
      const params = {
        search: canManageAll ? searchTerm : '',
        employee: canManageAll ? filters.employee : linkedEmployeeId || undefined,
        status: filters.status,
        page,
        limit: 20,
      };
      if (viewMode === 'daily') {
        params.date = filters.date;
      } else {
        params.month = filters.month;
        params.year = filters.year;
      }

      const summaryParams = viewMode === 'daily'
        ? { date: filters.date }
        : { month: filters.month, year: filters.year };

      const [recordsRes, summaryRes] = await Promise.all([
        hrAttendanceAPI.getAll(params),
        hrAttendanceAPI.getSummary(summaryParams),
      ]);

      setRecords(extractList(recordsRes));
      setPagination(extractPagination(recordsRes));
      setSummary(summaryRes.data || { present: 0, absent: 0, late: 0, leave: 0 });

      if (viewMode === 'monthly') {
        try {
          setTrendError('');
          const trendRes = await hrAttendanceAPI.getTrend({
            month: filters.month,
            year: filters.year,
            employee: canManageAll ? (filters.employee || undefined) : linkedEmployeeId || undefined,
          });
          setMonthlyTrend(trendRes.data?.trend || []);
        } catch (trendErr) {
          console.error('Error fetching attendance trend:', trendErr);
          setMonthlyTrend([]);
          setTrendError(
            trendErr.response?.status === 404
              ? 'Trend API not available — restart the server to load the latest HR routes.'
              : 'Could not load attendance trend.'
          );
        }
      } else {
        setMonthlyTrend([]);
        setTrendError('');
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, page, viewMode, canManageAll, linkedEmployeeId, accessLoaded]);

  useEffect(() => {
    hrAttendanceAPI
      .getContext()
      .then((res) => {
        setCanManageAll(Boolean(res.data?.canManageAll));
        setLinkedEmployeeId(res.data?.linkedEmployeeId || null);
      })
      .catch(() => {
        setCanManageAll(false);
        setLinkedEmployeeId(null);
      })
      .finally(() => setAccessLoaded(true));
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    if (canManageAll) {
      hrEmployeesAPI.getAll({ status: 'Active' }).then((res) => setEmployees(extractList(res))).catch(() => {});
    } else if (linkedEmployeeId) {
      hrEmployeesAPI.getById(linkedEmployeeId).then((res) => setEmployees([res.data])).catch(() => setEmployees([]));
    } else {
      setEmployees([]);
    }
  }, [canManageAll, linkedEmployeeId]);

  const openAdd = () => {
    setEditingRecord(null);
    setFormData(emptyForm());
    setShowModal(true);
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    setFormData({
      employee: record.employee?._id || record.employee || '',
      date: toInputDate(record.date),
      checkIn: record.checkIn || '',
      checkOut: record.checkOut || '',
      workingHours: record.workingHours || 0,
      status: record.status || 'Present',
      notes: record.notes || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employee) {
      alert('Please select an employee');
      return;
    }
    try {
      if (editingRecord) {
        await hrAttendanceAPI.update(editingRecord._id, formData);
      } else {
        await hrAttendanceAPI.create(formData);
      }
      setShowModal(false);
      fetchRecords();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save attendance');
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      await hrAttendanceAPI.delete(record._id);
      fetchRecords();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete record');
    }
  };

  const hasTrendActivity = monthlyTrend.some((day) => day.present + day.absent + day.leave > 0);

  if (!accessLoaded) {
    return <div className="hr-page"><div className="hr-loading">Loading attendance...</div></div>;
  }

  if (!canManageAll && !linkedEmployeeId) {
    return (
      <div className="hr-page">
        <header className="hr-page-header">
          <div>
            <h1>My Attendance</h1>
            <p className="hr-page-subtitle">Your attendance records</p>
          </div>
        </header>
        <p className="hr-empty">
          No employee profile is linked to your login account. Ask HR to use the same email on your employee record as your user account.
        </p>
      </div>
    );
  }

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>{canManageAll ? 'Attendance Management' : 'My Attendance'}</h1>
          <p className="hr-page-subtitle">
            {canManageAll
              ? 'Track daily and monthly employee attendance'
              : 'View your daily and monthly attendance records'}
          </p>
        </div>
        {canManageAll && (
          <button type="button" className="hr-btn hr-btn-primary" onClick={openAdd}>
            + Mark Attendance
          </button>
        )}
      </header>

      <div className="hr-view-tabs">
        <button
          type="button"
          className={`hr-view-tab${viewMode === 'daily' ? ' active' : ''}`}
          onClick={() => { setViewMode('daily'); setPage(1); }}
        >
          Daily Attendance
        </button>
        <button
          type="button"
          className={`hr-view-tab${viewMode === 'monthly' ? ' active' : ''}`}
          onClick={() => { setViewMode('monthly'); setPage(1); }}
        >
          Monthly View
        </button>
      </div>

      {viewMode === 'daily' && (
        <div className="hr-kpi-grid">
          <HrKpiCard icon="✅" label="Present" value={summary.present} variant="success" />
          <HrKpiCard icon="❌" label="Absent" value={summary.absent} variant="danger" />
          <HrKpiCard icon="⏰" label="Late / Half Day" value={summary.late} variant="warning" />
          <HrKpiCard icon="🏖️" label="Leave" value={summary.leave} />
        </div>
      )}

      {viewMode === 'monthly' && (
        <div className="hr-chart-card hr-attendance-trend-card">
          <h3>
            Attendance Trend —{' '}
            {new Date(filters.year, filters.month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            {filters.employee && employees.find((e) => e._id === filters.employee)
              ? ` · ${employeeName(employees.find((e) => e._id === filters.employee))}`
              : ''}
          </h3>
          {loading ? (
            <p className="hr-loading">Loading trend...</p>
          ) : trendError ? (
            <p className="hr-empty">{trendError}</p>
          ) : monthlyTrend.length === 0 ? (
            <p className="hr-empty">No attendance data for this month</p>
          ) : !hasTrendActivity ? (
            <p className="hr-empty">No attendance marked for this month — mark attendance to see the trend.</p>
          ) : (
            <div className="hr-chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyTrend} barGap={2} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="present" fill="#10b981" name="Present" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="absent" fill="#ef4444" name="Absent" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="leave" fill="#3b82f6" name="Leave" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="hr-filters-row">
        {canManageAll && (
          <input
            type="text"
            className="hr-search-input"
            placeholder="Search employee..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        )}
        {viewMode === 'daily' ? (
          <input
            type="date"
            className="hr-filter-input"
            value={filters.date}
            onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
          />
        ) : (
          <>
            <select
              className="hr-filter-select"
              value={filters.month}
              onChange={(e) => setFilters((f) => ({ ...f, month: parseInt(e.target.value, 10) }))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="hr-filter-input"
              value={filters.year}
              min="2020"
              max="2030"
              onChange={(e) => setFilters((f) => ({ ...f, year: parseInt(e.target.value, 10) }))}
            />
          </>
        )}
        {canManageAll && (
          <select
            className="hr-filter-select"
            value={filters.employee}
            onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp._id} value={emp._id}>{employeeName(emp)} ({emp.employeeId})</option>
            ))}
          </select>
        )}
        <select
          className="hr-filter-select"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="hr-loading">Loading attendance...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Working Hours</th>
                <th>Status</th>
                {canManageAll && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={canManageAll ? 7 : 6} className="hr-empty">No attendance records found</td></tr>
              ) : (
                records.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <HrEmployeeAvatar employee={row.employee} size={32} />
                        {employeeName(row.employee)}
                      </span>
                    </td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.checkIn || '—'}</td>
                    <td>{row.checkOut || '—'}</td>
                    <td>{row.workingHours ?? '—'}</td>
                    <td><HrStatusBadge status={row.status} /></td>
                    {canManageAll && (
                      <td>
                        <div className="hr-actions-cell">
                          <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => openEdit(row)}>Edit</button>
                          <button type="button" className="hr-btn hr-btn-danger hr-btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <HrPagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}

      {showModal && canManageAll && (
        <div className="hr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>{editingRecord ? 'Edit Attendance' : 'Mark Attendance'}</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  <div className="hr-form-group">
                    <label>Employee <span className="required">*</span></label>
                    <select
                      value={formData.employee}
                      onChange={(e) => setFormData((f) => ({ ...f, employee: e.target.value }))}
                      required
                      disabled={!!editingRecord}
                    >
                      <option value="">Select employee</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>{employeeName(emp)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="hr-form-group">
                    <label>Date</label>
                    <input type="date" value={formData.date} onChange={(e) => setFormData((f) => ({ ...f, date: e.target.value }))} required />
                  </div>
                  <div className="hr-form-group">
                    <label>Check In</label>
                    <input type="time" value={formData.checkIn} onChange={(e) => setFormData((f) => ({ ...f, checkIn: e.target.value }))} />
                  </div>
                  <div className="hr-form-group">
                    <label>Check Out</label>
                    <input type="time" value={formData.checkOut} onChange={(e) => setFormData((f) => ({ ...f, checkOut: e.target.value }))} />
                  </div>
                  <div className="hr-form-group">
                    <label>Working Hours</label>
                    <input type="number" min="0" step="0.5" value={formData.workingHours} onChange={(e) => setFormData((f) => ({ ...f, workingHours: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="hr-form-group">
                    <label>Status</label>
                    <select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Attendance;
