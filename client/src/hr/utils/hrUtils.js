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

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

export function toInputDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone) {
  return /^[\d\s+\-()]{7,15}$/.test(phone);
}
