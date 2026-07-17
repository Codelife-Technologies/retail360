/**
 * Shared FX metadata helpers.
 * Does not change how business totals are calculated — only stamps reporting fields.
 */

const { BASE_CURRENCY } = require('../constants');
const { getRates, rateToInr } = require('../services/exchangeRateService');

/** Mongoose sub-document / plain fields for FX on any transaction. */
const FX_SCHEMA_FIELDS = {
  currency: { type: String, trim: true, uppercase: true, default: BASE_CURRENCY },
  /** Amount in the transaction's own currency (never overwritten by conversion). */
  originalAmount: { type: Number, min: 0 },
  /** INR per 1 unit of currency at posting time (historical). */
  exchangeRateToInr: { type: Number, min: 0 },
  exchangeRateSource: { type: String, trim: true, default: '' },
  exchangeRateAt: { type: Date },
};

/**
 * Stamp FX fields onto a plain object before create/update.
 * Leaves existing amount fields untouched.
 */
async function stampFxFields(doc, {
  currency,
  originalAmount,
  amountField = 'amount',
} = {}) {
  const ratesPayload = await getRates();
  const code = String(currency || doc.currency || BASE_CURRENCY).toUpperCase();
  const original =
    originalAmount != null
      ? Number(originalAmount)
      : Number(doc.originalAmount != null ? doc.originalAmount : doc[amountField]) || 0;
  const rate = rateToInr(code, ratesPayload.rates, ratesPayload.base);

  return {
    ...doc,
    currency: code,
    originalAmount: original,
    exchangeRateToInr: rate,
    exchangeRateSource: ratesPayload.source || '',
    exchangeRateAt: ratesPayload.fetchedAt || new Date(),
  };
}

function amountInInr(doc, fallbackAmount) {
  const original =
    doc.originalAmount != null
      ? Number(doc.originalAmount)
      : Number(fallbackAmount != null ? fallbackAmount : doc.amount != null ? doc.amount : doc.total) || 0;
  const rate = Number(doc.exchangeRateToInr);
  if (Number.isFinite(rate) && rate > 0) return original * rate;
  return original; // assume already INR when rate missing
}

module.exports = {
  FX_SCHEMA_FIELDS,
  stampFxFields,
  amountInInr,
};
