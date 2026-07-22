import React, { useMemo } from 'react';
import './DateDropdownPicker.css';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function parseIsoDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return { year: '', month: '', day: '' };
  }
  const [year, month, day] = String(value).split('-').map(Number);
  return { year, month, day };
}

function toIsoDate(year, month, day) {
  if (!year || !month || !day) return '';
  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(Number(day), maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Custom date control: Month → Year → Day dropdowns (ISO YYYY-MM-DD value).
 */
export default function DateDropdownPicker({
  value = '',
  onChange,
  min,
  max,
  disabled = false,
  id,
  'aria-label': ariaLabel = 'Date',
}) {
  const parts = parseIsoDate(value);
  const minParts = parseIsoDate(min);
  const maxParts = parseIsoDate(max);

  const now = new Date();
  const defaultYear = now.getFullYear();
  const yearStart = Math.min(minParts.year || defaultYear - 10, parts.year || defaultYear, defaultYear - 10);
  const yearEnd = Math.max(maxParts.year || defaultYear + 1, parts.year || defaultYear, defaultYear + 1);

  const years = useMemo(() => {
    const list = [];
    for (let y = yearEnd; y >= yearStart; y -= 1) list.push(y);
    return list;
  }, [yearStart, yearEnd]);

  const dayCount = daysInMonth(parts.year || defaultYear, parts.month || 1);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const emit = (nextYear, nextMonth, nextDay) => {
    if (typeof onChange !== 'function') return;
    const iso = toIsoDate(nextYear, nextMonth, nextDay);
    if (!iso) return;
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
  };

  const handleMonth = (e) => {
    const month = Number(e.target.value) || '';
    const year = parts.year || defaultYear;
    const day = parts.day || 1;
    emit(year, month, day);
  };

  const handleYear = (e) => {
    const year = Number(e.target.value) || '';
    const month = parts.month || 1;
    const day = parts.day || 1;
    emit(year, month, day);
  };

  const handleDay = (e) => {
    const day = Number(e.target.value) || '';
    const year = parts.year || defaultYear;
    const month = parts.month || 1;
    emit(year, month, day);
  };

  return (
    <div className="date-dropdown-picker" id={id} role="group" aria-label={ariaLabel}>
      <label className="date-dropdown-field">
        <span className="date-dropdown-heading">Month</span>
        <select
          className="date-dropdown-select date-dropdown-month"
          value={parts.month || ''}
          onChange={handleMonth}
          disabled={disabled}
          aria-label={`${ariaLabel} month`}
        >
          <option value="">Month</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>
      <label className="date-dropdown-field">
        <span className="date-dropdown-heading">Year</span>
        <select
          className="date-dropdown-select date-dropdown-year"
          value={parts.year || ''}
          onChange={handleYear}
          disabled={disabled}
          aria-label={`${ariaLabel} year`}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <label className="date-dropdown-field">
        <span className="date-dropdown-heading">Date</span>
        <select
          className="date-dropdown-select date-dropdown-day"
          value={parts.day || ''}
          onChange={handleDay}
          disabled={disabled}
          aria-label={`${ariaLabel} date`}
        >
          <option value="">Date</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
