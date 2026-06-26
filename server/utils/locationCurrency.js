function getCurrencyForLocation(locationLike) {
  if (!locationLike) return 'INR';

  const warehouse = locationLike.location || {};
  const haystack = [
    locationLike.name,
    locationLike.code,
    warehouse.name,
    warehouse.code,
    warehouse.city,
    locationLike.city,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (haystack.includes('abu dhabi') || haystack.includes('abudhabi')) {
    return 'AED';
  }
  if (haystack.includes('noida')) {
    return 'INR';
  }
  return 'INR';
}

module.exports = { getCurrencyForLocation };
