import React, { useMemo } from 'react';
import {
  buildAttendanceCalendar,
  computeAttendanceCalendarStats,
} from '../utils/workingDayUtils';
import { formatTime12Hour } from '../utils/attendanceUtils';

const STATE_LABELS = {
  present: 'Present',
  absent: 'Absent',
  leave: 'Leave',
  halfday: 'Half Day',
  holiday: 'Holiday',
  weekoff: 'Week Off',
  pending: 'Not marked',
  future: '',
};

function cellTitle(cell) {
  if (cell.otherMonth || cell.state === 'other') return '';
  if (cell.state === 'leave' || cell.onApprovedLeave) {
    return 'Approved leave';
  }
  if (cell.state === 'weekoff') {
    return cell.label === 'Sun' ? 'Sunday — not counted' : '2nd / 4th Saturday — not counted';
  }
  if (cell.record) {
    const parts = [cell.record.status];
    if (cell.record.checkIn) parts.push(`In: ${formatTime12Hour(cell.record.checkIn)}`);
    if (cell.record.checkOut) parts.push(`Out: ${formatTime12Hour(cell.record.checkOut)}`);
    return parts.join(' · ');
  }
  if (cell.state === 'pending') return 'Working day — attendance not marked yet';
  if (cell.state === 'absent') return 'Absent — no attendance marked';
  if (cell.state === 'future') return 'Upcoming working day';
  return STATE_LABELS[cell.state] || '';
}

function AttendanceCalendar({
  month,
  year,
  records = [],
  approvedLeaveDateKeys = null,
  loading = false,
}) {
  const { cells, dayNames } = useMemo(
    () => buildAttendanceCalendar({ month, year, records, approvedLeaveDateKeys }),
    [month, year, records, approvedLeaveDateKeys]
  );

  const stats = useMemo(
    () => computeAttendanceCalendarStats(cells),
    [cells]
  );

  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <section className="attendance-calendar">
      <div className="attendance-calendar-header">
        <div>
          <h3>Attendance Calendar</h3>
          <p className="attendance-calendar-subtitle">
            {monthLabel} · Sundays and 2nd / 4th Saturdays are not counted
          </p>
        </div>
        <div className="attendance-calendar-stats">
          <span><strong>{stats.workingDays}</strong> working days</span>
          <span className="stat-present"><strong>{stats.present}</strong> present</span>
          <span className="stat-absent"><strong>{stats.absent}</strong> absent</span>
          {stats.leave > 0 && (
            <span className="stat-leave"><strong>{stats.leave}</strong> leave</span>
          )}
        </div>
      </div>

      <div className="attendance-calendar-legend">
        <span className="legend-item legend-present">Present</span>
        <span className="legend-item legend-absent">Absent</span>
        <span className="legend-item legend-leave">Approved Leave</span>
        <span className="legend-item legend-weekoff">Week Off</span>
        <span className="legend-item legend-pending">Not marked</span>
      </div>

      {loading ? (
        <div className="attendance-calendar-loading">Loading calendar…</div>
      ) : (
        <div className="attendance-calendar-grid">
          {dayNames.map((name) => (
            <div key={name} className="attendance-calendar-day-header">{name}</div>
          ))}
          {cells.map((cell, idx) => (
            <div
              key={idx}
              className={[
                'attendance-calendar-day',
                cell.otherMonth ? 'other-month' : '',
                cell.isToday ? 'today' : '',
                cell.state !== 'other' ? `state-${cell.state}` : '',
              ].filter(Boolean).join(' ')}
              title={cellTitle(cell)}
            >
              <span className="attendance-calendar-day-num">{cell.day}</span>
              {cell.label && (
                <span className="attendance-calendar-day-tag">{cell.label}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default AttendanceCalendar;
