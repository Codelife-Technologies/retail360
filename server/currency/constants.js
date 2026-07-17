/** Supported reporting currencies and country → currency mapping. */

const SUPPORTED_CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', decimals: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
];

const BASE_CURRENCY = 'INR';

/** ISO-ish country name/code → default currency */
const COUNTRY_CURRENCY = {
  IN: 'INR',
  INDIA: 'INR',
  AE: 'AED',
  UAE: 'AED',
  'UNITED ARAB EMIRATES': 'AED',
  US: 'USD',
  USA: 'USD',
  'UNITED STATES': 'USD',
  GB: 'GBP',
  UK: 'GBP',
  'UNITED KINGDOM': 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  EU: 'EUR',
  SA: 'SAR',
  'SAUDI ARABIA': 'SAR',
  SG: 'SGD',
  SINGAPORE: 'SGD',
  AU: 'AUD',
  AUSTRALIA: 'AUD',
  CA: 'CAD',
  CANADA: 'CAD',
  JP: 'JPY',
  JAPAN: 'JPY',
};

function currencyMeta(code) {
  const c = String(code || BASE_CURRENCY).toUpperCase();
  return SUPPORTED_CURRENCIES.find((x) => x.code === c) || SUPPORTED_CURRENCIES[0];
}

function currencyForCountry(country) {
  if (!country) return BASE_CURRENCY;
  const key = String(country).trim().toUpperCase();
  if (COUNTRY_CURRENCY[key]) return COUNTRY_CURRENCY[key];
  if (key.includes('EMIRATE') || key.includes('DUBAI') || key === 'U.A.E') return 'AED';
  if (key.includes('INDIA')) return 'INR';
  return BASE_CURRENCY;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  BASE_CURRENCY,
  COUNTRY_CURRENCY,
  currencyMeta,
  currencyForCountry,
};
