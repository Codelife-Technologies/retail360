/** Resolve currency from a sales location or warehouse location record. */
export function getCurrencyForLocation(locationLike) {
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
  const match = salesLocations.find((loc) => loc._id === salesLocationId);
  return getCurrencyForLocation(match);
}
