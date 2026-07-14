/**
 * App timezone for attendance clocks and local calendar days.
 * Production hosts are often UTC; without this, check-in shows server UTC time
 * instead of the wall-clock time staff expect (India Standard Time).
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || process.env.SALES_REPORT_TIMEZONE || 'Asia/Kolkata';

function getZonedParts(date, timeZone = APP_TIMEZONE) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getDateKeyInAppTz(date = new Date(), timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  if (!parts) return '';
  const y = String(parts.year).padStart(4, '0');
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeHHMMInAppTz(date, timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  if (!parts) return '';
  const h = String(parts.hour).padStart(2, '0');
  const m = String(parts.minute).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Convert a calendar date + wall-clock time in APP_TIMEZONE to a UTC Date.
 * Uses iterative offset correction so it works for fixed-offset zones like IST.
 */
function zonedDateTimeToUtc(dateKey, timeHHMMSS = '00:00:00', timeZone = APP_TIMEZONE) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = String(timeHHMMSS).split(':').map(Number);

  // First guess: treat the wall time as UTC, then correct by timezone offset.
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, 0);

  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(new Date(utc), timeZone);
    if (!parts) break;
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second, 0);
    const diff = desired - asUtc;
    if (diff === 0) break;
    utc += diff;
  }

  return new Date(utc);
}

function startOfDayInAppTz(date = new Date(), timeZone = APP_TIMEZONE) {
  const key = getDateKeyInAppTz(date, timeZone);
  return zonedDateTimeToUtc(key, '00:00:00', timeZone);
}

function endOfDayInAppTz(date = new Date(), timeZone = APP_TIMEZONE) {
  const key = getDateKeyInAppTz(date, timeZone);
  return zonedDateTimeToUtc(key, '23:59:59', timeZone);
}

module.exports = {
  APP_TIMEZONE,
  getZonedParts,
  getDateKeyInAppTz,
  formatTimeHHMMInAppTz,
  zonedDateTimeToUtc,
  startOfDayInAppTz,
  endOfDayInAppTz,
};
