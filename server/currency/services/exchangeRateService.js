const https = require('https');
const http = require('http');
const ExchangeRateCache = require('../models/ExchangeRateCache');
const { BASE_CURRENCY, SUPPORTED_CURRENCIES } = require('../constants');

const FALLBACK_RATES_FROM_INR = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0095,
  AED: 0.044,
  SAR: 0.045,
  SGD: 0.016,
  AUD: 0.018,
  CAD: 0.016,
  JPY: 1.8,
};

function refreshMinutes() {
  const n = Number(process.env.EXCHANGE_RATE_REFRESH_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function apiUrl(base) {
  const configured = process.env.EXCHANGE_RATE_API_URL;
  if (configured) {
    return configured.replace('{base}', base).replace('{BASE}', base);
  }
  return `https://open.er-api.com/v6/latest/${base}`;
}

function httpGetJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Exchange rate API HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Exchange rate API timeout'));
    });
  });
}

function ratesObjectFromDoc(doc) {
  if (!doc?.rates) return { ...FALLBACK_RATES_FROM_INR };
  if (doc.rates instanceof Map) {
    return Object.fromEntries(doc.rates.entries());
  }
  return { ...doc.rates };
}

async function fetchLiveRates(base = BASE_CURRENCY) {
  const url = apiUrl(base);
  const data = await httpGetJson(url);
  const raw = data.rates || data.conversion_rates || {};
  const rates = { [base]: 1 };
  SUPPORTED_CURRENCIES.forEach(({ code }) => {
    if (code === base) return;
    const v = Number(raw[code]);
    if (Number.isFinite(v) && v > 0) rates[code] = v;
  });
  Object.entries(FALLBACK_RATES_FROM_INR).forEach(([code, v]) => {
    if (rates[code] == null) rates[code] = v;
  });
  return {
    base,
    rates,
    source: data.provider || data.result || 'open.er-api.com',
    fetchedAt: new Date(),
  };
}

async function persistRates(payload) {
  const minutes = refreshMinutes();
  const nextRefreshAt = new Date(Date.now() + minutes * 60 * 1000);
  const doc = await ExchangeRateCache.findOneAndUpdate(
    { base: payload.base },
    {
      base: payload.base,
      rates: payload.rates,
      source: String(payload.source || 'exchange-api').slice(0, 200),
      fetchedAt: payload.fetchedAt || new Date(),
      nextRefreshAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc;
}

async function getRates({ force = false, base = BASE_CURRENCY } = {}) {
  let doc = await ExchangeRateCache.findOne({ base }).lean();
  const stale =
    !doc ||
    !doc.nextRefreshAt ||
    new Date(doc.nextRefreshAt).getTime() <= Date.now() ||
    !doc.rates;

  if (force || stale) {
    try {
      const live = await fetchLiveRates(base);
      doc = await persistRates(live);
      doc = doc.toObject ? doc.toObject() : doc;
    } catch (err) {
      if (!doc) {
        doc = await persistRates({
          base,
          rates: FALLBACK_RATES_FROM_INR,
          source: `fallback:${err.message}`,
          fetchedAt: new Date(),
        });
        doc = doc.toObject ? doc.toObject() : doc;
      }
    }
  }

  const rates = ratesObjectFromDoc(doc);
  rates[base] = 1;

  return {
    base,
    rates,
    source: doc.source,
    fetchedAt: doc.fetchedAt,
    nextRefreshAt: doc.nextRefreshAt,
    refreshMinutes: refreshMinutes(),
    currencies: SUPPORTED_CURRENCIES,
  };
}

function rateToInr(currency, rates, base = BASE_CURRENCY) {
  const code = String(currency || base).toUpperCase();
  if (code === base) return 1;
  const perBase = Number(rates?.[code]);
  if (!Number.isFinite(perBase) || perBase <= 0) return 1;
  return 1 / perBase;
}

function convertAmount(amount, from, to, rates, base = BASE_CURRENCY) {
  const value = Number(amount) || 0;
  const fromCode = String(from || base).toUpperCase();
  const toCode = String(to || base).toUpperCase();
  if (fromCode === toCode) return value;
  const inInr = value * rateToInr(fromCode, rates, base);
  if (toCode === base) return inInr;
  const perBase = Number(rates?.[toCode]);
  if (!Number.isFinite(perBase) || perBase <= 0) return inInr;
  return inInr * perBase;
}

function toInr(amount, currency, ratesOrRate) {
  if (typeof ratesOrRate === 'number' && Number.isFinite(ratesOrRate) && ratesOrRate > 0) {
    return (Number(amount) || 0) * ratesOrRate;
  }
  return convertAmount(amount, currency, BASE_CURRENCY, ratesOrRate || FALLBACK_RATES_FROM_INR);
}

function startRateRefreshScheduler() {
  const minutes = refreshMinutes();
  const tick = async () => {
    try {
      await getRates({ force: true });
    } catch (_e) {
      /* keep last cache */
    }
  };
  tick();
  return setInterval(tick, minutes * 60 * 1000);
}

module.exports = {
  getRates,
  fetchLiveRates,
  convertAmount,
  rateToInr,
  toInr,
  startRateRefreshScheduler,
  FALLBACK_RATES_FROM_INR,
  refreshMinutes,
};
