import React, { useCallback, useEffect, useState } from 'react';
import { hrAttendanceAPI } from '../../hr/services/hrApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrKpiCard from '../../hr/components/HrKpiCard';
import HrPagination from '../../hr/components/HrPagination';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import { extractList, extractPagination, formatDate } from '../../hr/utils/hrUtils';

const WORK_LOCATIONS = [
  { id: 'office', label: 'Office', status: 'Present', icon: '🏢' },
  { id: 'home', label: 'Work From Home', status: 'Work From Home', icon: '🏠' },
];

function statusToWorkLocation(status) {
  return status === 'Work From Home' ? 'home' : 'office';
}

function workLocationToStatus(workLocation) {
  return workLocation === 'home' ? 'Work From Home' : 'Present';
}

const formatTodayLabel = () =>
  new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function EmployeeAttendanceContent({ employeeId }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [loading, setLoading] = useState(true);
  const [todayDefaults, setTodayDefaults] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [marking, setMarking] = useState(false);
  const [workLocation, setWorkLocation] = useState('office');
  const [notes, setNotes] = useState('');
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const loadTodayDefaults = useCallback(async () => {
    try {
      setLoadingToday(true);
      const res = await hrAttendanceAPI.getMarkDefaults();
      setTodayDefaults(res.data || null);
      if (res.data?.existingRecord) {
        setWorkLocation(statusToWorkLocation(res.data.existingRecord.status));
        if (res.data.existingRecord.notes) {
          setNotes(res.data.existingRecord.notes);
        }
      }
    } catch (error) {
      console.error('Error loading today attendance:', error);
      setTodayDefaults(null);
    } finally {
      setLoadingToday(false);
    }
  }, []);

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
          employee: employeeId,
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
    loadTodayDefaults();
  }, [loadTodayDefaults]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleMarkAttendance = async () => {
    if (!todayDefaults?.checkIn && !todayDefaults?.alreadyMarked) {
      alert('No login recorded today. Log in to the app first, then mark attendance.');
      return;
    }

    try {
      setMarking(true);
      await hrAttendanceAPI.create({
        notes,
        status: workLocationToStatus(workLocation),
      });
      await Promise.all([loadTodayDefaults(), fetchRecords()]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to mark attendance');
    } finally {
      setMarking(false);
    }
  };

  const todayRecord = todayDefaults?.existingRecord;
  const alreadyMarked = Boolean(todayDefaults?.alreadyMarked);

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>My Attendance</h2>
          <p>Mark today&apos;s attendance and select whether you are working from office or home.</p>
        </div>
      </header>

      <section className="ed-attendance-today ed-table-card">
        <div className="ed-attendance-today-header">
          <div>
            <h3>Today — {formatTodayLabel()}</h3>
            <p className="ed-attendance-today-subtitle">
              Check-in and check-out are taken from when you log in and out of the app.
            </p>
          </div>
          <button
            type="button"
            className="ed-btn ed-btn-primary"
            disabled={marking || loadingToday || (!todayDefaults?.checkIn && !alreadyMarked)}
            onClick={handleMarkAttendance}
          >
            {marking
              ? 'Saving…'
              : alreadyMarked
                ? 'Update Attendance'
                : 'Mark Today\'s Attendance'}
          </button>
        </div>

        {loadingToday ? (
          <div className="ed-attendance-today-body ed-loading-inline">Loading today&apos;s session…</div>
        ) : (
          <div className="ed-attendance-today-body">
            <div className="ed-attendance-times">
              <div>
                <span className="ed-attendance-time-label">Check In</span>
                <strong>{todayDefaults?.checkIn || todayRecord?.checkIn || '—'}</strong>
              </div>
              <div>
                <span className="ed-attendance-time-label">Check Out</span>
                <strong>{todayDefaults?.checkOut || todayRecord?.checkOut || '—'}</strong>
              </div>
              <div>
                <span className="ed-attendance-time-label">Working Hours</span>
                <strong>
                  {todayRecord?.workingHours ?? todayDefaults?.workingHours ?? 0}
                </strong>
              </div>
              <div>
                <span className="ed-attendance-time-label">Status</span>
                {todayRecord?.status ? (
                  <HrStatusBadge status={todayRecord.status} />
                ) : (
                  <strong>{alreadyMarked ? 'Present' : 'Not marked'}</strong>
                )}
              </div>
            </div>

            <div className="ed-form-group">
              <label>Working From</label>
              <div className="ed-work-location-options">
                {WORK_LOCATIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`ed-work-location-option${workLocation === option.id ? ' active' : ''}`}
                    onClick={() => setWorkLocation(option.id)}
                  >
                    <span className="ed-work-location-icon">{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {!todayDefaults?.checkIn && !alreadyMarked && (
              <p className="ed-attendance-hint">
                Log in to the app first. Your check-in time will appear here automatically.
              </p>
            )}

            {alreadyMarked && (
              <p className="ed-attendance-hint success">
                Attendance marked for today. You can change office/home or log out and click &quot;Update Attendance&quot; to refresh checkout.
              </p>
            )}

            <div className="ed-form-group">
              <label>Notes (optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note for today"
              />
            </div>
          </div>
        )}
      </section>

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
