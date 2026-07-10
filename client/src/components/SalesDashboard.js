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

  if (isPrevious) {
    const start = parseDateStr(startStr);
    if (start && periodFilter !== 'day' && periodFilter !== 'allTime') {
      return `Previous month (${formatMonthYear(start)})`;
    }
  }

  switch (periodFilter) {
    case 'day':
      return isPrevious ? `Yesterday (${span})` : `Today (${span})`;
    case 'week':
      return isPrevious ? `Previous month (${span})` : `This week (${span})`;
    case 'fortnight':
      return isPrevious ? `Previous month (${span})` : `Last 14 days (${span})`;
    case 'month':
      return isPrevious ? `Previous month (${span})` : `This month (${span})`;
    case 'custom':
      return isPrevious ? `Previous month (${span})` : `Selected range (${span})`;
    case 'allTime':
      return isPrevious ? `Last year YTD (${span})` : `This year (${span})`;
    default:
      return isPrevious ? `Previous (${span})` : `Current (${span})`;
  }
}

const emptyStat = () => ({
  totalSales: 0,
  totalRevenue: 0,
  totalItemsSold: 0,
  averageOrderValue: 0,
});

const emptyOverviewTile = (key, label) => ({
  key,
  label,
  start: '',
  end: '',
  ...emptyStat(),
});

const PERIOD_OPTIONS = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'allTime', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

const defaultDashboardFilters = () => ({
  period: 'month',
  chartTimeline: 'auto',
  customStart: '',
  customEnd: '',
  salesChannel: '',
});

function resolveCustomDates(start, end) {
  if (!start) return null;
  if (!end) return { startDate: start, endDate: start };
  if (new Date(start) > new Date(end)) return null;
  return { startDate: start, endDate: end };
}

function isValidCustomRange(start, end) {
  return resolveCustomDates(start, end) !== null;
}

function buildDashboardParams(applied) {
  const params = {
    period: applied.period,
    chartTimeline: applied.chartTimeline,
    salesChannel: applied.salesChannel || undefined,
  };
  if (applied.period === 'custom') {
    const customDates = resolveCustomDates(applied.customStart, applied.customEnd);
    if (customDates) {
      params.startDate = customDates.startDate;
      params.endDate = customDates.endDate;
    }
  }
  return params;
}

function buildRecordParams(applied, currentRange, page, limit = 25) {
  const params = {
    salesChannel: applied.salesChannel || undefined,
    sortBy: 'salesDate',
    sortDir: 'desc',
    page,
    limit,
  };
  if (applied.period === 'allTime') {
    return params;
  }
  if (applied.period === 'custom') {
    const customDates = resolveCustomDates(applied.customStart, applied.customEnd);
    if (customDates) {
      params.startDate = customDates.startDate;
      params.endDate = customDates.endDate;
    }
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

const AMAZON_CHART_CURRENT = '#007185';
const AMAZON_CHART_PREVIOUS = '#aab7b8';

const CHANNEL_PIE_COLORS = [
  '#007185',
  '#232f3e',
  '#ff9900',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#f59e0b',
];

const COMPARISON_CHART_HEIGHT = 320;

const emptyDashboard = {
  periodLabel: '',
  currentRange: { start: '', end: '' },
  previousRange: { start: '', end: '' },
  overview: {
    days: [],
    past3Weeks: emptyOverviewTile('past-3-weeks', 'Past 3 weeks'),
    past3Months: emptyOverviewTile('past-3-months', 'Past 3 months'),
    thisYear: emptyOverviewTile('this-year', 'This year'),
  },
  currentPeriod: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  previousPeriod: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  change: { totalSales: 0, totalRevenue: 0, totalItemsSold: 0, averageOrderValue: 0 },
  comparisonChart: [],
  channelBreakdown: [],
  chartTimeline: 'auto',
  chartTimelineLabel: 'Auto',
};

function ChangeBadge({ value, compact }) {
  if (value === 0 || value == null) {
    return <span className="sales-dash-change neutral">{compact ? '—' : 'No change'}</span>;
  }
  const positive = value > 0;
  return (
    <span className={`sales-dash-change ${positive ? 'up' : 'down'}`}>
      {positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
      {!compact && ' vs prior period'}
    </span>
  );
}

function SnapshotTile({ label, value, sub, highlight }) {
  return (
    <div className={`sales-dash-snapshot-tile${highlight ? ' highlight' : ''}`}>
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

function RevenueByChannelSection({ channelBreakdown, periodLabel, formatAed }) {
  if (!channelBreakdown.length) {
    return (
      <div className="sales-dash-card sales-dash-section">
        <div className="sales-dash-card-header">
          <div>
            <h2>Revenue per channel</h2>
            {periodLabel && <p>{periodLabel}</p>}
          </div>
        </div>
        <p className="sales-dash-empty" style={{ padding: '1.5rem', border: 'none' }}>
          No channel data for the selected period.
        </p>
      </div>
    );
  }

  const totalRevenue = channelBreakdown.reduce((sum, row) => sum + (row.revenue || 0), 0);

  return (
    <div className="sales-dash-card sales-dash-section sales-dash-channel-revenue-section">
      <div className="sales-dash-card-header">
        <div>
          <h2>Revenue per channel</h2>
          {periodLabel && <p>{periodLabel}</p>}
        </div>
      </div>
      <div className="sales-dash-channel-revenue-body">
        <div className="sales-dash-channel-chart-wrap">
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={channelBreakdown}
                dataKey="revenue"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={105}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
              >
                {channelBreakdown.map((entry, index) => (
                  <Cell
                    key={entry.name}
                    fill={CHANNEL_PIE_COLORS[index % CHANNEL_PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatAed(value), 'Revenue']}
                contentStyle={{ border: '1px solid #d5d9d9', borderRadius: 4, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="sales-dash-channel-table-wrap">
          <table className="sales-dash-channel-revenue-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Orders</th>
                <th>Revenue</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {channelBreakdown.map((row) => {
                const sharePct = totalRevenue ? (row.revenue / totalRevenue) * 100 : 0;
                return (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.orders.toLocaleString()}</td>
                    <td className="sales-dash-channel-revenue-amount">{formatAed(row.revenue)}</td>
                    <td>{sharePct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{channelBreakdown.reduce((sum, row) => sum + row.orders, 0).toLocaleString()}</td>
                <td className="sales-dash-channel-revenue-amount">{formatAed(totalRevenue)}</td>
                <td>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
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
  const [recordsLimit, setRecordsLimit] = useState(25);
  const [recordsPagination, setRecordsPagination] = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    const payload = response.data || {};
    return {
      ...emptyDashboard,
      ...payload,
      overview: {
        ...emptyDashboard.overview,
        ...(payload.overview || {}),
        days: payload.overview?.days || emptyDashboard.overview.days,
        past3Weeks: payload.overview?.past3Weeks || emptyDashboard.overview.past3Weeks,
        past3Months: payload.overview?.past3Months || emptyDashboard.overview.past3Months,
        thisYear: payload.overview?.thisYear || emptyDashboard.overview.thisYear,
      },
    };
  }, [appliedFilters]);

  const fetchSalesRecords = useCallback(async (currentRange, page, limit) => {
    const recordParams = buildRecordParams(appliedFilters, currentRange, page, limit);
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
    if (appliedFilters.period === 'custom' && !isValidCustomRange(appliedFilters.customStart, appliedFilters.customEnd)) {
      return;
    }

    try {
      setLoading(true);
      setRecordsLoading(true);
      const dashboardData = await fetchDashboardData();
      setData(dashboardData);

      const { rows, pagination } = await fetchSalesRecords(dashboardData.currentRange, recordsPage, recordsLimit);
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
  }, [appliedFilters, recordsPage, recordsLimit, fetchDashboardData, fetchSalesRecords]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const applyFilters = (next) => {
    if (next.period === 'custom' && !isValidCustomRange(next.customStart, next.customEnd)) {
      alert('Select a start date. If end date is omitted, only that day is shown. Start must be on or before end date.');
      return;
    }
    setRecordsPage(1);
    setFilters(next);
    setAppliedFilters(next);
  };

  const handleApplyFilters = () => {
    applyFilters({ ...filters });
  };

  const handleRecordsItemsPerPageChange = (limit) => {
    setRecordsLimit(limit);
    setRecordsPage(1);
  };

  const handlePeriodChange = (nextPeriod) => {
    const next = {
      ...filters,
      period: nextPeriod,
      customStart: nextPeriod === 'custom' ? filters.customStart : '',
      customEnd: nextPeriod === 'custom' ? filters.customEnd : '',
    };
    setFilters(next);
    if (nextPeriod !== 'custom' || isValidCustomRange(next.customStart, next.customEnd)) {
      setRecordsPage(1);
      setAppliedFilters(next);
    }
  };

  const handleOverviewTileClick = (tile, period = 'custom') => {
    if (period === 'allTime') {
      handlePeriodChange('allTime');
      return;
    }
    if (!tile?.start) return;
    const next = {
      ...filters,
      period: 'custom',
      customStart: tile.start,
      customEnd: tile.end || tile.start,
    };
    setFilters(next);
    setRecordsPage(1);
    setAppliedFilters(next);
  };

  const isOverviewTileActive = (tile, period = 'custom') => {
    if (period === 'allTime') {
      return appliedFilters.period === 'allTime';
    }
    if (appliedFilters.period !== 'custom' || !tile?.start) return false;
    const range = resolveCustomDates(appliedFilters.customStart, appliedFilters.customEnd);
    return range?.startDate === tile.start && range?.endDate === (tile.end || tile.start);
  };

  const renderOverviewTile = (tile, period = 'custom') => {
    const safeTile = {
      ...emptyOverviewTile('overview', '—'),
      ...(tile || {}),
    };
    const isActive = isOverviewTileActive(safeTile, period);
    return (
      <div
        key={safeTile.key}
        role="button"
        tabIndex={0}
        className={`sales-dash-quick-stat${isActive ? ' active' : ''}`}
        onClick={() => handleOverviewTileClick(safeTile, period)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOverviewTileClick(safeTile, period);
          }
        }}
      >
        <div className="sales-dash-quick-stat-label">{safeTile.label}</div>
        <div className="sales-dash-quick-stat-value">
          {loading ? '—' : formatAed(safeTile.totalRevenue)}
        </div>
        <div className="sales-dash-quick-stat-sub">
          {loading
            ? 'Loading…'
            : `${safeTile.totalSales || 0} orders · ${safeTile.totalItemsSold || 0} units`}
        </div>
      </div>
    );
  };

  const handleCustomDateChange = (field, value) => {
    const next = { ...filters, [field]: value };
    setFilters(next);
    if (next.period === 'custom' && isValidCustomRange(next.customStart, next.customEnd)) {
      setRecordsPage(1);
      setAppliedFilters(next);
    }
  };

  const downloadBlob = (blobData, filename) => {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (appliedFilters.period === 'custom' && !isValidCustomRange(appliedFilters.customStart, appliedFilters.customEnd)) {
      alert('Select a start date before exporting.');
      return;
    }

    try {
      setExporting(true);
      const params = buildDashboardParams(appliedFilters);
      const response = await reportsAPI.exportSalesDashboard(params);
      const rangeLabel = data.currentRange?.start && data.currentRange?.end
        ? `${data.currentRange.start}_${data.currentRange.end}`
        : new Date().toISOString().slice(0, 10);
      downloadBlob(response.data, `sales_dashboard_${rangeLabel}.xlsx`);
    } catch (error) {
      console.error('Error exporting sales dashboard:', error);
      alert(error.response?.data?.error || 'Failed to export report');
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

  const channelPeriodLabel = isAllTimeView
    ? 'All-time ordered product sales by channel'
    : `${currentLegendLabel} — ordered product sales by channel`;

  return (
    <div className="sales-dashboard">
      <header className="sales-dash-topbar">
        <div>
          <h1>Sales Dashboard</h1>
          <div className="sales-dash-topbar-meta">
            {isAllTimeView
              ? 'This year performance'
              : `${data.periodLabel || 'Sales'} · ${formatRangeSpan(data.currentRange?.start, data.currentRange?.end)}`}
          </div>
        </div>
        <div className="sales-dash-topbar-actions">
          <button
            type="button"
            className="sales-dash-btn-export"
            onClick={handleExport}
            disabled={loading || exporting}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <button type="button" className="sales-dash-btn-refresh" onClick={loadDashboard} disabled={loading}>
            Refresh data
          </button>
        </div>
      </header>

      <div className="sales-dash-body">
        <div className="sales-dash-overview-sections">
          <section className="sales-dash-overview-group">
            <h2 className="sales-dash-overview-title">Last 3 days</h2>
            <div className="sales-dash-quick-stats cols-3">
              {(overview.days || []).map((tile) => renderOverviewTile(tile))}
            </div>
          </section>
          <section className="sales-dash-overview-group">
            <div className="sales-dash-quick-stats cols-3">
              {renderOverviewTile(overview.past3Weeks)}
              {renderOverviewTile(overview.past3Months)}
              {renderOverviewTile(overview.thisYear, 'allTime')}
            </div>
          </section>
        </div>

        <section className="sales-dash-filters">
          <div className="sales-dash-period-toggle">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={appliedFilters.period === opt.id ? 'active' : ''}
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
                  <span>Start date</span>
                  <input
                    type="date"
                    value={filters.customStart}
                    max={filters.customEnd || undefined}
                    onChange={(e) => handleCustomDateChange('customStart', e.target.value)}
                  />
                </label>
                <label className="sales-dash-filter-field">
                  <span>End date</span>
                  <input
                    type="date"
                    value={filters.customEnd}
                    min={filters.customStart || undefined}
                    onChange={(e) => handleCustomDateChange('customEnd', e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="sales-dash-filter-field">
              <span>Marketplace / Channel</span>
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
              <span>Chart grouping</span>
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
                Apply filters
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="sales-dash-loading">Loading sales data…</div>
        ) : (
          <>
            <div className="sales-dash-card sales-dash-section">
              <div className="sales-dash-card-header">
                <div>
                  <h2>Sales snapshot</h2>
                  <p className="sales-dash-range-hint">
                    <span className="sales-dash-range-chip current">{currentLegendLabel}</span>
                    vs
                    <span className="sales-dash-range-chip previous">{previousLegendLabel}</span>
                  </p>
                </div>
              </div>
              <div className="sales-dash-snapshot">
                <SnapshotTile
                  label="Ordered product sales"
                  value={formatAed(currentPeriod.totalRevenue)}
                  sub={`${previousLegendLabel}: ${formatAed(previousPeriod.totalRevenue)}`}
                  highlight
                />
                <SnapshotTile
                  label="Total orders"
                  value={currentPeriod.totalSales.toLocaleString()}
                  sub={`${previousLegendLabel}: ${previousPeriod.totalSales}`}
                />
                <SnapshotTile
                  label="Units ordered"
                  value={currentPeriod.totalItemsSold.toLocaleString()}
                  sub={`${previousLegendLabel}: ${previousPeriod.totalItemsSold}`}
                />
                <SnapshotTile
                  label="Avg sales per order"
                  value={formatAed(currentPeriod.averageOrderValue)}
                  sub={`${previousLegendLabel}: ${formatAed(previousPeriod.averageOrderValue)}`}
                />
              </div>
              <div className="sales-dash-card-body sales-dash-change-row">
                <ChangeBadge value={change.totalRevenue} />
                <ChangeBadge value={change.totalSales} />
                <ChangeBadge value={change.totalItemsSold} />
                <ChangeBadge value={change.averageOrderValue} />
              </div>
            </div>

            {!isAllTimeView && (
              <div className="sales-dash-card">
                <div className="sales-dash-card-header">
                  <div>
                    <h2>Sales trend</h2>
                    <p>
                      {currentLegendLabel} vs {previousLegendLabel}
                      {data.chartTimelineLabel && ` · ${data.chartTimelineLabel}`}
                    </p>
                  </div>
                  <div className="sales-dash-chart-legend-row">
                    <span className="sales-dash-range-chip current">{currentLegendLabel}</span>
                    <span className="sales-dash-range-chip previous">{previousLegendLabel}</span>
                  </div>
                </div>
                {comparisonChart.length === 0 ? (
                  <div className="sales-dash-empty">No sales data for the selected period.</div>
                ) : (
                  <div className="sales-dash-chart-card">
                    <h3>Ordered product sales (AED)</h3>
                    <ResponsiveContainer width="100%" height={COMPARISON_CHART_HEIGHT}>
                      <BarChart data={comparisonChart} barGap={2} barCategoryGap="12%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e7e7" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#565959' }} interval={0} angle={-25} textAnchor="end" height={55} />
                        <YAxis tick={{ fontSize: 11, fill: '#565959' }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={45} />
                        <Tooltip
                          formatter={chartTooltipFormatter}
                          contentStyle={{ border: '1px solid #d5d9d9', borderRadius: 4, fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="currentRevenue" fill={AMAZON_CHART_CURRENT} name={currentRevenueLegend} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="previousRevenue" fill={AMAZON_CHART_PREVIOUS} name={previousRevenueLegend} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <h3 className="chart-subtitle">Order count</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={comparisonChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e7e7" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#565959' }} interval={0} angle={-25} textAnchor="end" height={55} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#565959' }} width={35} />
                        <Tooltip contentStyle={{ border: '1px solid #d5d9d9', borderRadius: 4, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="currentOrders" stroke={AMAZON_CHART_CURRENT} strokeWidth={2} name={currentOrdersLegend} dot={{ r: 2, fill: AMAZON_CHART_CURRENT }} />
                        <Line type="monotone" dataKey="previousOrders" stroke={AMAZON_CHART_PREVIOUS} strokeWidth={2} name={previousOrdersLegend} dot={{ r: 2, fill: AMAZON_CHART_PREVIOUS }} strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            <RevenueByChannelSection
              channelBreakdown={channelBreakdown}
              periodLabel={channelPeriodLabel}
              formatAed={formatAed}
            />

            <div className="sales-dash-card sales-dash-section">
              <div className="sales-dash-card-header">
                <div>
                  <h2>Recent orders</h2>
                  <p>
                    {isAllTimeView
                      ? 'All orders — click a row for details'
                      : `Orders in ${formatRangeSpan(data.currentRange?.start, data.currentRange?.end) || 'selected period'}`}
                  </p>
                </div>
              </div>
              {recordsLoading ? (
                <div className="sales-dash-empty">Loading orders…</div>
              ) : records.length === 0 ? (
                <div className="sales-dash-empty">No orders for the selected filters.</div>
              ) : (
                <>
                  <div className="sales-dash-records-wrap">
                    <table className="sales-dash-records-table">
                      <thead>
                        <tr>
                          <th>Amazon order ID</th>
                          <th>Product SKU</th>
                          <th>Date</th>
                          <th>Channel</th>
                          <th>Items</th>
                          <th>Order total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((sale) => (
                          <tr
                            key={sale._id}
                            className="sales-dash-record-row"
                            onClick={() => openSaleDetail(sale)}
                          >
                            <td className="mono">{sale.amazonOrderId || '—'}</td>
                            <td className="mono">{getSaleProductSkus(sale)}</td>
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
                    <div className="sales-dash-card-body sales-dash-pagination-wrap">
                      <Pagination
                        currentPage={recordsPagination.page}
                        totalPages={recordsPagination.totalPages}
                        totalItems={recordsPagination.total}
                        itemsPerPage={recordsPagination.limit}
                        onPageChange={setRecordsPage}
                        onItemsPerPageChange={handleRecordsItemsPerPageChange}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

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
