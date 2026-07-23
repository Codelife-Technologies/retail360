/** Calendar month bounds as YYYY-MM-DD in the local timezone. */
export function getMonthDateRange(anchor = new Date()) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const fromDate = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const toDate = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { fromDate, toDate };
}

export function getCurrentMonthDateRange() {
  return getMonthDateRange(new Date());
}
