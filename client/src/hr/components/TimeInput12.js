import React, { useEffect, useState } from 'react';
import { formatTime12Hour, time12to24, time24to12 } from '../utils/attendanceUtils';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function TimeInput12({ value, onChange, disabled = false, id }) {
  const parsed = time24to12(value);
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);

  useEffect(() => {
    const next = time24to12(value);
    setHour12(next.hour12);
    setMinute(next.minute);
    setPeriod(next.period);
  }, [value]);

  const emitChange = (nextHour, nextMinute, nextPeriod) => {
    onChange(time12to24(nextHour, nextMinute, nextPeriod));
  };

  return (
    <div className="hr-time-input-12" id={id}>
      <div className="hr-time-display">{formatTime12Hour(value)}</div>
      <div className="hr-time-input-12-fields">
        <select
          value={hour12}
          disabled={disabled}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            setHour12(next);
            emitChange(next, minute, period);
          }}
          aria-label="Hour"
        >
          {HOURS.map((hour) => (
            <option key={hour} value={hour}>{hour}</option>
          ))}
        </select>
        <span className="hr-time-input-12-sep">:</span>
        <select
          value={minute}
          disabled={disabled}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            setMinute(next);
            emitChange(hour12, next, period);
          }}
          aria-label="Minute"
        >
          {MINUTES.map((min) => (
            <option key={min} value={min}>{String(min).padStart(2, '0')}</option>
          ))}
        </select>
        <select
          value={period}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            setPeriod(next);
            emitChange(hour12, minute, next);
          }}
          aria-label="AM or PM"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

export default TimeInput12;
