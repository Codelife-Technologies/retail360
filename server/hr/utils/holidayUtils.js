const TYPE_PRIORITY = { National: 0, Regional: 1, Company: 2, Restricted: 3 };

function dateKey(dateValue) {
  const d = new Date(dateValue);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function holidayPriority(holiday) {
  const typeRank = TYPE_PRIORITY[holiday.type] ?? 99;
  return [typeRank, holiday.name?.length ?? 0];
}

function compareHolidayPriority(a, b) {
  const [typeA, lenA] = holidayPriority(a);
  const [typeB, lenB] = holidayPriority(b);
  if (typeA !== typeB) return typeA - typeB;
  return lenA - lenB;
}

/** Keep a single holiday per calendar day (National preferred over Regional/Restricted). */
function dedupeHolidaysByDate(holidays) {
  const byDate = new Map();
  for (const holiday of holidays) {
    const key = dateKey(holiday.date);
    const existing = byDate.get(key);
    if (!existing || compareHolidayPriority(holiday, existing) < 0) {
      byDate.set(key, holiday);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
  dateKey,
  dedupeHolidaysByDate,
};
