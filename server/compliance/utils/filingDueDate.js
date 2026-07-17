function parseMonthlyPeriod(period) {
  const match = String(period).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseQuarterlyPeriod(period) {
  const match = String(period).match(/^Q([1-4])-(\d{4})$/i);
  if (!match) return null;
  return { quarter: Number(match[1]), year: Number(match[2]) };
}

function parseAnnualPeriod(period) {
  const fyMatch = String(period).match(/^FY(\d{4})-(\d{2})$/i);
  if (fyMatch) {
    return { year: Number(fyMatch[1]), isFinancialYear: true };
  }
  const yearMatch = String(period).match(/^(\d{4})$/);
  if (yearMatch) return { year: Number(yearMatch[1]), isFinancialYear: false };
  return null;
}

function computeDueDateFromMaster(master, period) {
  if (!master || !period) return null;

  const dueDay = master.dueDay || 15;
  const offset = master.dueOffsetMonths ?? 1;

  if (master.frequency === 'Monthly') {
    const parsed = parseMonthlyPeriod(period);
    if (!parsed) return null;
    const dueMonthIndex = parsed.month - 1 + offset;
    return new Date(parsed.year, dueMonthIndex, dueDay);
  }

  if (master.frequency === 'Quarterly') {
    const parsed = parseQuarterlyPeriod(period);
    if (!parsed) return null;
    const quarterEndMonth = parsed.quarter * 3;
    const dueMonthIndex = quarterEndMonth - 1 + offset;
    return new Date(parsed.year, dueMonthIndex, dueDay);
  }

  if (master.frequency === 'Annual' || master.frequency === 'Half-Yearly') {
    const parsed = parseAnnualPeriod(period);
    if (!parsed) return null;
    const dueMonth = (master.dueMonth || 7) - 1;
    const dueYear = parsed.isFinancialYear ? parsed.year + 1 : parsed.year;
    return new Date(dueYear, dueMonth, dueDay);
  }

  return null;
}

function suggestPeriod(master, referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  if (master.frequency === 'Monthly') {
    const prev = new Date(year, d.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }
  if (master.frequency === 'Quarterly') {
    const q = Math.ceil(month / 3);
    return `Q${q}-${year}`;
  }
  if (master.frequency === 'Half-Yearly') {
    const half = month <= 6 ? 1 : 2;
    return `H${half}-${year}`;
  }
  if (master.frequency === 'Annual') {
    const fyStart = month >= 4 ? year : year - 1;
    return `FY${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
  }
  return `${year}`;
}

/**
 * Build periods whose due dates may fall inside [rangeStart, rangeEnd].
 */
function periodsForRange(master, rangeStart, rangeEnd) {
  const periods = new Set();
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 2, 1);
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 2, 1);

  while (cursor <= end) {
    periods.add(suggestPeriod(master, cursor));
    // Also try previous period for monthly offset due dates
    const prev = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    periods.add(suggestPeriod(master, prev));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return [...periods];
}

function projectMasterDueDates(masters, rangeStart, rangeEnd) {
  const items = [];
  (masters || []).forEach((master) => {
    if (!master.isActive) return;
    periodsForRange(master, rangeStart, rangeEnd).forEach((period) => {
      const dueDate = computeDueDateFromMaster(master, period);
      if (!dueDate || Number.isNaN(dueDate.getTime())) return;
      if (dueDate < rangeStart || dueDate > rangeEnd) return;
      items.push({
        id: `master-${master._id || master.code}-${period}`,
        source: master.category || 'Filing',
        title: `${master.code} — ${period}`,
        formCode: master.code,
        formName: master.name,
        period,
        dueDate,
        status: 'Pending',
        department: master.department || 'Accounts',
        important: true,
        isFiling: true,
        fromMaster: true,
        reminderDaysBefore: master.reminderDaysBefore ?? 7,
        companyDueDateNote: master.companyDueDateNote || '',
      });
    });
  });
  return items;
}

function classifyFilingUrgency(item, today = new Date()) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const isDone = ['Completed', 'Filed', 'Paid', 'Acknowledged'].includes(item.status);
  if (isDone) return 'filed';
  if (!item.dueDate) return 'upcoming';
  const due = new Date(item.dueDate);
  due.setHours(0, 0, 0, 0);
  const reminder = Number(item.reminderDaysBefore) || 7;
  const soon = new Date(start);
  soon.setDate(soon.getDate() + reminder);
  if (due < start) return 'overdue';
  if (due.getTime() === start.getTime()) return 'due-today';
  if (due <= soon) return 'due-soon';
  return 'upcoming';
}

module.exports = {
  computeDueDateFromMaster,
  suggestPeriod,
  parseMonthlyPeriod,
  parseQuarterlyPeriod,
  parseAnnualPeriod,
  periodsForRange,
  projectMasterDueDates,
  classifyFilingUrgency,
};
