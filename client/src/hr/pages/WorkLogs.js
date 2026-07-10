import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrWorkLogsAPI, hrEmployeesAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrStatusBadge from '../components/HrStatusBadge';
import {
  extractList,
  formatDate,
  formatDuration,
  employeeName,
  toInputDate,
} from '../utils/hrUtils';

function WorkLogs() {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState({ totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 }, byEmployee: [] });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({
    employee: '',
    status: '',
    fromDate: toInputDate(new Date(new Date().setDate(new Date().getDate() - 14))),
    toDate: toInputDate(new Date()),
  });

  const filterParams = useMemo(() => {
    const params = {};
    if (filters.employee) params.employee = filters.employee;
    if (filters.status) params.status = filters.status;
    if (filters.fromDate) params.fromDate = filters.fromDate;
    if (filters.toDate) params.toDate = filters.toDate;
    return params;
  }, [filters]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [logsRes, summaryRes] = await Promise.all([
        hrWorkLogsAPI.getAll(filterParams),
        hrWorkLogsAPI.getSummary(filterParams),
      ]);
      setLogs(extractList(logsRes));
      setSummary(summaryRes.data || { totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 }, byEmployee: [] });
    } catch (error) {
      console.error('Error fetching work logs:', error);
      setLogs([]);
      setSummary({ totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 }, byEmployee: [] });
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    hrEmployeesAPI.getAll({ status: 'Active' }).then((res) => {
      setEmployees(extractList(res));
    }).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (log) => {
    if (!window.confirm(`Delete work log for ${employeeName(log.employee)} on ${formatDate(log.date)}?`)) return;
    try {
      await hrWorkLogsAPI.delete(log._id);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete work log');
    }
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Daily Work Logs</h1>
          <p className="hr-page-subtitle">Monitor employee daily work updates and time spent</p>
        </div>
      </header>

      <div className="hr-kpi-grid">
        <HrKpiCard icon="📝" label="Logs in range" value={summary.totals.logCount || 0} variant="info" />
        <HrKpiCard
          icon="⏱️"
          label="Total time logged"
          value={formatDuration(summary.totals.totalMinutes)}
          variant="success"
        />
        <HrKpiCard
          icon="✅"
          label="Submitted logs"
          value={summary.totals.submittedCount || 0}
          variant="warning"
        />
      </div>

      <div className="hr-filters-row">
        <select
          className="hr-filter-select"
          value={filters.employee}
          onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
        >
          <option value="">All Employees</option>
          {employees.map((emp) => (
            <option key={emp._id} value={emp._id}>
              {employeeName(emp)} ({emp.employeeId})
            </option>
          ))}
        </select>
        <select
          className="hr-filter-select"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Submitted">Submitted</option>
        </select>
        <input
          type="date"
          className="hr-filter-select"
          value={filters.fromDate}
          onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
        />
        <input
          type="date"
          className="hr-filter-select"
          value={filters.toDate}
          onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
        />
      </div>

      {loading ? (
        <div className="hr-loading">Loading work logs...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Tasks</th>
                <th>Total Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="hr-empty">No work logs found for the selected filters</td></tr>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log._id}>
                    <tr>
                      <td>{employeeName(log.employee)}</td>
                      <td>{formatDate(log.date)}</td>
                      <td>{log.entries?.length || 0}</td>
                      <td>{formatDuration(log.totalMinutes)}</td>
                      <td><HrStatusBadge status={log.status} /></td>
                      <td>
                        <div className="hr-actions-cell">
                          <button
                            type="button"
                            className="hr-btn hr-btn-secondary hr-btn-sm"
                            onClick={() => setExpandedId((prev) => (prev === log._id ? null : log._id))}
                          >
                            {expandedId === log._id ? 'Hide' : 'View'}
                          </button>
                          <button
                            type="button"
                            className="hr-btn hr-btn-danger hr-btn-sm"
                            onClick={() => handleDelete(log)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === log._id && (
                      <tr className="hr-worklog-detail-row">
                        <td colSpan={6}>
                          <div className="hr-worklog-detail">
                            {log.notes && (
                              <p className="hr-worklog-detail-notes"><strong>Notes:</strong> {log.notes}</p>
                            )}
                            <ul className="hr-worklog-detail-list">
                              {(log.entries || []).map((entry) => (
                                <li key={entry._id || `${entry.description}-${entry.timeSpentMinutes}`}>
                                  <span>{entry.description}</span>
                                  <strong>{formatDuration(entry.timeSpentMinutes)}</strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default WorkLogs;
