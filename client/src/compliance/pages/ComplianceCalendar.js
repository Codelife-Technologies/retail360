import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { complianceCalendarAPI } from '../services/complianceApi';
import { formatDate } from '../utils/complianceUtils';

const CATEGORIES = ['GST', 'TDS', 'ITR', 'Filing'];

const URGENCY_LABEL = {
  overdue: 'Overdue',
  'due-today': 'Due today',
  'due-soon': 'Due soon',
  upcoming: 'Upcoming',
  filed: 'Filed',
};

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayUrgency(dayEvents = []) {
  if (!dayEvents.length) return '';
  if (dayEvents.some((e) => e.urgency === 'overdue')) return 'overdue';
  if (dayEvents.some((e) => e.urgency === 'due-today')) return 'due-today';
  if (dayEvents.some((e) => e.urgency === 'due-soon')) return 'due-soon';
  if (dayEvents.some((e) => e.important || e.isFiling)) return 'filing';
  return '';
}

function CalendarEventChip({ event }) {
  const urgency = event.urgency || 'upcoming';
  const important = event.important || event.isFiling;
  return (
    <div
      className={`cmp-cal-event${important ? ' important' : ''} urgency-${urgency}`}
      title={`${event.title}${event.companyDueDateNote ? ` — ${event.companyDueDateNote}` : ''}`}
    >
      {important ? '★ ' : ''}
      {event.source}: {event.formCode || event.title}
    </div>
  );
}

function ComplianceCalendar() {
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  });
  const [category, setCategory] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const year = cursor.year;
  const month = cursor.month;

  const range = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(new Date(year, month, cursor.day));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    if (view === 'agenda') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 2, 0, 23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [view, year, month, cursor.day]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await complianceCalendarAPI.getEvents({
        from: range.from,
        to: range.to,
        category: category || undefined,
      });
      setEvents(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range, category]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach((event) => {
      if (!event.dueDate) return;
      const d = new Date(event.dueDate);
      if (d.getMonth() !== month || d.getFullYear() !== year) return;
      const key = d.getDate();
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [events, month, year]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(year, month, cursor.day));
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return d;
    });
  }, [year, month, cursor.day]);

  const filingHighlights = useMemo(
    () => events.filter((e) => e.important || e.isFiling),
    [events]
  );

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setCursor((prev) => ({ ...prev, year: d.getFullYear(), month: d.getMonth(), day: 1 }));
  };

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>Compliance Calendar</h1>
          <p className="cmp-page-subtitle">
            Important GST, TDS, ITR and other filing due dates are highlighted.
          </p>
        </div>
        <div className="cmp-page-actions">
          <button type="button" className={`cmp-btn${view === 'month' ? ' cmp-btn-primary' : ''}`} onClick={() => setView('month')}>Month</button>
          <button type="button" className={`cmp-btn${view === 'week' ? ' cmp-btn-primary' : ''}`} onClick={() => setView('week')}>Week</button>
          <button type="button" className={`cmp-btn${view === 'agenda' ? ' cmp-btn-primary' : ''}`} onClick={() => setView('agenda')}>Agenda</button>
        </div>
      </div>

      <div className="cmp-toolbar">
        <button type="button" className="cmp-btn" onClick={() => shiftMonth(-1)}>‹</button>
        <strong>
          {new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
        </strong>
        <button type="button" className="cmp-btn" onClick={() => shiftMonth(1)}>›</button>
        <select className="cmp-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="cmp-cal-legend">
        <span className="cmp-cal-legend-item urgency-overdue">Overdue</span>
        <span className="cmp-cal-legend-item urgency-due-today">Due today</span>
        <span className="cmp-cal-legend-item urgency-due-soon">Due soon</span>
        <span className="cmp-cal-legend-item urgency-filing">Filing deadline</span>
        <span className="cmp-cal-legend-item urgency-filed">Filed</span>
        {!loading && (
          <span className="cmp-muted">
            {filingHighlights.length} important filing date{filingHighlights.length === 1 ? '' : 's'} in view
          </span>
        )}
      </div>

      <div className="cmp-card">
        {loading ? (
          <div className="cmp-skeleton-chart" />
        ) : view === 'month' ? (
          <div className="cmp-cal-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="cmp-cal-head">{d}</div>
            ))}
            {cells.map((day, idx) => {
              if (!day) {
                return <div key={idx} className="cmp-cal-cell empty" />;
              }
              const dayEvents = eventsByDay[day] || [];
              const urgency = dayUrgency(dayEvents);
              const cellDate = new Date(year, month, day);
              const isToday = isSameDay(cellDate, today);
              const hasFiling = dayEvents.some((e) => e.important || e.isFiling);
              return (
                <div
                  key={idx}
                  className={`cmp-cal-cell${urgency ? ` has-${urgency}` : ''}${hasFiling ? ' has-filing' : ''}${isToday ? ' is-today' : ''}`}
                >
                  <div className="cmp-cal-day">
                    <span>{day}</span>
                    {hasFiling ? <span className="cmp-cal-filing-mark" title="Important filing date">★</span> : null}
                  </div>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <CalendarEventChip key={`${ev.source}-${ev.id}`} event={ev} />
                  ))}
                  {dayEvents.length > 3 ? (
                    <div className="cmp-cal-more">+{dayEvents.length - 3} more</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : view === 'week' ? (
          <div className="cmp-week-grid">
            {weekDays.map((day) => {
              const dayEvents = events.filter((ev) => {
                if (!ev.dueDate) return false;
                return isSameDay(new Date(ev.dueDate), day);
              });
              const urgency = dayUrgency(dayEvents);
              const hasFiling = dayEvents.some((e) => e.important || e.isFiling);
              return (
                <div
                  key={day.toISOString()}
                  className={`cmp-week-col${urgency ? ` has-${urgency}` : ''}${hasFiling ? ' has-filing' : ''}${isSameDay(day, today) ? ' is-today' : ''}`}
                >
                  <h4>
                    {day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {hasFiling ? ' ★' : ''}
                  </h4>
                  {dayEvents.length === 0 ? (
                    <p className="cmp-muted">No items</p>
                  ) : (
                    dayEvents.map((ev) => <CalendarEventChip key={`${ev.source}-${ev.id}`} event={ev} />)
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cmp-table-wrap">
            {events.length === 0 ? (
              <div className="cmp-empty"><p>No upcoming compliance items in this period.</p></div>
            ) : (
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Title</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr
                      key={`${ev.source}-${ev.id}`}
                      className={`cmp-agenda-row${ev.important || ev.isFiling ? ' important' : ''} urgency-${ev.urgency || 'upcoming'}`}
                    >
                      <td>
                        {formatDate(ev.dueDate)}
                        {(ev.important || ev.isFiling) ? <span className="cmp-cal-filing-mark"> ★</span> : null}
                      </td>
                      <td>{ev.source}</td>
                      <td>
                        <div className="cmp-cell-title">{ev.title}</div>
                        {ev.companyDueDateNote ? <div className="cmp-muted">{ev.companyDueDateNote}</div> : null}
                      </td>
                      <td>
                        <span className={`cmp-urgency-badge urgency-${ev.urgency || 'upcoming'}`}>
                          {URGENCY_LABEL[ev.urgency] || 'Upcoming'}
                        </span>
                      </td>
                      <td>{ev.status}</td>
                      <td>{ev.department || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ComplianceCalendar;
