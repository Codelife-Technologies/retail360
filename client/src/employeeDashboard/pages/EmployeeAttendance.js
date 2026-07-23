import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrAttendanceAPI, hrLeavesAPI } from '../../hr/services/hrApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrKpiCard from '../../hr/components/HrKpiCard';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import AttendanceCalendar from '../../hr/components/AttendanceCalendar';
import { extractList } from '../../hr/utils/hrUtils';
import { expandApprovedLeaveDateKeys } from '../../hr/utils/workingDayUtils';
import {
  resolveWorkingHours,
  formatWorkingHoursDisplay,
  isWorkingHoursInProgress,
  formatTime12Hour,
  formatNow12Hour,
} from '../../hr/utils/attendanceUtils';
import {
  buildAttendanceLocationPayload,
  formatLocationAttendanceError,
  formatDistanceMeters,
  prefetchAttendanceLocation,
} from '../../hr/utils/attendanceGeo';

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
  const [calendarRecords, setCalendarRecords] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, leave: 0 });
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [todayDefaults, setTodayDefaults] = useState(null);
  const [loadingToday, setLoadingToday] = useState(true);
  const [marking, setMarking] = useState(false);
  const [workLocation, setWorkLocation] = useState('office');
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | loading | ready | error
  const [geoCache, setGeoCache] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [liveTick, setLiveTick] = useState(0);

  const refreshBrowserLocation = useCallback(async () => {
    setGeoStatus('loading');
    setGeoError('');
    try {
      const location = await prefetchAttendanceLocation();
      setGeoCache(location);
      setGeoStatus('ready');
      return location;
    } catch (error) {
      setGeoCache(null);
      setGeoStatus('error');
      setGeoError(error?.message || 'Unable to fetch your location.');
      return null;
    }
  }, []);

  const loadTodayDefaults = useCallback(async () => {
    try {
      setLoadingToday(true);
      const res = await hrAttendanceAPI.getMarkDefaults(null, { forSelf: true });
      setTodayDefaults(res.data || null);
      if (res.data?.existingRecord) {
        setWorkLocation(statusToWorkLocation(res.data.existingRecord.status));
      }
    } catch (error) {
      console.error('Error loading today attendance:', error);
      setTodayDefaults(null);
      if (error.response?.data?.error) {
        alert(error.response.data.error);
      }
    } finally {
      setLoadingToday(false);
    }
  }, []);

  const fetchMonthData = useCallback(async () => {
    if (!employeeId) return;
    try {
      setLoadingCalendar(true);
      const [summaryRes, calendarRes, leavesRes] = await Promise.all([
        hrAttendanceAPI.getSummary({
          employee: employeeId,
          month: filters.month,
          year: filters.year,
          forSelf: true,
        }),
        hrAttendanceAPI.getAll({
          employee: employeeId,
          month: filters.month,
          year: filters.year,
          limit: 31,
          forSelf: true,
        }),
        hrLeavesAPI.getAll({
          employee: employeeId,
          status: 'Approved',
          limit: 100,
        }),
      ]);
      setCalendarRecords(extractList(calendarRes));
      setApprovedLeaves(extractList(leavesRes));
      setSummary(summaryRes.data || { present: 0, absent: 0, late: 0, leave: 0 });
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setCalendarRecords([]);
      setApprovedLeaves([]);
    } finally {
      setLoadingCalendar(false);
    }
  }, [employeeId, filters.month, filters.year]);

  const approvedLeaveDateKeys = useMemo(
    () =>
      expandApprovedLeaveDateKeys(approvedLeaves, {
        month: filters.month,
        year: filters.year,
      }),
    [approvedLeaves, filters.month, filters.year]
  );

  useEffect(() => {
    loadTodayDefaults();
  }, [loadTodayDefaults]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Prefetch browser GPS on open, then refresh every 90s while the page is open
  useEffect(() => {
    let cancelled = false;
    let timer;

    const run = async () => {
      if (cancelled) return;
      await refreshBrowserLocation();
      if (!cancelled) {
        timer = setTimeout(run, 90000);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refreshBrowserLocation]);

  useEffect(() => {
    const inProgress = todayDefaults?.hoursInProgress
      || isWorkingHoursInProgress(todayDefaults?.existingRecord || {});
    if (!inProgress) return undefined;

    const timer = setInterval(() => {
      setLiveTick((tick) => tick + 1);
    }, 60000);

    return () => clearInterval(timer);
  }, [todayDefaults]);

  const handleMarkAttendance = async () => {
    if (!todayDefaults?.checkIn && !todayDefaults?.alreadyMarked) {
      alert('No login recorded today. Log in to the app first, then mark attendance.');
      return;
    }

    try {
      setMarking(true);
      const selectedStatus = workLocationToStatus(workLocation);
      // GPS is optional — used when available for office radius checks
      const locationPayload = await buildAttendanceLocationPayload({
        requireGps: false,
        optionalGps: selectedStatus !== 'Work From Home',
        cachedLocation: geoCache,
      });

      const response = await hrAttendanceAPI.create({
        status: selectedStatus,
        forSelf: true,
        ...locationPayload,
      });

      if (response.data?.autoWorkFromHome) {
        setWorkLocation('home');
        const distance = response.data.currentDistanceMeters;
        const allowed = response.data.allowedRadiusMeters;
        const office = response.data.officeName || 'the office';
        const distanceText = Number.isFinite(Number(distance))
          ? formatDistanceMeters(distance)
          : 'an unknown distance';
        const allowedText = Number.isFinite(Number(allowed))
          ? formatDistanceMeters(allowed)
          : 'the configured radius';
        alert(
          `Your browser location is about ${distanceText} from ${office} (allowed ${allowedText}), so attendance was marked as Work From Home.\n\n` +
            'If you are actually at the office, ask HR to open Utilities → Location Settings, re-check the office pin on the map, and increase the radius (desktop GPS is often 500–1000 m off).'
        );
      }

      await Promise.all([loadTodayDefaults(), fetchMonthData()]);
    } catch (error) {
      alert(formatLocationAttendanceError(error));
    } finally {
      setMarking(false);
    }
  };

  const todayRecord = todayDefaults?.existingRecord;
  const alreadyMarked = Boolean(todayDefaults?.alreadyMarked);
  const todayCheckIn = todayDefaults?.checkIn || todayRecord?.checkIn || '';
  // Only real logout time — never show live clock as check-out
  const todayCheckOut = todayDefaults?.checkOut || '';
  const todayHoursInProgress = Boolean(
    todayDefaults?.hoursInProgress
    || isWorkingHoursInProgress({
      checkIn: todayCheckIn,
      checkOut: todayCheckOut,
      date: todayDefaults?.date || new Date(),
    })
  );
  const todayWorkingHours = resolveWorkingHours({
    checkIn: todayCheckIn,
    checkOut: todayCheckOut,
    date: todayDefaults?.date || new Date(),
    workingHours: todayRecord?.workingHours ?? todayDefaults?.workingHours,
  });
  const displayCheckOut = todayCheckOut;
  void liveTick;

  return (
    <>
      <header className="ed-section-header ed-attendance-page-header">
        <div>
          <h2>My Attendance</h2>
        </div>
      </header>

      <section className="ed-attendance-today ed-table-card">
        <div className="ed-attendance-today-header">
          <div>
            <h3>Today — {formatTodayLabel()}</h3>
            <p className="ed-attendance-live-clock">
              {formatNow12Hour()}
              <span
                className={`ed-attendance-geo-status${
                  geoStatus === 'ready' ? ' ready' : geoStatus === 'error' ? ' error' : ''
                }`}
              >
                {geoStatus === 'loading' || geoStatus === 'idle'
                  ? ' · Locating…'
                  : geoStatus === 'ready'
                    ? ' · Location ready'
                    : ' · Location off'}
                {geoStatus === 'error' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="ed-attendance-geo-retry"
                      onClick={refreshBrowserLocation}
                    >
                      Retry
                    </button>
                  </>
                )}
              </span>
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
                ? 'Update'
                : 'Mark Attendance'}
          </button>
        </div>

        {loadingToday ? (
          <div className="ed-attendance-today-body ed-loading-inline">Loading…</div>
        ) : (
          <div className="ed-attendance-today-body">
            <div className="ed-attendance-times">
              <div>
                <span className="ed-attendance-time-label">Check In</span>
                <strong>{formatTime12Hour(todayCheckIn)}</strong>
              </div>
              <div>
                <span className="ed-attendance-time-label">Check Out</span>
                <strong>{formatTime12Hour(displayCheckOut)}</strong>
              </div>
              <div>
                <span className="ed-attendance-time-label">Hours</span>
                <strong>
                  {formatWorkingHoursDisplay(todayWorkingHours, { inProgress: todayHoursInProgress })}
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

            <div className="ed-form-group ed-attendance-work-from">
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
              <p className="ed-attendance-hint">Log in first to record check-in, then mark attendance.</p>
            )}

            {!alreadyMarked && todayDefaults?.pastHalfDayCutoff && (
              <p className="ed-attendance-hint">Past 12:30 — marking now counts as a half day.</p>
            )}

            {alreadyMarked && todayRecord?.status === 'Half Day' && (
              <p className="ed-attendance-hint">Marked after 12:30 — recorded as half day.</p>
            )}

            {alreadyMarked && todayRecord?.status === 'Absent' && (
              <p className="ed-attendance-hint">Auto-absent after 12:30. Mark now to convert to half day.</p>
            )}

            {alreadyMarked && todayRecord?.status !== 'Absent' && todayRecord?.status !== 'Half Day' && (
              <p className="ed-attendance-hint success">Marked for today. Update to change office/home or refresh checkout.</p>
            )}
          </div>
        )}
      </section>

      <div className="ed-filters-row">
        <select
          value={filters.month}
          onChange={(e) => {
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

      <AttendanceCalendar
        month={filters.month}
        year={filters.year}
        records={calendarRecords}
        approvedLeaveDateKeys={approvedLeaveDateKeys}
        loading={loadingCalendar}
      />
    </>
  );
}

function EmployeeAttendance() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeAttendanceContent employeeId={context.employeeId} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeAttendance;
