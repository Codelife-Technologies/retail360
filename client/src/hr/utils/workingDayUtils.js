const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function toLocalDateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getSaturdayIndexInMonth(date) {
  let count = 0;
  for (let day = 1; day <= date.getDate(); day += 1) {
    const test = new Date(date.getFullYear(), date.getMonth(), day);
    if (test.getDay() === 6) count += 1;
  }
  return count;
}

export function isSunday(date) {
  return new Date(date).getDay() === 0;
}

export function isSecondOrFourthSaturday(date) {
  const d = new Date(date);
  if (d.getDay() !== 6) return false;
  const index = getSaturdayIndexInMonth(d);
  return index === 2 || index === 4;
}

/** Sundays and 2nd / 4th Saturdays are not counted as working days. */
export function isNonWorkingDay(date) {
  return isSunday(date) || isSecondOrFourthSaturday(date);
}

const PRESENT_STATUSES = new Set(['Present', 'Work From Home']);
const ABSENT_STATUSES = new Set(['Absent']);

export function attendanceStatusToState(status) {
  if (PRESENT_STATUSES.has(status)) return 'present';
  if (ABSENT_STATUSES.has(status)) return 'absent';
  if (status === 'Leave') return 'leave';
  if (status === 'Half Day') return 'halfday';
  if (status === 'Holiday') return 'holiday';
  return 'present';
}

export function recordToDateKey(record) {
  return toLocalDateKey(record?.date);
}

/** Expand approved leave ranges into YYYY-MM-DD keys (optionally limited to one month). */
export function expandApprovedLeaveDateKeys(leaves = [], { month, year } = {}) {
  const keys = new Set();
  const monthPrefix =
    month && year
      ? `${year}-${String(month).padStart(2, '0')}-`
      : '';

  leaves.forEach((leave) => {
    if (!leave || String(leave.status || '').toLowerCase() !== 'approved') return;
    const fromKey = toLocalDateKey(leave.fromDate);
    const toKey = toLocalDateKey(leave.toDate);
    if (!fromKey || !toKey) return;

    let key = fromKey;
    while (key <= toKey) {
      if (!monthPrefix || key.startsWith(monthPrefix)) {
        keys.add(key);
      }
      const [y, m, d] = key.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      key = toLocalDateKey(next);
      if (!key) break;
    }
  });

  return keys;
}

export function buildAttendanceCalendar({
  month,
  year,
  records = [],
  approvedLeaveDateKeys = null,
  today = new Date(),
}) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startPad = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const todayKey = toLocalDateKey(today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const leaveKeys =
    approvedLeaveDateKeys instanceof Set
      ? approvedLeaveDateKeys
      : new Set(approvedLeaveDateKeys || []);

  const recordMap = new Map();
  records.forEach((record) => {
    const key = recordToDateKey(record);
    if (key) recordMap.set(key, record);
  });

  const cells = [];
  const prevMonthLast = new Date(year, month - 1, 0).getDate();

  for (let i = startPad - 1; i >= 0; i -= 1) {
    cells.push({
      day: prevMonthLast - i,
      otherMonth: true,
      state: 'other',
      dateKey: '',
      label: '',
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateKey = toLocalDateKey(date);
    const record = recordMap.get(dateKey);
    const nonWorking = isNonWorkingDay(date);
    const isFuture = date > todayStart;
    const isToday = dateKey === todayKey;
    const onApprovedLeave =
      leaveKeys.has(dateKey) || record?.status === 'Leave';

    let state;
    let label = '';

    if (onApprovedLeave && !nonWorking) {
      // Approved leave (or Leave attendance) — highlight even if still Absent / unmarked
      state = 'leave';
      label = 'Leave';
    } else if (nonWorking) {
      state = 'weekoff';
      if (isSunday(date)) label = 'Sun';
      else label = 'Off';
    } else if (record) {
      state = attendanceStatusToState(record.status);
      label =
        record.status === 'Work From Home'
          ? 'WFH'
          : record.status === 'Half Day'
            ? 'Half'
            : record.status === 'Holiday'
              ? 'Hol'
              : '';
    } else if (isFuture) {
      state = 'future';
    } else if (isToday) {
      state = 'pending';
      label = 'Today';
    } else {
      state = 'absent';
      label = 'Absent';
    }

    cells.push({
      day,
      dateKey,
      otherMonth: false,
      isToday,
      isFuture,
      nonWorking,
      state,
      label,
      record,
      onApprovedLeave,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      day: cells.length - daysInMonth - startPad + 1,
      otherMonth: true,
      state: 'other',
      dateKey: '',
      label: '',
    });
  }

  return { cells, dayNames: DAY_NAMES };
}

export function computeAttendanceCalendarStats(cells, { today = new Date() } = {}) {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let workingDays = 0;
  let present = 0;
  let absent = 0;
  let leave = 0;
  let halfDay = 0;

  cells.filter((cell) => !cell.otherMonth).forEach((cell) => {
    const date = parseLocalDateKey(cell.dateKey);
    if (date > todayStart) return;

    if (cell.nonWorking) return;

    workingDays += 1;

    if (cell.state === 'present' || cell.state === 'holiday') present += 1;
    else if (cell.state === 'halfday') halfDay += 1;
    else if (cell.state === 'leave') leave += 1;
    else if (cell.state === 'absent') absent += 1;
  });

  return {
    workingDays,
    present: Math.round((present + halfDay * 0.5) * 10) / 10,
    absent,
    leave,
    halfDay,
  };
}
