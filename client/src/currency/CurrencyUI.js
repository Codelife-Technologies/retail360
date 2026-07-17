import React from 'react';
import { useCurrency } from './CurrencyContext';
import './currency.css';

export function CurrencySelector({ className = '' }) {
  const {
    displayCurrency,
    setDisplayCurrency,
    currencies,
    ratesMeta,
    refreshRates,
    loading,
  } = useCurrency();

  const options = (Array.isArray(currencies) && currencies.length > 0)
    ? currencies
    : [
      { code: 'INR', name: 'Indian Rupee' },
      { code: 'USD', name: 'US Dollar' },
      { code: 'AED', name: 'UAE Dirham' },
    ];

  const selectValue = options.some((c) => c.code === displayCurrency)
    ? displayCurrency
    : (options[0]?.code || 'INR');

  const updated = ratesMeta?.fetchedAt
    ? new Date(ratesMeta.fetchedAt).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '—';

  return (
    <div className={`fx-selector ${className}`.trim()}>
      <label className="fx-selector-field">
        <span>Display currency</span>
        <select
          className="fx-select"
          value={selectValue}
          onChange={(e) => setDisplayCurrency(e.target.value)}
          disabled={loading && options.length === 0}
        >
          {options.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="fx-rate-badge" title={ratesMeta?.source || ''}>
        <span>Rates updated: {updated}</span>
        <button type="button" className="fx-refresh" onClick={() => refreshRates()} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}

export function OverallAmount({ amountInInr, className = '' }) {
  const { formatOverall } = useCurrency();
  return <span className={className}>{formatOverall(amountInInr)}</span>;
}

export function DualKpiValue({ amountInInr, loading }) {
  const { formatInr, formatUsd, formatDisplay, displayCurrency } = useCurrency();
  if (loading) return <span>…</span>;
  if (displayCurrency === 'INR') {
    return (
      <span className="fx-dual-value">
        <span className="fx-primary">{formatInr(amountInInr)}</span>
        <span className="fx-secondary">({formatUsd(amountInInr)})</span>
      </span>
    );
  }
  return (
    <span className="fx-dual-value">
      <span className="fx-primary">{formatDisplay(amountInInr)}</span>
      <span className="fx-secondary">({formatInr(amountInInr)})</span>
    </span>
  );
}

export function OriginalAndConverted({
  originalAmount,
  originalCurrency,
  amountInInr,
}) {
  const { formatOriginalWithConverted } = useCurrency();
  const { label } = formatOriginalWithConverted(
    originalAmount,
    originalCurrency,
    amountInInr
  );
  return <span className="fx-original-converted">{label}</span>;
}

export default CurrencySelector;
