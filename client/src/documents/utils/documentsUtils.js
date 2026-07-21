export function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function documentIcon(doc) {
  const ext = String(doc?.fileExtension || '').toLowerCase();
  if (doc?.documentType === 'Image' || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return '🖼️';
  if (['.pdf'].includes(ext)) return '📄';
  if (['.doc', '.docx'].includes(ext)) return '📝';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '📊';
  if (['.ppt', '.pptx'].includes(ext)) return '📽️';
  if (['.zip'].includes(ext)) return '🗜️';
  return '📎';
}

export function extractList(response) {
  const payload = response?.data;
  if (Array.isArray(payload)) return { data: payload, pagination: null };
  if (Array.isArray(payload?.data)) {
    return { data: payload.data, pagination: payload.pagination || null };
  }
  return { data: [], pagination: null };
}
