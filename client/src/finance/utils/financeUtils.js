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
