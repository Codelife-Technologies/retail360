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

/** Row highlight class for task status (Pending / Backlog / On Hold / Cancelled). */
export function taskRowClass(status) {
  if (status === 'Pending') return 'hr-task-row-pending';
  if (status === 'Backlog') return 'hr-task-row-backlog';
  if (status === 'On Hold') return 'hr-task-row-on-hold';
  if (status === 'Cancelled') return 'hr-task-row-cancelled';
  return undefined;
}

/** Sort order: Backlog & Pending first, then by due date. */
const TASK_STATUS_SORT_ORDER = {
  Backlog: 0,
  Pending: 1,
  'In Progress': 2,
  'On Hold': 3,
  Completed: 4,
  Cancelled: 5,
};

export function compareTasksByStatus(a, b) {
  const aRank = TASK_STATUS_SORT_ORDER[a?.status] ?? 50;
  const bRank = TASK_STATUS_SORT_ORDER[b?.status] ?? 50;
  if (aRank !== bRank) return aRank - bRank;
  return new Date(a?.dueDate || 0) - new Date(b?.dueDate || 0);
}

export function sortTasksByStatus(tasks = []) {
  return [...tasks].sort(compareTasksByStatus);
}

/** Issue date key (YYYY-MM-DD) for grouping tasks assigned the same day. */
export function getTaskIssueDateKey(task) {
  return toInputDate(task?.startDate || task?.createdAt) || '';
}

/**
 * Group tasks by Date of Issue. Within each day: Backlog/Pending first.
 * Days ordered newest → oldest.
 */
export function groupTasksByIssueDate(tasks = []) {
  const byDate = new Map();
  (tasks || []).forEach((task) => {
    const key = getTaskIssueDateKey(task) || 'unknown';
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(task);
  });

  return [...byDate.entries()]
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .map(([dateKey, groupTasks]) => ({
      dateKey,
      dateLabel: dateKey === 'unknown' ? '—' : formatDate(dateKey),
      tasks: sortTasksByStatus(groupTasks),
    }));
}

/**
 * Today view: Backlog first as its own block, then remaining tasks by issue date.
 */
export function groupTasksForTodayView(tasks = []) {
  const backlog = [];
  const rest = [];
  (tasks || []).forEach((task) => {
    if (task.status === 'Backlog') backlog.push(task);
    else rest.push(task);
  });

  const groups = [];
  if (backlog.length > 0) {
    groups.push({
      dateKey: 'backlog',
      dateLabel: 'Backlog',
      tasks: sortTasksByStatus(backlog),
    });
  }
  groups.push(...groupTasksByIssueDate(rest));
  return groups;
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

/**
 * Current calendar week (Mon–Sun) in app timezone as YYYY-MM-DD.
 * @returns {{ fromDate: string, toDate: string }}
 */
export function getCurrentWeekRange(referenceDate = new Date()) {
  const todayStr = toInputDate(referenceDate);
  if (!todayStr) {
    return { fromDate: '', toDate: '' };
  }
  const [y, m, d] = todayStr.split('-').map(Number);
  // Noon UTC avoids DST edge cases when shifting days
  const local = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = local.getUTCDay(); // 0 Sun … 6 Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: sunday.toISOString().slice(0, 10),
  };
}

export const HR_PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom', label: 'Custom' },
];

/** Resolve from/to dates for Today / Yesterday / This Week / This Month presets. */
export function getHrPeriodRange(period) {
  const today = toInputDate(new Date());
  if (period === 'today') {
    return { fromDate: today, toDate: today };
  }
  if (period === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = toInputDate(d);
    return { fromDate: yesterday, toDate: yesterday };
  }
  if (period === 'week') {
    return getCurrentWeekRange();
  }
  if (period === 'month') {
    if (!today) return { fromDate: '', toDate: '' };
    const [y, m] = today.split('-');
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    return {
      fromDate: `${y}-${m}-01`,
      toDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return null;
}

export function formatHrPeriodLabel(period, fromDate, toDate) {
  if (period === 'today') return 'Today';
  if (period === 'yesterday') return 'Yesterday';
  if (period === 'week') return 'This Week';
  if (period === 'month') return 'This Month';
  if (fromDate && toDate) return `${formatDate(fromDate)} – ${formatDate(toDate)}`;
  return 'Custom Range';
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

/** Trigger a browser download for a blob/arraybuffer API response. */
export function downloadBlobResponse(response, fallbackName = 'download.xlsx') {
  const blob = response?.data instanceof Blob
    ? response.data
    : new Blob([response?.data], {
        type: response?.headers?.['content-type']
          || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
  const disposition = response?.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = decodeURIComponent(match?.[1] || match?.[2] || fallbackName);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
