import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { reportsAPI, salesChannelsAPI, salesAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
import { getCatalogSku } from '../utils/productDisplayUtils';
import Pagination from './Pagination';
import SaleDetailsModal from './SaleDetailsModal';
import './SalesDashboard.css';

const formatAed = (amount) => formatMoney(amount, 'AED');

function parseDateStr(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShortDate(date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatMonthYear(date) {
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function formatRangeSpan(startStr, endStr) {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  if (!start || !end) return '';

  if (startStr === endStr) {
    return formatShortDate(start);
  }

  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    const monthYear = start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return `${start.getDate()}–${end.getDate()} ${monthYear}`;
  }

  if (sameYear) {
    return `${formatShortDate(start)} – ${formatShortDate(end)}, ${start.getFullYear()}`;
  }

  return `${formatShortDate(start)}, ${start.getFullYear()} – ${formatShortDate(end)}, ${end.getFullYear()}`;
}

function formatComparisonPeriodLabel(startStr, endStr, periodFilter, isPrevious) {
  const span = formatRangeSpan(startStr, endStr);
  if (!span) return isPrevious ? 'Previous period' : 'Current period';

  switch (periodFilter) {
    case 'day':
      return isPrevious ? `Yesterday (${span})` : `Today (${span})`;
    case 'week':
      return isPrevious ? `Last week (${span})` : `This week (${span})`;
    case 'fortnight':
      return isPrevious ? `Prior 14 days (${span})` : `Last 14 days (${span})`;
    case 'month': {
      const start = parseDateStr(startStr);
      if (start && startStr !== endStr) {
        return isPrevious
          ? `${formatMonthYear(start)} (${span})`
          : `${formatMonthYear(start)} MTD (${span})`;
      }
      return isPrevious ? `Previous month (${span})` : `This month (${span})`;
    }
    case 'custom':
      return isPrevious ? `Previous range (${span})` : `Selected range (${span})`;
    case 'allTime':
      return isPrevious ? 'Previous period' : 'All time';
    default:
      return isPrevious ? `Previous (${span})` : `Current (${span})`;
  }
}

const PERIOD_OPTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'month', label: 'Month' },
  { id: 'allTime', label: 'All Time' },
  { id: 'custom', label: 'Custom' },
];

const defaultDashboardFilters = () => ({
  period: 'month',
  chartTimeline: 'auto',
  customStart: '',
  customEnd: '',
  salesChannel: '',
});

function buildDashboardParams(applied) {
  const params = {
    period: applied.period,
    chartTimeline: applied.chartTimeline,
    salesChannel: applied.salesChannel || undefined,
  };
  if (applied.period === 'custom') {
    if (applied.customStart) params.startDate = applied.customStart;
    if (applied.customEnd) params.endDate = applied.customEnd;
  }
  return params;
}

function buildRecordParams(applied, currentRange, page) {
  const params = {
    salesChannel: applied.salesChannel || undefined,
    sortBy: 'salesDate',
    sortDir: 'desc',
    page,
    limit: 25,
  };
  if (applied.period === 'allTime') {
    return params;
  }
  if (applied.period === 'custom') {
    if (applied.customStart) params.startDate = applied.customStart;
    if (applied.customEnd) params.endDate = applied.customEnd;
    return params;
  }
  if (currentRange?.start) params.startDate = currentRange.start;
  if (currentRange?.end) params.endDate = currentRange.end;
  return params;
}

const CHART_TIMELINE_OPTIONS = [
  { id: 'auto', label: 'Auto (best fit)' },
  { id: 'hour', label: 'Hourly' },
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'month', label: 'Monthly' },
];

const PIE_COLORS = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

const COMPARISON_CHART_HEIGHT = 440;
const PIE_CHART_HEIGHT = 380;

const emptyDashboard = {
  periodLabel: '',
  currentRange: { start: '', end: '' },
  previousRange: { start: '', end: '' },
  overview: {
    today: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
    thisWeek: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
    thisMonth: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
    allTime: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  },
  currentPeriod: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  previousPeriod: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  change: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  comparisonChart: [],
  channelBreakdown: [],
  chartTimeline: 'auto',
  chartTimelineLabel: 'Auto',
};

function ChangeBadge({ value }) {
  if (value === 0 || value == null) {
    return <span className="sales-dash-change neutral">—</span>;
  }
  const positive = value > 0;
  return (
    <span className={`sales-dash-change ${positive ? 'up' : 'down'}`}>
      {positive ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, subValue, change, highlight }) {
  return (
    <div className={`sales-dash-kpi${highlight ? ' highlight' : ''}`}>
      <span className="sales-dash-kpi-label">{label}</span>
      <strong className="sales-dash-kpi-value">{value}</strong>
      {subValue != null && <span className="sales-dash-kpi-sub">{subValue}</span>}
      {change != null && <ChangeBadge value={change} />}
    </div>
  );
}

function SalesDashboard() {
  const [filters, setFilters] = useState(defaultDashboardFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultDashboardFilters);
  const [channels, setChannels] = useState([]);
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPagination, setRecordsPagination] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [viewingSale, setViewingSale] = useState(null);
  const [viewingSaleLoading, setViewingSaleLoading] = useState(false);

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setChannels(res.data || []);
    }).catch(() => setChannels([]));
  }, []);

  const fetchDashboardData = useCallback(async () => {
    const dashParams = buildDashboardParams(appliedFilters);
    const response = await reportsAPI.getSalesDashboard(dashParams);
    return { ...emptyDashboard, ...response.data };
  }, [appliedFilters]);

  const fetchSalesRecords = useCallback(async (currentRange, page) => {
    const recordParams = buildRecordParams(appliedFilters, currentRange, page);
    const response = await reportsAPI.getSalesDetailed(recordParams);
    if (response.data?.pagination) {
      return {
        rows: response.data.data || [],
        pagination: response.data.pagination,
      };
    }
    const rows = Array.isArray(response.data) ? response.data : response.data?.data || [];
    return { rows, pagination: null };
  }, [appliedFilters]);

  const loadDashboard = useCallback(async () => {
    if (appliedFilters.period === 'custom' && (!appliedFilters.customStart || !appliedFilters.customEnd)) {
      return;
    }

    try {
      setLoading(true);
      setRecordsLoading(true);
      const dashboardData = await fetchDashboardData();
      setData(dashboardData);

      const { rows, pagination } = await fetchSalesRecords(dashboardData.currentRange, recordsPage);
      setRecords(rows);
      setRecordsPagination(pagination);
    } catch (error) {
      console.error('Error fetching sales dashboard:', error);
      setData(emptyDashboard);
      setRecords([]);
      setRecordsPagination(null);
    } finally {
      setLoading(false);
      setRecordsLoading(false);
    }
  }, [appliedFilters, recordsPage, fetchDashboardData, fetchSalesRecords]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleApplyFilters = () => {
    if (filters.period === 'custom' && (!filters.customStart || !filters.customEnd)) {
      alert('Select both start and end dates for a custom range.');
      return;
    }
    setRecordsPage(1);
    setAppliedFilters({ ...filters });
  };

  const handlePeriodChange = (nextPeriod) => {
    setFilters((prev) => ({
      ...prev,
      period: nextPeriod,
      customStart: nextPeriod === 'custom' ? prev.customStart : '',
      customEnd: nextPeriod === 'custom' ? prev.customEnd : '',
    }));
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

  const getSaleProductSkus = (sale) => {
    const skus = (sale.items || [])
      .map((item) => getCatalogSku(item.product) || item.sku)
      .filter(Boolean);
    return [...new Set(skus)].join(', ') || '—';
  };

  const isAllTimeView = appliedFilters.period === 'allTime';
  const { overview, currentPeriod, previousPeriod, change, comparisonChart, channelBreakdown } = data;
  const period = appliedFilters.period;

  const chartTooltipFormatter = (value, name) => {
    if (String(name).toLowerCase().includes('revenue')) return [formatAed(value), name];
    return [value, name];
  };

  const currentLegendLabel = formatComparisonPeriodLabel(
    data.currentRange?.start,
    data.currentRange?.end,
    period,
    false
  );
  const previousLegendLabel = formatComparisonPeriodLabel(
    data.previousRange?.start,
    data.previousRange?.end,
    period,
    true
  );

  const currentOrdersLegend = `${currentLegendLabel} — orders`;
  const previousOrdersLegend = `${previousLegendLabel} — orders`;
  const currentRevenueLegend = `${currentLegendLabel} — revenue`;
  const previousRevenueLegend = `${previousLegendLabel} — revenue`;

  return (
    <div className="sales-dashboard">
      <header className="sales-dash-header">
        <div>
          <h1>Sales Dashboard</h1>
          <p className="sales-dash-subtitle">
            Revenue, orders, and trends with period-over-period comparison
          </p>
        </div>
        <button type="button" className="sales-dash-btn-refresh" onClick={loadDashboard} disabled={loading}>
          Refresh
        </button>
      </header>

      <section className="sales-dash-filters">
        <div className="sales-dash-period-toggle">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={filters.period === opt.id ? 'active' : ''}
              onClick={() => handlePeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="sales-dash-filter-row">
          {filters.period === 'custom' && (
            <>
              <label className="sales-dash-filter-field">
                <span>From</span>
                <input
                  type="date"
                  value={filters.customStart}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customStart: e.target.value }))}
                />
              </label>
              <label className="sales-dash-filter-field">
                <span>To</span>
                <input
                  type="date"
                  value={filters.customEnd}
                  onChange={(e) => setFilters((prev) => ({ ...prev, customEnd: e.target.value }))}
                />
              </label>
            </>
          )}
          <label className="sales-dash-filter-field">
            <span>Channel</span>
            <select
              value={filters.salesChannel}
              onChange={(e) => setFilters((prev) => ({ ...prev, salesChannel: e.target.value }))}
            >
              <option value="">All channels</option>
              {channels.map((ch) => (
                <option key={ch._id} value={ch._id}>{ch.name}</option>
              ))}
            </select>
          </label>
          <label className="sales-dash-filter-field">
            <span>Comparison timeline</span>
            <select
              value={filters.chartTimeline}
              onChange={(e) => setFilters((prev) => ({ ...prev, chartTimeline: e.target.value }))}
            >
              {CHART_TIMELINE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <div className="sales-dash-filter-apply">
            <button type="button" className="sales-dash-btn-apply" onClick={handleApplyFilters}>
              Apply
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="sales-dash-loading">Loading dashboard...</div>
      ) : (
        <>
          <section className="sales-dash-section">
            <h2>Overview</h2>
            <div className="sales-dash-kpi-grid">
              <KpiCard
                label="Today"
                value={formatAed(overview.today.totalRevenue)}
                subValue={`${overview.today.totalSales} orders · ${overview.today.totalItemsSold} units`}
              />
              <KpiCard
                label="This Week"
                value={formatAed(overview.thisWeek.totalRevenue)}
                subValue={`${overview.thisWeek.totalSales} orders · ${overview.thisWeek.totalItemsSold} units`}
              />
              <KpiCard
                label="This Month"
                value={formatAed(overview.thisMonth.totalRevenue)}
                subValue={`${overview.thisMonth.totalSales} orders · ${overview.thisMonth.totalItemsSold} units`}
              />
              <KpiCard
                label="All Time"
                value={formatAed(overview.allTime.totalRevenue)}
                subValue={`${overview.allTime.totalSales} orders · ${overview.allTime.totalItemsSold} units`}
                highlight
              />
            </div>
          </section>

          <section className="sales-dash-section">
            <h2>{isAllTimeView ? 'All Time Summary' : (data.periodLabel || 'Selected Period')}</h2>
            {!isAllTimeView && (
              <p className="sales-dash-range-hint">
                <span className="sales-dash-range-chip current">{currentLegendLabel}</span>
                {' vs '}
                <span className="sales-dash-range-chip previous">{previousLegendLabel}</span>
              </p>
            )}
            {isAllTimeView && (
              <p className="sales-dash-range-hint">
                Complete sales history — period comparison is not shown for all-time view.
              </p>
            )}
            <div className="sales-dash-kpi-grid period-compare">
              <KpiCard
                label="Revenue"
                value={formatAed(currentPeriod.totalRevenue)}
                subValue={isAllTimeView ? `${currentPeriod.totalSales} orders` : `${previousLegendLabel}: ${formatAed(previousPeriod.totalRevenue)}`}
                change={isAllTimeView ? null : change.totalRevenue}
              />
              <KpiCard
                label="Orders"
                value={currentPeriod.totalSales}
                subValue={isAllTimeView ? `${currentPeriod.totalItemsSold} units sold` : `${previousLegendLabel}: ${previousPeriod.totalSales}`}
                change={isAllTimeView ? null : change.totalSales}
              />
              <KpiCard
                label="Units Sold"
                value={currentPeriod.totalItemsSold}
                subValue={isAllTimeView ? `Avg order ${formatAed(currentPeriod.averageOrderValue)}` : `${previousLegendLabel}: ${previousPeriod.totalItemsSold}`}
                change={isAllTimeView ? null : change.totalItemsSold}
              />
              <KpiCard
                label="Avg Order Value"
                value={formatAed(currentPeriod.averageOrderValue)}
                subValue={isAllTimeView ? 'All-time average' : `${previousLegendLabel}: ${formatAed(previousPeriod.averageOrderValue)}`}
                change={isAllTimeView ? null : change.averageOrderValue}
              />
            </div>
          </section>

          {!isAllTimeView && (
          <section className="sales-dash-section">
            <div className="sales-dash-section-header">
              <div>
                <h2>Period Comparison</h2>
                <p className="sales-dash-range-hint">
                  {currentLegendLabel} vs {previousLegendLabel}
                  {data.chartTimelineLabel && (
                    <> · Grouped by <strong>{data.chartTimelineLabel}</strong></>
                  )}
                </p>
              </div>
            </div>
            {comparisonChart.length === 0 ? (
              <p className="sales-dash-empty">No comparison data for the selected period.</p>
            ) : (
              <div className="sales-dash-chart-grid comparison">
                <div className="sales-dash-chart-legend-row">
                  <span className="sales-dash-range-chip current">{currentLegendLabel}</span>
                  <span className="sales-dash-range-chip previous">{previousLegendLabel}</span>
                </div>
                <div className="sales-dash-chart-card">
                  <h3>Revenue Comparison</h3>
                  <ResponsiveContainer width="100%" height={COMPARISON_CHART_HEIGHT}>
                    <BarChart data={comparisonChart} barGap={4} barCategoryGap="18%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={chartTooltipFormatter} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="currentRevenue" fill="#667eea" name={currentRevenueLegend} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="previousRevenue" fill="#94a3b8" name={previousRevenueLegend} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="sales-dash-chart-card">
                  <h3>Orders Comparison</h3>
                  <ResponsiveContainer width="100%" height={COMPARISON_CHART_HEIGHT}>
                    <LineChart data={comparisonChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="currentOrders" stroke="#10b981" strokeWidth={2} name={currentOrdersLegend} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="previousOrders" stroke="#f59e0b" strokeWidth={2} name={previousOrdersLegend} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>
          )}

          <section className="sales-dash-section">
            <h2>Sales Records — {data.periodLabel || 'Selected Period'}</h2>
            <p className="sales-dash-range-hint">
              {isAllTimeView
                ? 'All sales orders in the system — click a row to view full order details'
                : `Orders from ${formatRangeSpan(data.currentRange?.start, data.currentRange?.end) || 'selected period'} — click a row to view details`}
            </p>
            {recordsLoading ? (
              <p className="sales-dash-empty">Loading sales records…</p>
            ) : records.length === 0 ? (
              <p className="sales-dash-empty">No sales records for the selected filters.</p>
            ) : (
              <>
                <div className="sales-dash-records-wrap">
                  <table className="sales-dash-records-table">
                    <thead>
                      <tr>
                        <th>Product SKU</th>
                        <th>Amazon Order ID</th>
                        <th>Sale Date</th>
                        <th>Channel</th>
                        <th>Items</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((sale) => (
                        <tr
                          key={sale._id}
                          className="sales-dash-record-row"
                          onClick={() => openSaleDetail(sale)}
                        >
                          <td className="mono">{getSaleProductSkus(sale)}</td>
                          <td className="mono">{sale.amazonOrderId || '—'}</td>
                          <td>{new Date(sale.salesDate).toLocaleDateString('en-IN')}</td>
                          <td>{sale.salesChannel?.name || '—'}</td>
                          <td className="num">{sale.items?.length || 0}</td>
                          <td className="num">{formatAed(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {recordsPagination && (
                  <Pagination
                    currentPage={recordsPagination.page}
                    totalPages={recordsPagination.totalPages}
                    totalItems={recordsPagination.total}
                    itemsPerPage={recordsPagination.limit}
                    onPageChange={setRecordsPage}
                  />
                )}
              </>
            )}
          </section>

          <section className="sales-dash-section">
            <h2>Revenue by Channel</h2>
            {channelBreakdown.length === 0 ? (
              <p className="sales-dash-empty">No channel data for the selected period.</p>
            ) : (
              <div className="sales-dash-chart-grid single">
                <div className="sales-dash-chart-card">
                  <ResponsiveContainer width="100%" height={PIE_CHART_HEIGHT}>
                    <PieChart>
                      <Pie
                        data={channelBreakdown}
                        dataKey="revenue"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {channelBreakdown.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [formatAed(value), 'Revenue']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="sales-dash-channel-table-wrap">
                  <table className="sales-dash-channel-table">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Orders</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelBreakdown.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{row.orders}</td>
                          <td>{formatAed(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

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

export default SalesDashboard;
