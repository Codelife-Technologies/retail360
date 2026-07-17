const { currencyForCountry } = require('../constants');
const { getCurrencyForLocation } = require('../../utils/locationCurrency');

/**
 * Resolve the true transaction currency for a sale.
 * Prefer sales channel (marketplace) currency, then location, then warehouse.
 * Channel first: a location can serve multiple channels with different currencies.
 */
function resolveSaleCurrency(sale) {
  if (!sale) return 'INR';

  const channelDefault = sale.salesChannel?.defaultCurrency;
  if (channelDefault) return String(channelDefault).trim().toUpperCase();

  const channelCountry = sale.salesChannel?.country;
  if (channelCountry) return currencyForCountry(channelCountry);

  const locCurrency = sale.salesLocation?.currency;
  if (locCurrency) return String(locCurrency).trim().toUpperCase();

  const locCountry = sale.salesLocation?.country;
  if (locCountry) return currencyForCountry(locCountry);

  if (sale.salesLocation) {
    const fromLoc = getCurrencyForLocation(sale.salesLocation);
    if (fromLoc) return String(fromLoc).trim().toUpperCase();
  }

  const warehouseCountry = sale.salesLocation?.location?.country;
  if (warehouseCountry) return currencyForCountry(warehouseCountry);

  const stored = String(sale.currency || '').trim().toUpperCase();
  return stored || 'INR';
}

module.exports = {
  resolveSaleCurrency,
};
