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

/** Resolve report currency from a sales channel (falls back to INR). */
export function getCurrencyForSalesChannelId(salesChannelId, salesChannels = []) {
  if (!salesChannelId) return 'INR';
  const match = salesChannels.find(
    (channel) => channel._id === salesChannelId || String(channel._id) === String(salesChannelId)
  );
  const fromChannel = String(match?.defaultCurrency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(fromChannel)) return fromChannel;
  const country = String(match?.country || '').trim().toUpperCase();
  if (country === 'IN' || country.includes('INDIA')) return 'INR';
  if (country === 'AE' || country.includes('UAE') || country.includes('EMIRATE')) return 'AED';
  const name = String(match?.name || '').toLowerCase();
  if (name.includes('india')) return 'INR';
  if (name.includes('uae') || name.includes('dubai') || name.includes('emirates')) return 'AED';
  return 'INR';
}

/**
 * Resolve display currency for a sale row.
 * Channel currency wins; ignores legacy stored AED when channel is India.
 */
export function resolveSaleDisplayCurrency(sale, fallback = 'INR') {
  const channelCur = String(sale?.salesChannel?.defaultCurrency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(channelCur)) return channelCur;

  const channelCountry = String(sale?.salesChannel?.country || '').trim().toUpperCase();
  if (channelCountry === 'IN' || channelCountry.includes('INDIA')) return 'INR';
  if (channelCountry === 'AE' || channelCountry.includes('UAE') || channelCountry.includes('EMIRATE')) {
    return 'AED';
  }

  const channelName = String(sale?.salesChannel?.name || '').toLowerCase();
  if (channelName.includes('india')) return 'INR';
  if (channelName.includes('uae') || channelName.includes('dubai') || channelName.includes('emirates')) {
    return 'AED';
  }

  const locCur = String(sale?.salesLocation?.currency || '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(locCur)) return locCur;

  const locCountry = String(sale?.salesLocation?.country || sale?.salesLocation?.location?.country || '')
    .trim()
    .toUpperCase();
  if (locCountry === 'IN' || locCountry.includes('INDIA')) return 'INR';
  if (locCountry === 'AE' || locCountry.includes('UAE') || locCountry.includes('EMIRATE')) return 'AED';

  const stored = String(sale?.currency || '').trim().toUpperCase();
  // Legacy imports often stored AED even for India marketplaces.
  if (/^[A-Z]{3}$/.test(stored) && stored !== 'AED') return stored;
  return fallback;
}

export function formatSaleMoney(sale, amount, fallback = 'INR') {
  return formatMoney(amount, resolveSaleDisplayCurrency(sale, fallback));
}
