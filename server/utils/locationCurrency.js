/** Build searchable text from a sales location + warehouse location record. */
function buildLocationHaystack(locationLike) {
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
function isUaeSalesLocation(locationLike) {
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
function getCurrencyForLocation(locationLike) {
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

module.exports = { getCurrencyForLocation, isUaeSalesLocation, buildLocationHaystack };
