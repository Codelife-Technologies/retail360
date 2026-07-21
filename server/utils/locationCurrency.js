/** Build searchable text from a sales location + warehouse location record. */
function buildLocationHaystack(locationLike) {
  if (!locationLike) return '';
  const warehouse = locationLike.location || {};
  return [
    locationLike.name,
    locationLike.code,
    locationLike.address,
    locationLike.city,
    locationLike.country,
    locationLike.currency,
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

function countryLooksUae(value) {
  const country = String(value || '').trim().toLowerCase();
  if (!country) return false;
  return (
    country === 'uae'
    || country === 'ae'
    || country.includes('emirates')
    || country.includes('united arab')
  );
}

function currencyLooksAed(value) {
  return String(value || '').trim().toUpperCase() === 'AED';
}

/**
 * True when the sales location / channel is in the UAE (no Indian GST applies).
 * Checks SalesLocation.country/currency first — warehouse may still be in India.
 */
function isUaeSalesLocation(locationLike, channelLike = null) {
  if (!locationLike && !channelLike) return false;

  if (countryLooksUae(locationLike?.country) || currencyLooksAed(locationLike?.currency)) {
    return true;
  }

  if (
    countryLooksUae(channelLike?.country)
    || currencyLooksAed(channelLike?.defaultCurrency)
    || currencyLooksAed(channelLike?.currency)
  ) {
    return true;
  }

  // Warehouse country (legacy path)
  if (countryLooksUae(locationLike?.location?.country)) {
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

  if (currencyLooksAed(locationLike.currency)) return 'AED';
  if (countryLooksUae(locationLike.country)) return 'AED';

  const haystack = buildLocationHaystack(locationLike);

  if (isUaeSalesLocation(locationLike)) {
    return 'AED';
  }
  if (haystack.includes('noida')) {
    return 'INR';
  }
  return 'INR';
}

module.exports = {
  getCurrencyForLocation,
  isUaeSalesLocation,
  buildLocationHaystack,
};
