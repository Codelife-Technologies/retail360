import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { reportsAPI, salesAPI } from '../../services/api';
import SaleDetailsModal from '../../components/SaleDetailsModal';
import { getCatalogSku } from '../../utils/productDisplayUtils';
import {
  formatDate,
  financialYearOptions,
  resolveSalesQueryParams,
  getFinPeriodRange,
} from '../utils/financeUtils';
import {
  FinanceFilters,
  FinanceEmpty,
  FinanceToast,
  FinanceKpiCard,
  FinancePeriodToggle,
} from '../components/FinanceShared';
import { financeAPI } from '../services/financeApi';
import { getCurrencyForSalesChannelId } from '../../utils/locationCurrency';
import { useCurrency } from '../../currency/CurrencyContext';
import { CurrencySelector, OriginalAndConverted } from '../../currency/CurrencyUI';
import '../../currency/currency.css';

const PAYMENT_STATUSES = ['pending', 'paid', 'partial'];
const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const defaultFilters = () => {
  const range = getFinPeriodRange('month');
  return {
    fyOptions: financialYearOptions(),
    period: 'month',
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    month: '',
    financialYear: '',
    salesChannel: '',
    paymentStatus: '',
    orderStatus: '',
    search: '',
    sortBy: 'salesDate',
    sortDir: 'desc',
  };
};

function getProductSku(item) {
  return getCatalogSku(item.product) || item.sku || '—';
}

function getSaleProductSkus(sale) {
  const skus = (sale.items || [])
    .map((item) => getProductSku(item))
    .filter((sku) => sku && sku !== '—');
  return [...new Set(skus)].join(', ') || '—';
}

function getSaleQuantity(sale) {
  return (sale.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function FinanceSales() {
  const {
    displayCurrency,
    fromOriginal,
    formatOverall,
    formatDisplay,
    formatCurrencyAmount,
  } = useCurrency();
  const [filters, setFilters] = useState(defaultFilters);
  const [salesChannels, setSalesChannels] = useState([]);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [viewingSale, setViewingSale] = useState(null);
  const [viewingSaleLoading, setViewingSaleLoading] = useState(false);

  const reportCurrency = useMemo(
    () => getCurrencyForSalesChannelId(filters.salesChannel, salesChannels),
    [filters.salesChannel, salesChannels]
  );

  const formatKpiMoney = useCallback(
    (amountInInr, fallbackAmount) => {
      const inr =
        amountInInr != null
          ? Number(amountInInr) || 0
          : fromOriginal(fallbackAmount, reportCurrency, 'INR');
      if (displayCurrency === 'INR') return formatOverall(inr);
      return `${formatDisplay(inr)} (${formatCurrencyAmount(inr, 'INR')})`;
    },
    [displayCurrency, fromOriginal, reportCurrency, formatOverall, formatDisplay, formatCurrencyAmount]
  );

  useEffect(() => {
    financeAPI.getMeta().then((res) => {
      const channels = Array.isArray(res.data?.salesChannels) ? res.data.salesChannels : [];
      setSalesChannels(channels);
    }).catch(() => setSalesChannels([]));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = resolveSalesQueryParams(filters, page, 25);
      const statsParams = { ...params };
      delete statsParams.page;
      delete statsParams.limit;
      delete statsParams.sortBy;
      delete statsParams.sortDir;

      const [salesRes, statsRes] = await Promise.all([
        reportsAPI.getSalesDetailed(params),
        reportsAPI.getSalesStatistics(statsParams),
      ]);

      const payload = salesRes.data;
      setRows(Array.isArray(payload) ? payload : payload?.data || []);
      setPagination(payload?.pagination || null);
      setStats(statsRes.data || null);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load sales records');
      setRows([]);
      setPagination(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasActiveFilters = useMemo(() => (
    !!(
      filters.month
      || filters.financialYear
      || filters.salesChannel
      || filters.paymentStatus
      || filters.orderStatus
      || filters.search
      || (filters.period && filters.period !== 'month')
    )
  ), [filters]);

  const openFilters = () => {
    setDraftFilters({ ...filters });
    setShowFilters(true);
  };

  const applyFilters = () => {
    setPage(1);
    setFilters({ ...(draftFilters || defaultFilters()), period: 'custom' });
    setShowFilters(false);
  };

  const clearFilters = () => {
    const cleared = defaultFilters();
    setDraftFilters(cleared);
    setPage(1);
    setFilters(cleared);
    setShowFilters(false);
  };

  const handlePeriodChange = (periodId) => {
    setPage(1);
    if (periodId === 'custom') {
      setFilters((f) => ({
        ...f,
        period: 'custom',
        month: '',
        financialYear: '',
      }));
      return;
    }
    const range = getFinPeriodRange(periodId);
    setFilters((f) => ({
      ...f,
      period: periodId,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      month: '',
      financialYear: '',
    }));
  };

  const handleCustomDateChange = (patch) => {
    setPage(1);
    setFilters((f) => ({
      ...f,
      period: 'custom',
      month: '',
      financialYear: '',
      ...patch,
    }));
  };

  const exportReport = async () => {
    try {
      setExporting(true);
      const params = resolveSalesQueryParams(filters);
      const response = await reportsAPI.exportSalesDetailed(params);
      const start = params.startDate || 'all';
      const end = params.endDate || 'all';
      downloadBlob(
        new Blob([response.data], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `sales_records_${start}_${end}.xlsx`
      );
      setToast('Sales records exported');
      window.setTimeout(() => setToast(''), 2000);
    } catch (e) {
      alert(e.response?.data?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const openSaleDetail = async (sale) => {
    setViewingSale(sale);
    setViewingSaleLoading(true);
    try {
      const response = await salesAPI.getById(sale._id);
      setViewingSale(response.data);
    } catch (error) {
      console.error('Error loading sale details:', error);
      setViewingSale(sale);
    } finally {
      setViewingSaleLoading(false);
    }
  };

  const closeSaleDetail = () => {
    setViewingSale(null);
    setViewingSaleLoading(false);
  };

  return (
    <div className="fin-page">
      <div className="fin-page-header fin-sticky">
        <div>
          <h1>Sales</h1>
          <p className="fin-subtitle">
            Sales records for the selected period — click a row to view full details.
            {' '}Amounts follow display currency ({displayCurrency}).
          </p>
        </div>
        <div className="fin-actions">
          <CurrencySelector />
          <button
            type="button"
            className={`fin-btn${hasActiveFilters ? ' fin-btn-active' : ''}`}
            onClick={openFilters}
          >
            Filters{hasActiveFilters ? ' •' : ''}
          </button>
          <button type="button" className="fin-btn" disabled={exporting} onClick={exportReport}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button type="button" className="fin-btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <FinanceToast message={toast} />

      <FinancePeriodToggle
        period={filters.period || 'custom'}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onPeriodChange={handlePeriodChange}
        onCustomDateChange={handleCustomDateChange}
        extra={(
          <label className="fin-channel-filter">
            <span>Sales Channel</span>
            <select
              className="fin-input"
              value={filters.salesChannel || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((f) => ({ ...f, salesChannel: e.target.value }));
              }}
            >
              <option value="">All Channels</option>
              {salesChannels.map((channel) => (
                <option key={channel._id} value={channel._id}>
                  {channel.name}{channel.code ? ` (${channel.code})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      />

      <div className="fin-kpi-grid">
        <FinanceKpiCard
          loading={loading}
          label="Total Sales"
          value={stats?.totalSales ?? pagination?.total ?? 0}
          tone="info"
        />
        <FinanceKpiCard
          loading={loading}
          label="Total Revenue"
          value={formatKpiMoney(stats?.totalRevenueInr, stats?.totalRevenue || 0)}
          tone="success"
        />
        <FinanceKpiCard
          loading={loading}
          label="Avg Order Value"
          value={formatKpiMoney(stats?.averageOrderValue, stats?.averageOrderValue || 0)}
          tone="info"
        />
      </div>

      <div className="fin-card">
        <h3>Sales Records</h3>
        {loading ? (
          <div className="fin-skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="fin-skeleton-row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <FinanceEmpty
            title="No sales records"
            subtitle="Adjust your filters to see sales for a different period or channel."
          />
        ) : (
          <div className="fin-table-wrap">
            <table className="fin-table fin-sales-table">
              <thead>
                <tr>
                  <th>Sale #</th>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>Channel</th>
                  <th>Customer</th>
                  <th>SKU</th>
                  <th>Items</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Order Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => {
                  const itemCount = sale.items?.length || 0;
                  const qty = getSaleQuantity(sale);
                  return (
                    <tr
                      key={sale._id}
                      className="fin-row-clickable"
                      onClick={() => openSaleDetail(sale)}
                    >
                      <td data-label="Sale #">{sale.salesNumber || '—'}</td>
                      <td data-label="Order ID" className="mono">{sale.amazonOrderId || '—'}</td>
                      <td data-label="Date">{formatDate(sale.salesDate)}</td>
                      <td data-label="Channel">{sale.salesChannel?.name || '—'}</td>
                      <td data-label="Customer">{sale.customer?.name || '—'}</td>
                      <td data-label="SKU" className="mono fin-sales-sku">{getSaleProductSkus(sale)}</td>
                      <td data-label="Items">{itemCount}</td>
                      <td data-label="Qty">{qty}</td>
                      <td data-label="Subtotal">
                        <OriginalAndConverted
                          originalAmount={sale.subtotal}
                          originalCurrency={sale.currency || reportCurrency}
                          amountInInr={
                            Number(sale.exchangeRateToInr) > 0
                              ? (Number(sale.subtotal) || 0) * Number(sale.exchangeRateToInr)
                              : fromOriginal(sale.subtotal, sale.currency || reportCurrency, 'INR')
                          }
                        />
                      </td>
                      <td data-label="Total">
                        <OriginalAndConverted
                          originalAmount={sale.originalAmount != null ? sale.originalAmount : sale.total}
                          originalCurrency={sale.currency || reportCurrency}
                          amountInInr={
                            Number(sale.exchangeRateToInr) > 0
                              ? (Number(sale.originalAmount != null ? sale.originalAmount : sale.total) || 0) *
                                Number(sale.exchangeRateToInr)
                              : fromOriginal(
                                  sale.originalAmount != null ? sale.originalAmount : sale.total,
                                  sale.currency || reportCurrency,
                                  'INR'
                                )
                          }
                        />
                      </td>
                      <td data-label="Payment">{sale.paymentStatus || '—'}</td>
                      <td data-label="Order Status">{sale.orderStatus || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination ? (
          <div className="fin-pagination">
            <button
              type="button"
              className="fin-btn"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
              {pagination.total != null ? ` · ${pagination.total} records` : ''}
            </span>
            <button
              type="button"
              className="fin-btn"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      {showFilters && draftFilters ? (
        <div className="fin-modal-backdrop">
          <div className="fin-modal fin-filter-modal">
            <div className="fin-modal-header">
              <h2>Filter Sales Records</h2>
              <button type="button" className="fin-link" onClick={() => setShowFilters(false)}>
                Close
              </button>
            </div>
            <div className="fin-filter-modal-body">
              <FinanceFilters
                filters={draftFilters}
                onChange={setDraftFilters}
                extra={(
                  <>
                    <label className="fin-field">
                      <span>Channel</span>
                      <select
                        className="fin-input"
                        value={draftFilters.salesChannel || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, salesChannel: e.target.value })}
                      >
                        <option value="">All Channels</option>
                        {salesChannels.map((channel) => (
                          <option key={channel._id} value={channel._id}>
                            {channel.name}{channel.code ? ` (${channel.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Payment Status</span>
                      <select
                        className="fin-input"
                        value={draftFilters.paymentStatus || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, paymentStatus: e.target.value })}
                      >
                        <option value="">All</option>
                        {PAYMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Order Status</span>
                      <select
                        className="fin-input"
                        value={draftFilters.orderStatus || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, orderStatus: e.target.value })}
                      >
                        <option value="">All</option>
                        {ORDER_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Sort By</span>
                      <select
                        className="fin-input"
                        value={draftFilters.sortBy || 'salesDate'}
                        onChange={(e) => setDraftFilters({ ...draftFilters, sortBy: e.target.value })}
                      >
                        <option value="salesDate">Sale Date</option>
                        <option value="total">Order Total</option>
                        <option value="salesNumber">Sale Number</option>
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Sort Direction</span>
                      <select
                        className="fin-input"
                        value={draftFilters.sortDir || 'desc'}
                        onChange={(e) => setDraftFilters({ ...draftFilters, sortDir: e.target.value })}
                      >
                        <option value="desc">Newest / Highest first</option>
                        <option value="asc">Oldest / Lowest first</option>
                      </select>
                    </label>
                    <label className="fin-field">
                      <span>Search</span>
                      <input
                        className="fin-input"
                        placeholder="Sale #, order ID, customer…"
                        value={draftFilters.search || ''}
                        onChange={(e) => setDraftFilters({ ...draftFilters, search: e.target.value })}
                      />
                    </label>
                  </>
                )}
              />
            </div>
            <div className="fin-modal-actions">
              <button type="button" className="fin-btn" onClick={clearFilters}>Clear</button>
              <button type="button" className="fin-btn fin-btn-primary" onClick={applyFilters}>Apply</button>
            </div>
          </div>
        </div>
      ) : null}

      {(viewingSale || viewingSaleLoading) && (
        <SaleDetailsModal
          sale={viewingSale}
          loading={viewingSaleLoading}
          onClose={closeSaleDetail}
        />
      )}
    </div>
  );
}

export default FinanceSales;
