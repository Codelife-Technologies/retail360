import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrWorkLogsAPI, hrEmployeesAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrStatusBadge from '../components/HrStatusBadge';
import {
  extractList,
  formatDate,
  formatDuration,
  employeeName,
  HR_PERIOD_OPTIONS,
  getHrPeriodRange,
  formatHrPeriodLabel,
  downloadBlobResponse,
} from '../utils/hrUtils';

function DailyWorkLogsView({ employees }) {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({
    totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 },
    byEmployee: [],
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => {
    const month = getHrPeriodRange('month') || { fromDate: '', toDate: '' };
    return {
      period: 'month',
      employee: '',
      status: '',
      fromDate: month.fromDate,
      toDate: month.toDate,
    };
  });
  const [exporting, setExporting] = useState(false);

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
      const logsRes = await hrWorkLogsAPI.getAll(filterParams);
      setLogs(extractList(logsRes));

      try {
        const summaryRes = await hrWorkLogsAPI.getSummary(filterParams);
        setSummary(
          summaryRes.data || {
            totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 },
            byEmployee: [],
          }
        );
      } catch (summaryError) {
        console.error('Error fetching work log summary:', summaryError);
        const list = extractList(logsRes);
        setSummary({
          totals: {
            logCount: list.length,
            totalMinutes: list.reduce((sum, log) => sum + (Number(log.totalMinutes) || 0), 0),
            submittedCount: list.filter((log) => log.status === 'Submitted').length,
          },
          byEmployee: [],
        });
      }
    } catch (error) {
      console.error('Error fetching work logs:', error);
      setLogs([]);
      setSummary({ totals: { logCount: 0, totalMinutes: 0, submittedCount: 0 }, byEmployee: [] });
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePeriodChange = (period) => {
    const range = getHrPeriodRange(period);
    setFilters((f) => ({
      ...f,
      period,
      ...(range || {}),
    }));
  };

  const handleDelete = async (log) => {
    if (!window.confirm(`Delete work log for ${employeeName(log.employee)} on ${formatDate(log.date)}?`)) {
      return;
    }
    try {
      await hrWorkLogsAPI.delete(log._id);
      fetchData();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete work log');
    }
  };

  const periodLabel = formatHrPeriodLabel(filters.period, filters.fromDate, filters.toDate);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const response = await hrWorkLogsAPI.exportExcel(filterParams);
      downloadBlobResponse(response, `hr_work_logs_${filters.fromDate || 'export'}.xlsx`);
    } catch (error) {
      alert(error.response?.data?.error || error.message || 'Failed to download Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
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

      <div className="hr-worklog-filters">
        <div className="hr-period-toggle">
          {HR_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={filters.period === opt.id ? 'active' : ''}
              onClick={() => handlePeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="hr-filters-row hr-worklog-filter-row">
          {filters.period === 'custom' && (
            <>
              <input
                type="date"
                className="hr-filter-select"
                value={filters.fromDate}
                max={filters.toDate || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, period: 'custom', fromDate: e.target.value }))
                }
                title="From date"
              />
              <input
                type="date"
                className="hr-filter-select"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, period: 'custom', toDate: e.target.value }))
                }
                title="To date"
              />
            </>
          )}
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
          <button
            type="button"
            className="hr-btn hr-btn-secondary"
            onClick={handleExportExcel}
            disabled={exporting || loading}
          >
            {exporting ? 'Downloading…' : 'Download Excel'}
          </button>
        </div>
        <p className="hr-worklog-period-hint">
          Showing: <strong>{periodLabel}</strong>
        </p>
      </div>

      {loading ? (
        <div className="hr-loading">Loading work logs...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Tasks</th>
                <th>Total Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="hr-empty">
                    No work logs found for {periodLabel.toLowerCase()}. Try This Month, Custom dates,
                    or Monthly Report.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>{formatDate(log.date)}</td>
                    <td>{employeeName(log.employee)}</td>
                    <td>
                      {(log.entries || []).length === 0 ? (
                        <span className="hr-muted">—</span>
                      ) : (
                        <ul className="hr-worklog-task-list">
                          {(log.entries || []).map((entry, idx) => (
                            <li key={entry._id || `${log._id}-${idx}`}>
                              <span className="hr-worklog-task-desc">
                                {entry.description || '—'}
                                {entry.details ? (
                                  <small className="hr-worklog-entry-details"> — {entry.details}</small>
                                ) : null}
                              </span>
                              <strong className="hr-worklog-task-time">
                                {formatDuration(entry.timeSpentMinutes)}
                              </strong>
                            </li>
                          ))}
                          {log.notes ? (
                            <li className="hr-worklog-task-notes">
                              <span><em>Notes:</em> {log.notes}</span>
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </td>
                    <td className="hr-worklog-total-time">
                      <strong>{formatDuration(log.totalMinutes)}</strong>
                    </td>
                    <td>
                      <HrStatusBadge status={log.status} />
                    </td>
                    <td>
                      <div className="hr-actions-cell">
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
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function MonthlyWorkLogReportView({ employees, departments }) {
  const now = new Date();
  const [filters, setFilters] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    employee: '',
    department: '',
    status: '',
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);

  const filterParams = useMemo(() => {
    const params = { month: filters.month, year: filters.year };
    if (filters.employee) params.employee = filters.employee;
    if (filters.department) params.department = filters.department;
    if (filters.status) params.status = filters.status;
    return params;
  }, [filters]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hrWorkLogsAPI.getMonthlyReport(filterParams);
      setReport(response.data);
      setExpandedId(null);
    } catch (error) {
      console.error('Error fetching monthly work log report:', error);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filteredEmployees = useMemo(() => {
    const rows = report?.employees || [];
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      const emp = row.employee;
      const haystack = [
        employeeName(emp),
        emp?.employeeId,
        emp?.department,
        emp?.designation,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [report, searchTerm]);

  const periodLabel = report?.period?.label || '';

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const response = await hrWorkLogsAPI.exportMonthlyExcel(filterParams);
      const stamp = `${filters.year}-${String(filters.month).padStart(2, '0')}`;
      downloadBlobResponse(response, `hr_work_logs_${stamp}.xlsx`);
    } catch (error) {
      alert(error.response?.data?.error || error.message || 'Failed to download Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="hr-kpi-grid">
        <HrKpiCard icon="👥" label="Employees" value={report?.totals?.employeeCount || 0} variant="info" />
        <HrKpiCard icon="📅" label="Employees with logs" value={report?.totals?.employeesWithLogs || 0} />
        <HrKpiCard icon="📝" label="Total logs" value={report?.totals?.logCount || 0} variant="warning" />
        <HrKpiCard
          icon="⏱️"
          label="Total time logged"
          value={formatDuration(report?.totals?.totalMinutes)}
          variant="success"
        />
      </div>

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
          max="2035"
          onChange={(e) => setFilters((f) => ({ ...f, year: parseInt(e.target.value, 10) || f.year }))}
        />
        <select
          className="hr-filter-select"
          value={filters.department}
          onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
        >
          <option value="">All Departments</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
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
      </div>

      {loading ? (
        <div className="hr-loading">Loading monthly report...</div>
      ) : (
        <div className="hr-table-card">
          <div className="hr-worklog-report-period">
            <h3>{periodLabel || 'Selected month'}</h3>
            <div className="hr-worklog-report-period-actions">
              <span>{filteredEmployees.length} employee(s)</span>
              <button
                type="button"
                className="hr-btn hr-btn-primary hr-btn-sm"
                disabled={loading || exporting || !report?.employees?.length}
                onClick={handleExportExcel}
              >
                {exporting ? 'Downloading…' : 'Download Excel'}
              </button>
            </div>
          </div>
          <table className="hr-table hr-worklog-report-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Days Logged</th>
                <th>Total Time</th>
                <th>Submitted</th>
                <th>Draft</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hr-empty">
                    No employees found for the selected filters
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((row) => {
                  const empKey = String(row.employee?._id || '');
                  const isExpanded = expandedId === empKey;
                  return (
                    <React.Fragment key={empKey || employeeName(row.employee)}>
                      <tr className={row.summary.logCount === 0 ? 'hr-worklog-report-empty-row' : ''}>
                        <td>
                          <div className="hr-worklog-report-employee">
                            <strong>{employeeName(row.employee)}</strong>
                            <span>{row.employee?.employeeId}</span>
                          </div>
                        </td>
                        <td>{row.employee?.department || '—'}</td>
                        <td>{row.summary.daysLogged}</td>
                        <td>{formatDuration(row.summary.totalMinutes)}</td>
                        <td>{row.summary.submittedCount}</td>
                        <td>{row.summary.draftCount}</td>
                        <td>
                          <button
                            type="button"
                            className="hr-btn hr-btn-secondary hr-btn-sm"
                            onClick={() => setExpandedId((prev) => (prev === empKey ? null : empKey))}
                          >
                            {isExpanded ? 'Hide Details' : 'View Details'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="hr-worklog-detail-row">
                          <td colSpan={7}>
                            <div className="hr-worklog-report-detail">
                              {row.logs.length === 0 ? (
                                <p className="hr-empty">No work logs recorded this month</p>
                              ) : (
                                row.logs.map((log) => (
                                  <div key={log._id} className="hr-worklog-report-day">
                                    <div className="hr-worklog-report-day-header">
                                      <div>
                                        <strong>{formatDate(log.date)}</strong>
                                        <span>{formatDuration(log.totalMinutes)}</span>
                                      </div>
                                      <HrStatusBadge status={log.status} />
                                    </div>
                                    {log.notes && (
                                      <p className="hr-worklog-detail-notes">
                                        <strong>Notes:</strong> {log.notes}
                                      </p>
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
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function WorkLogs() {
  const [viewMode, setViewMode] = useState('daily');
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    hrEmployeesAPI
      .getAll({ status: 'Active' })
      .then((res) => setEmployees(extractList(res)))
      .catch(() => setEmployees([]));

    hrEmployeesAPI
      .getDepartments()
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartments([]));
  }, []);

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Work Logs</h1>
          <p className="hr-page-subtitle">
            Review daily work updates and monthly employee work log reports
          </p>
        </div>
      </header>

      <div className="hr-view-tabs">
        <button
          type="button"
          className={`hr-view-tab${viewMode === 'daily' ? ' active' : ''}`}
          onClick={() => setViewMode('daily')}
        >
          Daily Logs
        </button>
        <button
          type="button"
          className={`hr-view-tab${viewMode === 'report' ? ' active' : ''}`}
          onClick={() => setViewMode('report')}
        >
          Monthly Report
        </button>
      </div>

      {viewMode === 'daily' ? (
        <DailyWorkLogsView employees={employees} />
      ) : (
        <MonthlyWorkLogReportView employees={employees} departments={departments} />
      )}
    </div>
  );
}

export default WorkLogs;
