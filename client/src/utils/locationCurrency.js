/** Build searchable text from a sales location + warehouse location record. */
export function buildLocationHaystack(locationLike) {
  if (!locationLike) return '';
  const warehouse = locationLike.location || {};
  return [
    locationLike.name,
    locationLike.code,
    locationLike.address,
    locationLike.city,
    warehouse.name,
    warehouse.code,
    warehouse.city,
    warehouse.state,
    warehouse.country,
    warehouse.address,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** True when the sales location is in the UAE (no Indian GST applies). */
export function isUaeSalesLocation(locationLike) {
  if (!locationLike) return false;

  const country = String(locationLike.location?.country || '').trim().toLowerCase();
  if (
    country === 'uae' ||
    country === 'ae' ||
    country.includes('emirates') ||
    country.includes('united arab')
  ) {
    return true;
  }

  const haystack = buildLocationHaystack(locationLike);
  if (!haystack) return false;

  const uaeMarkers = [
    'uae',
    'u.a.e',
    'united arab emirates',
    'abu dhabi',
    'abudhabi',
    'dubai',
    'sharjah',
    'ajman',
    'ras al khaimah',
    'fujairah',
    'al ain',
  ];
  return uaeMarkers.some((marker) => haystack.includes(marker));
}

/** Resolve currency from a sales location or warehouse location record. */
export function getCurrencyForLocation(locationLike) {
  if (!locationLike) return 'INR';

  const haystack = buildLocationHaystack(locationLike);

  if (isUaeSalesLocation(locationLike)) {
    return 'AED';
  }
  if (haystack.includes('noida')) {
    return 'INR';
  }
  return 'INR';
}

export function getCurrencyLabel(currency) {
  return currency === 'AED' ? 'AED' : '₹';
}

export function formatMoney(amount, currency = 'INR') {
  const value = Number(amount) || 0;
  if (currency === 'AED') {
    return `AED ${value.toLocaleString('en-AE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getCurrencyForSalesLocationId(salesLocationId, salesLocations = []) {
  const match = salesLocations.find((loc) => loc._id === salesLocationId || String(loc._id) === String(salesLocationId));
  return getCurrencyForLocation(match);
}

/** Resolve report currency from a sales channel (falls back to AED). */
export function getCurrencyForSalesChannelId(salesChannelId, salesChannels = []) {
  if (!salesChannelId) return 'AED';
  const match = salesChannels.find(
    (channel) => channel._id === salesChannelId || String(channel._id) === String(salesChannelId)
  );
  const fromChannel = String(match?.defaultCurrency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(fromChannel)) return fromChannel;
  const country = String(match?.country || '').trim().toUpperCase();
  if (country === 'IN') return 'INR';
  if (country === 'AE') return 'AED';
  return 'AED';
}
