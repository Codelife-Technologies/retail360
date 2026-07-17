function computeLicenseStatus(expiryDate, today = new Date()) {
  if (!expiryDate) return 'Valid';
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return 'Valid';
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const end = new Date(expiry);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end - startOfToday) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays <= 30) return 'Expiring Soon';
  return 'Valid';
}

module.exports = { computeLicenseStatus };
