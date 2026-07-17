import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
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
import { complianceDashboardAPI } from '../services/complianceApi';
import { formatDate } from '../utils/complianceUtils';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

const emptyDashboard = {
  kpis: {
    totalTasks: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    dueThisWeek: 0,
    dueThisMonth: 0,
  },
  monthlyStatus: [],
  pendingVsCompleted: [],
  upcomingDueDates: [],
  recentActivity: [],
};

function ComplianceDashboard() {
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await complianceDashboardAPI.getStats();
        if (!cancelled) setData({ ...emptyDashboard, ...response.data });
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load dashboard');
          setData(emptyDashboard);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = [
    { label: 'Total Compliance Tasks', value: data.kpis.totalTasks, tone: 'info' },
    { label: 'Completed', value: data.kpis.completed, tone: 'success' },
    { label: 'Pending', value: data.kpis.pending, tone: 'warning' },
    { label: 'Overdue', value: data.kpis.overdue, tone: 'danger' },
    { label: 'Due This Week', value: data.kpis.dueThisWeek, tone: 'warning' },
    { label: 'Due This Month', value: data.kpis.dueThisMonth, tone: 'info' },
  ];

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>Compliance Dashboard</h1>
          <p className="cmp-page-subtitle">Statutory filings and upcoming obligations at a glance.</p>
        </div>
      </div>

      {error ? <div className="cmp-alert">{error}</div> : null}

      <div className="cmp-kpi-grid">
        {loading
          ? Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="cmp-skeleton-card" />)
          : kpis.map((kpi) => (
              <div key={kpi.label} className={`cmp-kpi-card ${kpi.tone}`}>
                <div className="cmp-kpi-body">
                  <h3>{kpi.value}</h3>
                  <p>{kpi.label}</p>
                </div>
              </div>
            ))}
      </div>

      <div className="cmp-charts-grid">
        <div className="cmp-card">
          <h3>Monthly Compliance Status</h3>
          <div className="cmp-chart-wrap">
            {loading ? (
              <div className="cmp-skeleton-chart" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.monthlyStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="pending" fill="#f59e0b" name="Pending" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="overdue" fill="#ef4444" name="Overdue" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="cmp-card">
          <h3>Pending vs Completed</h3>
          <div className="cmp-chart-wrap">
            {loading ? (
              <div className="cmp-skeleton-chart" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.pendingVsCompleted}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {data.pendingVsCompleted.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="cmp-charts-grid">
        <div className="cmp-card cmp-table-card">
          <h3>Upcoming Due Dates</h3>
          {loading ? (
            <div className="cmp-skeleton-list">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="cmp-skeleton-row" />)}</div>
          ) : data.upcomingDueDates.length === 0 ? (
            <div className="cmp-empty"><p>No upcoming due dates.</p></div>
          ) : (
            <div className="cmp-table-wrap">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Title</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcomingDueDates.map((row) => (
                    <tr key={`${row.source}-${row.id}`}>
                      <td>{row.source}</td>
                      <td>{row.title}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td><span className={`cmp-badge status-${String(row.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{row.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="cmp-card cmp-table-card">
          <h3>Recent Compliance Activity</h3>
          {loading ? (
            <div className="cmp-skeleton-list">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="cmp-skeleton-row" />)}</div>
          ) : data.recentActivity.length === 0 ? (
            <div className="cmp-empty"><p>No recent activity.</p></div>
          ) : (
            <div className="cmp-table-wrap">
              <table className="cmp-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((row) => (
                    <tr key={`act-${row.source}-${row.id}`}>
                      <td>{row.source}</td>
                      <td>{row.title}</td>
                      <td>{row.status}</td>
                      <td>{formatDate(row.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ComplianceDashboard;
