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
import { reportsAPI, salesChannelsAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
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
    default:
      return isPrevious ? `Previous (${span})` : `Current (${span})`;
  }
}

const PERIOD_OPTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'month', label: 'Month' },
  { id: 'custom', label: 'Custom' },
];

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
  const [period, setPeriod] = useState('month');
  const [chartTimeline, setChartTimeline] = useState('auto');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [salesChannel, setSalesChannel] = useState('');
  const [channels, setChannels] = useState([]);
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    salesChannelsAPI.getAll({ isActive: 'true' }).then((res) => {
      setChannels(res.data || []);
    }).catch(() => setChannels([]));
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        period,
        chartTimeline,
        salesChannel: salesChannel || undefined,
      };
      if (period === 'custom') {
        if (customStart) params.startDate = customStart;
        if (customEnd) params.endDate = customEnd;
      }
      const response = await reportsAPI.getSalesDashboard(params);
      setData({ ...emptyDashboard, ...response.data });
    } catch (error) {
      console.error('Error fetching sales dashboard:', error);
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  }, [period, chartTimeline, customStart, customEnd, salesChannel]);

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return;
    fetchDashboard();
  }, [fetchDashboard, period, customStart, customEnd]);

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const { overview, currentPeriod, previousPeriod, change, comparisonChart, channelBreakdown } = data;

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
        <button type="button" className="sales-dash-btn-refresh" onClick={fetchDashboard} disabled={loading}>
          Refresh
        </button>
      </header>

      <section className="sales-dash-filters">
        <div className="sales-dash-period-toggle">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={period === opt.id ? 'active' : ''}
              onClick={() => handlePeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="sales-dash-filter-row">
          {period === 'custom' && (
            <>
              <label className="sales-dash-filter-field">
                <span>From</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className="sales-dash-filter-field">
                <span>To</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="sales-dash-filter-field">
            <span>Channel</span>
            <select value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)}>
              <option value="">All channels</option>
              {channels.map((ch) => (
                <option key={ch._id} value={ch._id}>{ch.name}</option>
              ))}
            </select>
          </label>
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
            <h2>{data.periodLabel || 'Selected Period'}</h2>
            <p className="sales-dash-range-hint">
              <span className="sales-dash-range-chip current">{currentLegendLabel}</span>
              {' vs '}
              <span className="sales-dash-range-chip previous">{previousLegendLabel}</span>
            </p>
            <div className="sales-dash-kpi-grid period-compare">
              <KpiCard
                label="Revenue"
                value={formatAed(currentPeriod.totalRevenue)}
                subValue={`${previousLegendLabel}: ${formatAed(previousPeriod.totalRevenue)}`}
                change={change.totalRevenue}
              />
              <KpiCard
                label="Orders"
                value={currentPeriod.totalSales}
                subValue={`${previousLegendLabel}: ${previousPeriod.totalSales}`}
                change={change.totalSales}
              />
              <KpiCard
                label="Units Sold"
                value={currentPeriod.totalItemsSold}
                subValue={`${previousLegendLabel}: ${previousPeriod.totalItemsSold}`}
                change={change.totalItemsSold}
              />
              <KpiCard
                label="Avg Order Value"
                value={formatAed(currentPeriod.averageOrderValue)}
                subValue={`${previousLegendLabel}: ${formatAed(previousPeriod.averageOrderValue)}`}
                change={change.averageOrderValue}
              />
            </div>
          </section>

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
              <label className="sales-dash-filter-field sales-dash-chart-timeline">
                <span>Comparison timeline</span>
                <select
                  value={chartTimeline}
                  onChange={(e) => setChartTimeline(e.target.value)}
                >
                  {CHART_TIMELINE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </label>
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
    </div>
  );
}

export default SalesDashboard;
