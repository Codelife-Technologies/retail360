import React, { useEffect, useState } from 'react';
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
import { hrDashboardAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrStatusBadge from '../components/HrStatusBadge';
import HrEmployeeAvatar from '../components/HrEmployeeAvatar';
import {
  formatCurrency,
  formatDate,
  employeeName,
} from '../utils/hrUtils';
import './HrDashboard.css';

const PIE_COLORS = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

const emptyDashboard = {
  kpis: {
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    employeesOnLeave: 0,
    monthlyPayroll: 0,
    pendingLeaveRequests: 0,
  },
  attendanceTrend: [],
  departmentDistribution: [],
  recentLeaveApplications: [],
  upcomingHolidays: [],
  newEmployees: [],
  birthdayReminders: [],
};

function HrDashboard() {
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await hrDashboardAPI.getStats();
      setData({ ...emptyDashboard, ...response.data });
    } catch (error) {
      console.error('Error fetching HR dashboard:', error);
      setData(emptyDashboard);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="hr-page hr-loading">Loading HR dashboard...</div>;
  }

  const { kpis } = data;

  return (
    <div className="hr-page hr-dashboard">
      <header className="hr-page-header">
        <div>
          <h1>HR Dashboard</h1>
          <p className="hr-page-subtitle">
            Workforce overview, attendance trends, and leave activity
          </p>
        </div>
        <button type="button" className="hr-btn hr-btn-secondary" onClick={fetchDashboard}>
          Refresh
        </button>
      </header>

      <div className="hr-kpi-grid hr-kpi-grid-6">
        <HrKpiCard icon="👥" label="Total Employees" value={kpis.totalEmployees} variant="info" />
        <HrKpiCard icon="✅" label="Present Today" value={kpis.presentToday} variant="success" />
        <HrKpiCard icon="❌" label="Absent Today" value={kpis.absentToday} variant="danger" />
        <HrKpiCard icon="🏖️" label="Employees on Leave" value={kpis.employeesOnLeave} />
        <HrKpiCard
          icon="💰"
          label="Monthly Payroll"
          value={formatCurrency(kpis.monthlyPayroll)}
          variant="info"
        />
        <HrKpiCard
          icon="📋"
          label="Pending Leave Requests"
          value={kpis.pendingLeaveRequests}
          variant="warning"
        />
      </div>

      <div className="hr-chart-grid hr-chart-grid-2">
        <div className="hr-chart-card">
          <h3>Employee Attendance Trend</h3>
          {data.attendanceTrend.length === 0 ? (
            <p className="hr-empty">No attendance data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 13 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} name="Present" />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} name="Absent" />
                <Line type="monotone" dataKey="leave" stroke="#3b82f6" strokeWidth={2} name="Leave" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="hr-chart-card">
          <h3>Department Distribution</h3>
          {data.departmentDistribution.length === 0 ? (
            <p className="hr-empty">No department data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.departmentDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {data.departmentDistribution.map((entry, index) => (
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
          <h3>Recent Leave Applications</h3>
          <div className="hr-table-card" style={{ boxShadow: 'none' }}>
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLeaveApplications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hr-empty">
                      No recent leave applications
                    </td>
                  </tr>
                ) : (
                  data.recentLeaveApplications.map((leave) => (
                    <tr key={leave._id}>
                      <td>{employeeName(leave.employee)}</td>
                      <td>{leave.leaveType}</td>
                      <td>{formatDate(leave.fromDate)}</td>
                      <td>{formatDate(leave.toDate)}</td>
                      <td>
                        <HrStatusBadge status={leave.status} />
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
            <h3>Upcoming Holidays</h3>
            <ul className="hr-mini-list">
              {data.upcomingHolidays.length === 0 ? (
                <li>No upcoming holidays</li>
              ) : (
                data.upcomingHolidays.map((h) => (
                  <li key={h._id}>
                    <span>{h.name}</span>
                    <span>{formatDate(h.date)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="hr-panel-card">
            <h3>New Employees</h3>
            <ul className="hr-mini-list">
              {data.newEmployees.length === 0 ? (
                <li>No new joiners in the last 30 days</li>
              ) : (
                data.newEmployees.map((emp) => (
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
            <h3>Birthday Reminders</h3>
            <ul className="hr-mini-list">
              {data.birthdayReminders.length === 0 ? (
                <li>No birthdays in the next 30 days</li>
              ) : (
                data.birthdayReminders.map((emp) => (
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

export default HrDashboard;
