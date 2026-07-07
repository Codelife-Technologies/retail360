import React, { useCallback, useEffect, useState } from 'react';
import { hrAttendanceAPI } from '../../hr/services/hrApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrKpiCard from '../../hr/components/HrKpiCard';
import HrPagination from '../../hr/components/HrPagination';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import { extractList, extractPagination, formatDate } from '../../hr/utils/hrUtils';

function EmployeeAttendanceContent({ employeeId }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const fetchRecords = useCallback(async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const [recordsRes, summaryRes] = await Promise.all([
        hrAttendanceAPI.getAll({
          employee: employeeId,
          month: filters.month,
          year: filters.year,
          page,
          limit: 15,
        }),
        hrAttendanceAPI.getSummary({
          month: filters.month,
          year: filters.year,
        }),
      ]);
      setRecords(extractList(recordsRes));
      setPagination(extractPagination(recordsRes));
      setSummary(summaryRes.data || { present: 0, absent: 0, late: 0, leave: 0 });
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, filters, page]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>My Attendance</h2>
          <p>View your attendance records and monthly summary.</p>
        </div>
      </header>

      <div className="ed-filters-row">
        <select
          value={filters.month}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, month: parseInt(e.target.value, 10) }));
          }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          value={filters.year}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, year: parseInt(e.target.value, 10) }));
          }}
        >
          {[filters.year - 1, filters.year, filters.year + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="ed-kpi-row">
        <HrKpiCard icon="✅" label="Present" value={summary.present} variant="success" />
        <HrKpiCard icon="❌" label="Absent" value={summary.absent} variant="danger" />
        <HrKpiCard icon="⏰" label="Half Day" value={summary.late} variant="warning" />
        <HrKpiCard icon="🏖️" label="On Leave" value={summary.leave} />
      </div>

      {loading ? (
        <div className="ed-loading">Loading attendance...</div>
      ) : (
        <div className="ed-table-card">
          <table className="ed-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={6} className="ed-empty">No attendance records for this period.</td></tr>
              ) : (
                records.map((record) => (
                  <tr key={record._id}>
                    <td>{formatDate(record.date)}</td>
                    <td>{record.checkIn || '—'}</td>
                    <td>{record.checkOut || '—'}</td>
                    <td>{record.workingHours || 0}</td>
                    <td><HrStatusBadge status={record.status} /></td>
                    <td>{record.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <HrPagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

function EmployeeAttendance() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeAttendanceContent employeeId={context.employeeId} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeAttendance;
