import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  productsAPI,
  purchaseOrdersAPI,
  purchasesAPI,
  stockAPI,
  shipmentsAPI,
  salesAPI,
  reportsAPI,
} from '../services/api';
import { hrDashboardAPI } from '../hr/services/hrApi';
import HrKpiCard from '../hr/components/HrKpiCard';
import HrEmployeeAvatar from '../hr/components/HrEmployeeAvatar';
import { employeeName } from '../hr/utils/hrUtils';
import '../hr/styles/hrShared.css';
import './Dashboard.css';

const PIE_COLORS = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
const TREND_WINDOW_DAYS = 30;

function extractList(response) {
  if (!response?.data) return [];
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildDailyTrend(items, dateField, days = TREND_WINDOW_DAYS) {
  const buckets = new Map();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      date: key,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
    });
  }

  items.forEach((item) => {
    const raw = item[dateField];
    if (!raw) return;
    const key = new Date(raw).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.get(key).count += 1;
    }
  });

  return Array.from(buckets.values());
}

function mergeActivityTrend(salesTrend, purchaseTrend) {
  const byLabel = new Map();

  salesTrend.forEach((row) => {
    byLabel.set(row.label, { label: row.label, sales: row.count, purchases: 0 });
  });

  purchaseTrend.forEach((row) => {
    const existing = byLabel.get(row.label) || { label: row.label, sales: 0, purchases: 0 };
    existing.purchases = row.count;
    byLabel.set(row.label, existing);
  });

  return Array.from(byLabel.values());
}

function ClickableKpi({ tab, onNavigate, ...props }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="dashboard-kpi-clickable"
      onClick={() => onNavigate(tab)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(tab);
        }
      }}
      title={`Go to ${props.label}`}
    >
      <HrKpiCard {...props} />
    </div>
  );
}

function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    pendingPOs: 0,
    totalPurchases: 0,
    totalShipments: 0,
    totalSales: 0,
    pendingSales: 0,
  });
  const [activityTrend, setActivityTrend] = useState([]);
  const [channelBreakdown, setChannelBreakdown] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentPendingPOs, setRecentPendingPOs] = useState([]);
  const [newEmployees, setNewEmployees] = useState([]);
  const [birthdayReminders, setBirthdayReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setLoadError('');

      const [
        productsResult,
        poResult,
        purchasesResult,
        lowStockResult,
        shipmentsResult,
        salesResult,
        pendingSalesResult,
        salesDashboardResult,
        hrDashboardResult,
      ] = await Promise.allSettled([
        productsAPI.getCount(),
        purchaseOrdersAPI.getAll({ status: 'pending' }),
        purchasesAPI.getAll(),
        stockAPI.getLowStock(),
        shipmentsAPI.getAll(),
        salesAPI.getAll(),
        salesAPI.getAll({ orderStatus: 'pending' }),
        reportsAPI.getSalesDashboard({ period: 'month', chartTimeline: 'day' }),
        hrDashboardAPI.getStats(),
      ]);

      const productsRes = productsResult.status === 'fulfilled' ? productsResult.value : null;
      const lowStockRes = lowStockResult.status === 'fulfilled' ? lowStockResult.value : null;
      const salesDashboard =
        salesDashboardResult.status === 'fulfilled' ? salesDashboardResult.value.data || {} : {};
      const hrDashboard =
        hrDashboardResult.status === 'fulfilled' ? hrDashboardResult.value.data || {} : {};

      let productCount = 0;
      if (productsRes?.data?.count != null) {
        productCount = productsRes.data.count;
      } else if (productsRes) {
        productCount = extractList(productsRes).length;
      }

      const lowStock = extractList(lowStockRes);
      const pendingPOs = extractList(poResult.status === 'fulfilled' ? poResult.value : null);
      const purchases = extractList(purchasesResult.status === 'fulfilled' ? purchasesResult.value : null);
      const shipments = extractList(shipmentsResult.status === 'fulfilled' ? shipmentsResult.value : null);
      const sales = extractList(salesResult.status === 'fulfilled' ? salesResult.value : null);
      const pendingSales = extractList(
        pendingSalesResult.status === 'fulfilled' ? pendingSalesResult.value : null
      );

      const salesTrend = buildDailyTrend(sales, 'salesDate');
      const purchaseTrend = buildDailyTrend(purchases, 'purchaseDate');
      const channelPie = (salesDashboard.channelBreakdown || [])
        .filter((row) => row.orders > 0)
        .map((row) => ({
          name: row.name,
          value: row.orders,
        }));

      setStats({
        totalProducts: productCount,
        lowStockCount: lowStock.length,
        pendingPOs: pendingPOs.length,
        totalPurchases: purchases.length,
        totalShipments: shipments.length,
        totalSales: sales.length,
        pendingSales: pendingSales.length,
      });

      setActivityTrend(mergeActivityTrend(salesTrend, purchaseTrend));
      setChannelBreakdown(channelPie);
      setLowStockItems(lowStock.slice(0, 8));
      setRecentPendingPOs(pendingPOs.slice(0, 8));
      setNewEmployees(Array.isArray(hrDashboard.newEmployees) ? hrDashboard.newEmployees : []);
      setBirthdayReminders(
        Array.isArray(hrDashboard.birthdayReminders) ? hrDashboard.birthdayReminders : []
      );
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoadError(error.response?.data?.error || 'Failed to load dashboard');
      setStats({
        totalProducts: 0,
        lowStockCount: 0,
        pendingPOs: 0,
        totalPurchases: 0,
        totalShipments: 0,
        totalSales: 0,
        pendingSales: 0,
      });
      setActivityTrend([]);
      setChannelBreakdown([]);
      setLowStockItems([]);
      setRecentPendingPOs([]);
      setNewEmployees([]);
      setBirthdayReminders([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (tab) => {
    if (onNavigate) onNavigate(tab);
  };

  if (loading) {
    return <div className="hr-page dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="hr-page dashboard">
      <header className="hr-page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="hr-page-subtitle">
            Inventory, procurement, and sales overview with trends
          </p>
        </div>
        <button type="button" className="hr-btn hr-btn-secondary" onClick={fetchDashboardData}>
          Refresh
        </button>
      </header>

      {loadError && (
        <div className="dashboard-error-banner" role="alert">
          {loadError}
        </div>
      )}

      <div className="hr-kpi-grid">
        <ClickableKpi
          tab="master:products"
          icon="📦"
          label="Total Products"
          value={stats.totalProducts}
          variant="info"
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="master:stock"
          icon="⚠️"
          label="Out of Stock"
          value={stats.lowStockCount}
          variant="warning"
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="purchase-orders"
          icon="📋"
          label="Pending POs"
          value={stats.pendingPOs}
          variant="info"
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="purchases"
          icon="💰"
          label="Total Purchases"
          value={stats.totalPurchases}
          variant="success"
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="shipments"
          icon="🚚"
          label="Total Shipments"
          value={stats.totalShipments}
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="mis"
          icon="🛒"
          label="Total Sales"
          value={stats.totalSales}
          variant="success"
          onNavigate={handleNavigate}
        />
        <ClickableKpi
          tab="mis"
          icon="⏳"
          label="Pending Sales"
          value={stats.pendingSales}
          variant="warning"
          onNavigate={handleNavigate}
        />
      </div>

      <div className="hr-chart-grid hr-chart-grid-2">
        <div className="hr-chart-card">
          <h3>Sales &amp; Purchases Trend (1 month)</h3>
          {activityTrend.length === 0 ? (
            <p className="dashboard-empty">No activity data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={activityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#667eea"
                  strokeWidth={2}
                  name="Sales"
                />
                <Line
                  type="monotone"
                  dataKey="purchases"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Purchases"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="hr-chart-card">
          <h3>Sales by Channel (This Month)</h3>
          {channelBreakdown.length === 0 ? (
            <p className="dashboard-empty">No sales channel data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={channelBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ name, percent = 0 }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {channelBreakdown.map((entry, index) => (
                    <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="hr-dashboard-bottom">
        <div className="hr-panel-card">
          <h3>Pending Purchase Orders</h3>
          <div className="dashboard-table-card">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPendingPOs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dashboard-empty">
                      No pending purchase orders
                    </td>
                  </tr>
                ) : (
                  recentPendingPOs.map((po) => (
                    <tr key={po._id}>
                      <td className="mono">{po.poNumber || '—'}</td>
                      <td>{po.supplier?.name || po.supplierName || '—'}</td>
                      <td>{formatDate(po.orderDate)}</td>
                      <td>
                        <span className={`dash-status status-${po.status || 'pending'}`}>
                          {po.status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hr-side-cards">
          <div className="hr-panel-card">
            <h3>Out of Stock Alerts</h3>
            <ul className="hr-mini-list">
              {lowStockItems.length === 0 ? (
                <li>No out of stock alerts</li>
              ) : (
                lowStockItems.map((stockItem) => (
                  <li key={stockItem._id}>
                    <span>
                      {stockItem.product?.title || stockItem.product?.name || 'Unknown'} —{' '}
                      {stockItem.location?.name || 'Unknown'}
                    </span>
                    <span>Qty: {stockItem.quantity}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="hr-panel-card">
            <h3>New Joinees</h3>
            <ul className="hr-mini-list">
              {newEmployees.length === 0 ? (
                <li>No new joiners in the last 30 days</li>
              ) : (
                newEmployees.map((emp) => (
                  <li key={emp._id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <HrEmployeeAvatar employee={emp} size={32} />
                      {employeeName(emp)}
                    </span>
                    <span>{formatDate(emp.joiningDate)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="hr-panel-card">
            <h3>Upcoming Birthdays</h3>
            <ul className="hr-mini-list">
              {birthdayReminders.length === 0 ? (
                <li>No birthdays in the next 30 days</li>
              ) : (
                birthdayReminders.map((emp) => (
                  <li key={emp._id}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <HrEmployeeAvatar employee={emp} size={32} />
                      {employeeName(emp)}
                    </span>
                    <span>
                      {emp.daysUntil === 0
                        ? 'Today!'
                        : `In ${emp.daysUntil} day${emp.daysUntil > 1 ? 's' : ''}`}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
