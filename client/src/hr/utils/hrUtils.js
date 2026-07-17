export function extractList(response) {
  if (!response?.data) return [];
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

export function extractPagination(response) {
  if (response?.data?.pagination) return response.data.pagination;
  return null;
}

const APP_DISPLAY_TIMEZONE = 'Asia/Kolkata';

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: APP_DISPLAY_TIMEZONE,
  });
}

export function formatCurrency(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function employeeName(emp) {
  if (!emp) return '—';
  return `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || '—';
}

export function statusClass(status) {
  if (!status) return '';
  return `hr-status-${String(status).toLowerCase().replace(/\s+/g, '-')}`;
}

/** Calendar YYYY-MM-DD in app timezone (matches server work-log / attendance days). */
export function toInputDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: APP_DISPLAY_TIMEZONE });
}

export function todayInputDate() {
  return toInputDate(new Date());
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone) {
  return /^[\d\s+\-()]{7,15}$/.test(phone);
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  if (total === 0) return '0m';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function minutesFromHoursAndMinutes(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  return Math.max(0, Math.round(h * 60 + m));
}
