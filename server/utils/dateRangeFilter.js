/**
 * Apply inclusive calendar-day range to a Mongo query field.
 * Expects fromDate/toDate as YYYY-MM-DD (or Date-parseable strings).
 */
function applyDateRangeFilter(query, field, fromDate, toDate) {
  if (!fromDate && !toDate) return query;
  const range = {};
  if (fromDate) range.$gte = new Date(fromDate);
  if (toDate) range.$lte = new Date(`${toDate}T23:59:59.999`);
  query[field] = range;
  return query;
}

module.exports = { applyDateRangeFilter };
