import React from 'react';
import {
  BarChart,
  Bar,
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
import './SalesMonthlyTrendCharts.css';

const PIE_COLORS = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];

function formatMonthLabel(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || '—';
  const [year, month] = key.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function toChartData(groupedData = []) {
  return [...groupedData]
    .sort((a, b) => String(a.group).localeCompare(String(b.group)))
    .map((row) => ({
      label: formatMonthLabel(row.group),
      month: row.group,
      revenue: Math.round((row.revenue || 0) * 100) / 100,
      quantity: row.itemsSold || 0,
      orders: row.count || 0,
    }));
}

function SalesMonthlyTrendCharts({ groupedData, formatCurrency }) {
  const chartData = toChartData(groupedData);

  if (chartData.length === 0) {
    return (
      <div className="sales-trend-charts sales-trend-empty">
        <p>No monthly sales data for the selected period.</p>
      </div>
    );
  }

  const formatValue = (value) => formatCurrency(value);
  const totalRevenue = chartData.reduce((sum, row) => sum + row.revenue, 0);
  const totalQuantity = chartData.reduce((sum, row) => sum + row.quantity, 0);

  const tooltipFormatter = (value, name) => {
    if (name === 'Revenue') return [formatValue(value), 'Revenue'];
    if (name === 'Quantity Sold') return [value, 'Quantity Sold'];
    return [value, name];
  };

  return (
    <div className="sales-trend-charts">
      <h3>Monthly Sales Trend</h3>
      <p className="sales-trend-totals">
        Total revenue: <strong>{formatValue(totalRevenue)}</strong>
        {' · '}
        Total quantity sold: <strong>{totalQuantity.toLocaleString()}</strong>
      </p>
      <div className="sales-trend-chart-grid">
        <div className="sales-trend-chart-card">
          <h4>Revenue &amp; Quantity Sold by Month</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 15 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis
                yAxisId="revenue"
                orientation="left"
                tick={{ fontSize: 15 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="quantity"
                orientation="right"
                allowDecimals={false}
                tick={{ fontSize: 15 }}
              />
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
              <Bar yAxisId="revenue" dataKey="revenue" fill="#667eea" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="quantity" dataKey="quantity" fill="#10b981" name="Quantity Sold" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="sales-trend-chart-card">
          <h4>Quantity Sold by Month</h4>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="quantity"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={95}
                label={({ label, value, percent }) => `${label}: ${value} (${(percent * 100).toFixed(0)}%)`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.month} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} units`, 'Quantity Sold']} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default SalesMonthlyTrendCharts;
