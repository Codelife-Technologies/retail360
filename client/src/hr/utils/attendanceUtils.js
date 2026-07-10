function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const mins = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
    if (period === 'AM') {
      if (hours === 12) hours = 0;
    } else if (hours !== 12) {
      hours += 12;
    }
    return hours * 60 + mins;
  }

  const parts = trimmed.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1];
}

function normalizeTimeInput(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{1,2}:\d{2}(\s*(AM|PM))?$/i.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime()) && trimmed.includes('T')) {
      return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    }
    return trimmed;
  }
  return String(value);
}

export function calcWorkingHoursFromTimes(checkIn, checkOut) {
  const inMinutes = parseTimeToMinutes(checkIn);
  const outMinutes = parseTimeToMinutes(checkOut);
  if (inMinutes == null || outMinutes == null) return 0;

  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes === 0) return 0;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }
  if (diffMinutes <= 0) return 0;

  return Math.round((diffMinutes / 60) * 100) / 100;
}

export function isTodayDate(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  );
}

export function currentTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function getEffectiveCheckOut(record = {}, { useLiveNow = true } = {}) {
  if (record.checkOut) return record.checkOut;
  if (useLiveNow && record.checkIn && isTodayDate(record.date)) {
    return currentTimeHHMM();
  }
  return '';
}

export function isWorkingHoursInProgress(record = {}) {
  return Boolean(record.checkIn && !record.checkOut && isTodayDate(record.date));
}

export function resolveWorkingHours(record = {}, options = {}) {
  const checkOut = getEffectiveCheckOut(record, options);
  const computed = calcWorkingHoursFromTimes(record.checkIn, checkOut);
  if (computed > 0) return computed;
  return Number(record.workingHours) || 0;
}

export function formatTime12Hour(timeStr) {
  const normalized = normalizeTimeInput(timeStr);
  if (!normalized) return '—';

  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(normalized)) {
    const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    return `${parseInt(match[1], 10)}:${match[2]} ${match[3].toUpperCase()}`;
  }

  const minutes = parseTimeToMinutes(normalized);
  if (minutes == null) return normalized;

  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export function formatNow12Hour(date = new Date()) {
  return formatTime12Hour(normalizeTimeInput(date));
}

export function getDisplayCheckOut(checkOut, { inProgress = false } = {}) {
  if (checkOut) return checkOut;
  if (inProgress) return currentTimeHHMM();
  return '';
}

export function time24to12(timeStr) {
  const minutes = parseTimeToMinutes(timeStr);
  if (minutes == null) {
    return { hour12: 12, minute: 0, period: 'AM' };
  }
  const hours24 = Math.floor(minutes / 60);
  return {
    hour12: hours24 % 12 || 12,
    minute: minutes % 60,
    period: hours24 >= 12 ? 'PM' : 'AM',
  };
}

export function time12to24(hour12, minute, period) {
  let hours = parseInt(hour12, 10);
  const mins = parseInt(minute, 10) || 0;
  if (Number.isNaN(hours)) return '';

  if (period === 'AM') {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }

  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function formatWorkingHoursDisplay(hours, { inProgress = false } = {}) {
  if (hours == null || hours <= 0) return '—';
  let label;
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    label = `${mins} min`;
  } else {
    const rounded = Math.round(hours * 100) / 100;
    label = `${rounded} hrs`;
  }
  return inProgress ? `${label} (ongoing)` : label;
}
