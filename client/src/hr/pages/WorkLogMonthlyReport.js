import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrWorkLogsAPI, hrEmployeesAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrStatusBadge from '../components/HrStatusBadge';
import {
  formatDate,
  formatDuration,
  employeeName,
  extractList,
} from '../utils/hrUtils';

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadMonthlyReportCsv(report, periodLabel) {
  const rows = [
    ['Employee', 'Employee ID', 'Department', 'Date', 'Task', 'Time', 'Status', 'Notes'],
  ];

  (report?.employees || []).forEach((row) => {
    const emp = row.employee;
    const name = employeeName(emp);
    const empId = emp?.employeeId || '';
    const dept = emp?.department || '';

    if (!row.logs?.length) {
      rows.push([name, empId, dept, '', 'No logs', '', '', '']);
      return;
    }

    row.logs.forEach((log) => {
      const date = formatDate(log.date);
      const notes = log.notes || '';
      if (!log.entries?.length) {
        rows.push([name, empId, dept, date, '—', formatDuration(log.totalMinutes), log.status, notes]);
        return;
      }
      log.entries.forEach((entry, index) => {
        rows.push([
          index === 0 ? name : '',
          index === 0 ? empId : '',
          index === 0 ? dept : '',
          index === 0 ? date : '',
          entry.description,
          formatDuration(entry.timeSpentMinutes),
          index === 0 ? log.status : '',
          index === 0 ? notes : '',
        ]);
      });
    });
  });

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `work-log-report-${periodLabel.replace(/\s+/g, '-').toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function WorkLogMonthlyReport() {
  const now = new Date();
  const [filters, setFilters] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    employee: '',
    department: '',
    status: '',
  });
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

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
    hrEmployeesAPI.getDepartments().then((res) => {
      setDepartments(Array.isArray(res.data) ? res.data : []);
    }).catch(() => setDepartments([]));

    hrEmployeesAPI.getAll({ status: 'Active' }).then((res) => {
      setEmployees(extractList(res));
    }).catch(() => setEmployees([]));
  }, []);

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
      ].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [report, searchTerm]);

  const periodLabel = report?.period?.label || '';

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Monthly Work Log Report</h1>
          <p className="hr-page-subtitle">
            View each employee&apos;s daily work entries and time spent for the selected month
          </p>
        </div>
        <button
          type="button"
          className="hr-btn hr-btn-primary"
          disabled={loading || !report?.employees?.length}
          onClick={() => downloadMonthlyReportCsv(report, periodLabel || 'report')}
        >
          Export CSV
        </button>
      </header>

      <div className="hr-kpi-grid">
        <HrKpiCard
          icon="👥"
          label="Employees"
          value={report?.totals?.employeeCount || 0}
          variant="info"
        />
        <HrKpiCard
          icon="📅"
          label="Employees with logs"
          value={report?.totals?.employeesWithLogs || 0}
        />
        <HrKpiCard
          icon="📝"
          label="Total logs"
          value={report?.totals?.logCount || 0}
          variant="warning"
        />
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
            <option key={dept} value={dept}>{dept}</option>
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
            <span>{filteredEmployees.length} employee(s)</span>
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
                  <td colSpan={7} className="hr-empty">No employees found for the selected filters</td>
                </tr>
              ) : (
                filteredEmployees.map((row) => {
                  const empKey = row.employee?._id;
                  const isExpanded = expandedId === empKey;
                  return (
                    <React.Fragment key={empKey}>
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
    </div>
  );
}

export default WorkLogMonthlyReport;
