import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import api from '../services/api';

const CurrencyContext = createContext(null);

const STORAGE_KEY = 'retailos_display_currency';

const DEFAULT_CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 0 },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
];

export function formatCurrencyAmount(amount, currency = 'INR', currencies = DEFAULT_CURRENCIES) {
  const meta = currencies.find((c) => c.code === currency) || DEFAULT_CURRENCIES[0];
  const value = Number(amount) || 0;
  const decimals = meta.decimals ?? 2;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: meta.code,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals === 0 ? 0 : 2,
    }).format(value);
  } catch (_e) {
    return `${meta.symbol} ${value.toLocaleString('en-IN', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals === 0 ? 0 : 2,
    })}`;
  }
}

export function CurrencyProvider({ children }) {
  const [displayCurrency, setDisplayCurrencyState] = useState(() => {
    try {
      return String(localStorage.getItem(STORAGE_KEY) || 'INR').trim().toUpperCase() || 'INR';
    } catch (_e) {
      return 'INR';
    }
  });
  const [ratesPayload, setRatesPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadRates = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await api.get('/currency/rates', {
        params: force ? { refresh: 1 } : undefined,
      });
      setRatesPayload(res.data);
    } catch (_e) {
      setRatesPayload((prev) => prev || {
        base: 'INR',
        rates: { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095, AED: 0.044 },
        fetchedAt: null,
        source: 'offline-fallback',
        currencies: DEFAULT_CURRENCIES,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates(false);
    const minutes = Number(ratesPayload?.refreshMinutes) || 60;
    const id = window.setInterval(() => loadRates(false), minutes * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRates]);

  const setDisplayCurrency = useCallback((code) => {
    const next = String(code || 'INR').trim().toUpperCase();
    setDisplayCurrencyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_e) {
      /* ignore */
    }
  }, []);

  const rates = ratesPayload?.rates || { INR: 1, USD: 0.012 };
  const currencies = (Array.isArray(ratesPayload?.currencies) && ratesPayload.currencies.length > 0)
    ? ratesPayload.currencies
    : DEFAULT_CURRENCIES;
  const base = ratesPayload?.base || 'INR';

  // Keep select value valid once currency list is known (handles stale localStorage).
  useEffect(() => {
    const codes = new Set(currencies.map((c) => String(c.code || '').toUpperCase()));
    const current = String(displayCurrency || '').toUpperCase();
    if (codes.size > 0 && current && !codes.has(current)) {
      setDisplayCurrency(base || 'INR');
    }
  }, [currencies, displayCurrency, base, setDisplayCurrency]);

  const convert = useCallback((amountInInr, toCurrency = displayCurrency) => {
    const value = Number(amountInInr) || 0;
    const code = String(toCurrency || base).toUpperCase();
    if (code === base) return value;
    const perBase = Number(rates[code]);
    if (!Number.isFinite(perBase) || perBase <= 0) return value;
    return value * perBase;
  }, [rates, displayCurrency, base]);

  const fromOriginal = useCallback((amount, fromCurrency, toCurrency = displayCurrency) => {
    const value = Number(amount) || 0;
    const from = String(fromCurrency || base).toUpperCase();
    const to = String(toCurrency || base).toUpperCase();
    if (from === to) return value;
    const fromRate = Number(rates[from]);
    const inInr = from === base || !fromRate ? value : value / fromRate;
    return convert(inInr, to);
  }, [rates, convert, base, displayCurrency]);

  const formatInr = useCallback(
    (amountInInr) => formatCurrencyAmount(amountInInr, 'INR', currencies),
    [currencies]
  );

  const formatUsd = useCallback(
    (amountInInr) => formatCurrencyAmount(convert(amountInInr, 'USD'), 'USD', currencies),
    [convert, currencies]
  );

  /** Overall reporting: INR with USD in brackets */
  const formatOverall = useCallback(
    (amountInInr) => `${formatInr(amountInInr)} (${formatUsd(amountInInr)})`,
    [formatInr, formatUsd]
  );

  const formatDisplay = useCallback(
    (amountInInr) => formatCurrencyAmount(convert(amountInInr, displayCurrency), displayCurrency, currencies),
    [convert, displayCurrency, currencies]
  );

  const formatOriginalWithConverted = useCallback(
    (originalAmount, originalCurrency, amountInInr) => {
      const orig = formatCurrencyAmount(originalAmount, originalCurrency, currencies);
      const converted = formatOverall(amountInInr != null ? amountInInr : fromOriginal(originalAmount, originalCurrency, 'INR'));
      return { original: orig, converted, label: `${orig} → ${converted}` };
    },
    [currencies, formatOverall, fromOriginal]
  );

  const value = useMemo(() => ({
    displayCurrency,
    setDisplayCurrency,
    rates,
    base,
    currencies,
    ratesMeta: {
      source: ratesPayload?.source,
      fetchedAt: ratesPayload?.fetchedAt,
      nextRefreshAt: ratesPayload?.nextRefreshAt,
      refreshMinutes: ratesPayload?.refreshMinutes,
    },
    loading,
    refreshRates: () => loadRates(true),
    convert,
    fromOriginal,
    formatInr,
    formatUsd,
    formatOverall,
    formatDisplay,
    formatOriginalWithConverted,
    formatCurrencyAmount: (amount, currency) => formatCurrencyAmount(amount, currency, currencies),
  }), [
    displayCurrency, setDisplayCurrency, rates, base, currencies, ratesPayload,
    loading, loadRates, convert, fromOriginal, formatInr, formatUsd, formatOverall,
    formatDisplay, formatOriginalWithConverted,
  ]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return ctx;
}

export default CurrencyContext;
