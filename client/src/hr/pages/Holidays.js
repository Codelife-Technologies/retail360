import React, { useState, useEffect, useCallback } from 'react';
import { hrHolidaysAPI } from '../services/hrApi';
import HrPagination from '../components/HrPagination';
import HrStatusBadge from '../components/HrStatusBadge';
import { extractList, extractPagination, formatDate, toInputDate } from '../utils/hrUtils';

const HOLIDAY_TYPES = ['National', 'Regional', 'Company', 'Restricted'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyForm = () => ({
  name: '',
  date: '',
  day: '',
  type: 'Company',
  status: 'Active',
});

function Holidays() {
  const now = new Date();
  const [viewMode, setViewMode] = useState('table');
  const [holidays, setHolidays] = useState([]);
  const [calendarHolidays, setCalendarHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ type: '', status: '', year: now.getFullYear() });
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [seedingHolidays, setSeedingHolidays] = useState(false);
  const [seedMessage, setSeedMessage] = useState('');

  const fetchHolidays = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hrHolidaysAPI.getAll({
        search: searchTerm,
        type: filters.type,
        status: filters.status,
        year: filters.year,
        page,
        limit: 15,
      });
      setHolidays(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      console.error('Error fetching holidays:', error);
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filters, page]);

  const fetchCalendar = useCallback(async () => {
    try {
      const response = await hrHolidaysAPI.getCalendar({ month: calMonth, year: calYear });
      setCalendarHolidays(response.data || []);
    } catch (error) {
      setCalendarHolidays([]);
    }
  }, [calMonth, calYear]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const importStandardHolidays = useCallback(async (year, silent = false) => {
    try {
      setSeedingHolidays(true);
      if (!silent) setSeedMessage('');
      const response = await hrHolidaysAPI.seedStandard(year);
      const msg = response.data?.message || 'Holidays imported.';
      if (!silent) setSeedMessage(msg);
      fetchHolidays();
      if (viewMode === 'calendar') fetchCalendar();
      return response.data;
    } catch (error) {
      const errMsg = error.response?.data?.error || 'Failed to import holidays';
      if (!silent) setSeedMessage(errMsg);
      return null;
    } finally {
      setSeedingHolidays(false);
    }
  }, [fetchHolidays, fetchCalendar, viewMode]);

  useEffect(() => {
    importStandardHolidays(filters.year, true);
  }, [filters.year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode === 'calendar') fetchCalendar();
  }, [viewMode, fetchCalendar]);

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Holiday name is required';
    if (!formData.date) errors.date = 'Date is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const day = new Date(formData.date).toLocaleDateString('en-US', { weekday: 'long' });
      const payload = { ...formData, day };
      if (editingHoliday) {
        await hrHolidaysAPI.update(editingHoliday._id, payload);
      } else {
        await hrHolidaysAPI.create(payload);
      }
      setShowModal(false);
      setEditingHoliday(null);
      setFormData(emptyForm());
      fetchHolidays();
      if (viewMode === 'calendar') fetchCalendar();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save holiday');
    }
  };

  const openAdd = () => {
    setEditingHoliday(null);
    setFormData(emptyForm());
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: toInputDate(holiday.date),
      day: holiday.day || '',
      type: holiday.type,
      status: holiday.status,
    });
    setFormErrors({});
    setShowModal(true);
  };

  const handleDelete = async (holiday) => {
    if (!window.confirm(`Delete holiday "${holiday.name}"?`)) return;
    try {
      await hrHolidaysAPI.delete(holiday._id);
      fetchHolidays();
      if (viewMode === 'calendar') fetchCalendar();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete holiday');
    }
  };

  const buildCalendarDays = () => {
    const firstDay = new Date(calYear, calMonth - 1, 1);
    const lastDay = new Date(calYear, calMonth, 0);
    const startPad = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const holidayMap = new Map(
      calendarHolidays.map((h) => [toInputDate(h.date), h])
    );
    const todayStr = toInputDate(new Date());
    const cells = [];

    const prevMonthLast = new Date(calYear, calMonth - 1, 0).getDate();
    for (let i = startPad - 1; i >= 0; i -= 1) {
      cells.push({ day: prevMonthLast - i, otherMonth: true });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        day: d,
        dateStr,
        holiday: holidayMap.get(dateStr),
        isToday: dateStr === todayStr,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: cells.length - daysInMonth - startPad + 1, otherMonth: true });
    }
    return cells;
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Holiday Management</h1>
          <p className="hr-page-subtitle">Manage company holidays and calendar view</p>
        </div>
        <div className="hr-header-actions">
          <button type="button" className="hr-btn hr-btn-secondary" disabled={seedingHolidays} onClick={() => importStandardHolidays(filters.year)}>
            {seedingHolidays ? 'Importing…' : 'Import Standard Holidays'}
          </button>
          <button type="button" className="hr-btn hr-btn-primary" onClick={openAdd}>
            + Add Holiday
          </button>
        </div>
      </header>

      {seedMessage && (
        <p className="hr-seed-message">{seedMessage}</p>
      )}

      <div className="hr-view-tabs">
        <button type="button" className={`hr-view-tab${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')}>Table View</button>
        <button type="button" className={`hr-view-tab${viewMode === 'calendar' ? ' active' : ''}`} onClick={() => setViewMode('calendar')}>Calendar View</button>
      </div>

      {viewMode === 'table' ? (
        <>
          <div className="hr-filters-row">
            <input type="text" className="hr-search-input" placeholder="Search holiday..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <select className="hr-filter-select" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
              <option value="">All Types</option>
              {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="hr-filter-select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <input type="number" className="hr-filter-input" value={filters.year} min="2020" max="2030" onChange={(e) => setFilters((f) => ({ ...f, year: parseInt(e.target.value, 10) }))} />
          </div>

          {loading ? (
            <div className="hr-loading">Loading holidays...</div>
          ) : (
            <div className="hr-table-card">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Holiday Name</th>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.length === 0 ? (
                    <tr><td colSpan={6} className="hr-empty">No holidays found</td></tr>
                  ) : (
                    holidays.map((h) => (
                      <tr key={h._id}>
                        <td>{h.name}</td>
                        <td>{formatDate(h.date)}</td>
                        <td>{h.day}</td>
                        <td>{h.type}</td>
                        <td><HrStatusBadge status={h.status} /></td>
                        <td>
                          <div className="hr-actions-cell">
                            <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => openEdit(h)}>Edit</button>
                            <button type="button" className="hr-btn hr-btn-danger hr-btn-sm" onClick={() => handleDelete(h)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <HrPagination pagination={pagination} onPageChange={setPage} />
            </div>
          )}
        </>
      ) : (
        <div className="hr-panel-card">
          <div className="hr-filters-row" style={{ marginBottom: '1rem' }}>
            <select className="hr-filter-select" value={calMonth} onChange={(e) => setCalMonth(parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}</option>
              ))}
            </select>
            <input type="number" className="hr-filter-input" value={calYear} min="2020" max="2030" onChange={(e) => setCalYear(parseInt(e.target.value, 10))} />
          </div>
          <div className="hr-calendar-grid">
            {DAY_NAMES.map((d) => (
              <div key={d} className="hr-calendar-day-header">{d}</div>
            ))}
            {buildCalendarDays().map((cell, idx) => (
              <div
                key={idx}
                className={`hr-calendar-day${cell.otherMonth ? ' other-month' : ''}${cell.isToday ? ' today' : ''}${cell.holiday ? ' holiday' : ''}`}
                title={cell.holiday?.name}
              >
                <span>{cell.day}</span>
                {cell.holiday && <span className="hr-calendar-day-label">{cell.holiday.name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="hr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>{editingHoliday ? 'Edit Holiday' : 'Add Holiday'}</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  <div className="hr-form-group">
                    <label>Holiday Name <span className="required">*</span></label>
                    <input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} />
                    {formErrors.name && <span className="hr-form-error">{formErrors.name}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Date <span className="required">*</span></label>
                    <input type="date" value={formData.date} onChange={(e) => setFormData((f) => ({ ...f, date: e.target.value }))} />
                    {formErrors.date && <span className="hr-form-error">{formErrors.date}</span>}
                  </div>
                  <div className="hr-form-group">
                    <label>Type</label>
                    <select value={formData.type} onChange={(e) => setFormData((f) => ({ ...f, type: e.target.value }))}>
                      {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="hr-form-group">
                    <label>Status</label>
                    <select value={formData.status} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="hr-btn hr-btn-primary">{editingHoliday ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Holidays;
