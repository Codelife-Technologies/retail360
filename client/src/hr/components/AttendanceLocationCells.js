import React from 'react';
import { formatDistanceMeters, googleMapsUrl } from '../utils/attendanceGeo';
import { formatTime12Hour } from '../utils/attendanceUtils';

function AttendanceLocationLink({ location, title = 'Open check-in location in Google Maps' }) {
  if (!location || location.latitude == null || location.longitude == null) {
    return <span className="hr-muted">—</span>;
  }

  const url = googleMapsUrl(location.latitude, location.longitude);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hr-map-link"
      title={title}
      aria-label={title}
    >
      📍
    </a>
  );
}

function AttendanceLocationCells({ location }) {
  const loc = location || {};
  return (
    <>
      <td>
        <AttendanceLocationLink location={loc} />
      </td>
      <td>{loc.latitude != null ? Number(loc.latitude).toFixed(5) : '—'}</td>
      <td>{loc.longitude != null ? Number(loc.longitude).toFixed(5) : '—'}</td>
      <td>{loc.distanceMeters != null ? formatDistanceMeters(loc.distanceMeters) : '—'}</td>
      <td>{loc.officeName || '—'}</td>
    </>
  );
}

function AttendanceHistoryTable({ records = [], loading = false, showEmployee = false }) {
  if (loading) {
    return <div className="hr-loading">Loading attendance history…</div>;
  }

  return (
    <div className="hr-table-card attendance-location-history">
      <table className="hr-table">
        <thead>
          <tr>
            {showEmployee && <th>Employee</th>}
            <th>Date</th>
            <th>Map</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Distance</th>
            <th>Office</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={showEmployee ? 10 : 9} className="hr-empty">
                No attendance records found
              </td>
            </tr>
          ) : (
            records.map((row) => (
              <tr key={row._id}>
                {showEmployee && (
                  <td>
                    {row.employee
                      ? `${row.employee.firstName || ''} ${row.employee.lastName || ''}`.trim()
                      : '—'}
                  </td>
                )}
                <td>
                  {row.date
                    ? new Date(row.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </td>
                <AttendanceLocationCells location={row.location} />
                <td>{formatTime12Hour(row.checkIn)}</td>
                <td>{formatTime12Hour(row.checkOut)}</td>
                <td>{row.status || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export { AttendanceLocationLink, AttendanceLocationCells, AttendanceHistoryTable };
export default AttendanceHistoryTable;
