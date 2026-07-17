const COUNTRY_DISPLAY_NAMES = {
  IN: 'India',
  INDIA: 'India',
  AE: 'UAE',
  UAE: 'UAE',
  'UNITED ARAB EMIRATES': 'UAE',
  US: 'United States',
  USA: 'United States',
  'UNITED STATES': 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  'UNITED KINGDOM': 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  EU: 'Europe',
  SA: 'Saudi Arabia',
  'SAUDI ARABIA': 'Saudi Arabia',
  SG: 'Singapore',
  SINGAPORE: 'Singapore',
  AU: 'Australia',
  AUSTRALIA: 'Australia',
  CA: 'Canada',
  CANADA: 'Canada',
  JP: 'Japan',
  JAPAN: 'Japan',
};

/** Show full country name instead of ISO code (e.g. IN → India). */
export function formatCountryName(country) {
  if (!country) return '—';
  const raw = String(country).trim();
  const key = raw.toUpperCase();
  if (COUNTRY_DISPLAY_NAMES[key]) return COUNTRY_DISPLAY_NAMES[key];
  if (key.length > 3) {
    return raw.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return raw;
}

export function formatCurrency(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatPct(value) {
  const num = Number(value) || 0;
  return `${num.toFixed(1)}%`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatMonthKey(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(value);
  const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

export function toInputDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export const FIN_PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

/** Resolve dateFrom/dateTo for finance period presets. */
export function getFinPeriodRange(period) {
  const now = new Date();
  const today = toInputDate(now);

  if (period === 'today') {
    return { dateFrom: today, dateTo: today };
  }

  if (period === 'week') {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { dateFrom: toInputDate(monday), dateTo: toInputDate(sunday) };
  }

  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { dateFrom: toInputDate(from), dateTo: toInputDate(to) };
  }

  if (period === 'year') {
    return {
      dateFrom: `${now.getFullYear()}-01-01`,
      dateTo: `${now.getFullYear()}-12-31`,
    };
  }

  return null;
}

export function formatFinPeriodLabel(period, dateFrom, dateTo) {
  const opt = FIN_PERIOD_OPTIONS.find((o) => o.id === period);
  if (opt && period !== 'custom') return opt.label;
  if (dateFrom && dateTo) return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
  if (dateFrom) return `From ${formatDate(dateFrom)}`;
  if (dateTo) return `Until ${formatDate(dateTo)}`;
  return 'Custom Range';
}

export function currentFinancialYear() {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export function financialYearOptions(count = 5) {
  const current = currentFinancialYear();
  const start = Number(current.split('-')[0]);
  return Array.from({ length: count }).map((_, i) => {
    const y = start - i;
    return { value: `${y}-${y + 1}`, label: `FY ${y}-${String(y + 1).slice(-2)}` };
  });
}

export function extractList(response) {
  const payload = response?.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function extractPagination(response) {
  return response?.data?.pagination || null;
}

const UPLOADS_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export function financeBillUrl(bill) {
  if (!bill?.filePath) return '';
  return `${UPLOADS_BASE}/uploads/${String(bill.filePath).replace(/\\/g, '/')}`;
}

export function buildFinanceFormData(fields, { billFile, removeBill } = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value == null) fd.append(key, '');
    else fd.append(key, value);
  });
  if (billFile instanceof File) fd.append('bill', billFile);
  if (removeBill) fd.append('removeBill', 'true');
  return fd;
}

/** Map finance filter fields to sales report API query params. */
export function resolveSalesQueryParams(filters = {}, page = 1, limit = 25) {
  let startDate = filters.dateFrom || '';
  let endDate = filters.dateTo || '';

  if (filters.financialYear) {
    const startYear = Number(String(filters.financialYear).split('-')[0]);
    if (startYear) {
      startDate = `${startYear}-04-01`;
      endDate = `${startYear + 1}-03-31`;
    }
  } else if (filters.month) {
    const [y, m] = String(filters.month).split('-');
    if (y && m) {
      startDate = `${y}-${m}-01`;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  const params = {
    page,
    limit,
    sortBy: filters.sortBy || 'salesDate',
    sortDir: filters.sortDir || 'desc',
  };
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (filters.salesChannel) params.salesChannel = filters.salesChannel;
  if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
  if (filters.orderStatus) params.orderStatus = filters.orderStatus;
  if (filters.search?.trim()) params.search = filters.search.trim();
  return params;
}

