import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { employeeDashboardAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrKpiCard from '../../hr/components/HrKpiCard';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import { formatDate, formatCurrency } from '../../hr/utils/hrUtils';
import { formatLeaveRemaining } from '../../hr/utils/leavePolicies';
import { formatTime12Hour } from '../../hr/utils/attendanceUtils';

function attendanceKpiVariant(status) {
  if (!status || status === 'Not marked') return 'warning';
  if (status === 'Present' || status === 'Work From Home') return 'success';
  if (status === 'Absent') return 'danger';
  return 'info';
}

function EmployeeHome() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = () => {
    setLoading(true);
    employeeDashboardAPI
      .getDashboard()
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const summary = data?.attendanceSummary || { present: 0, absent: 0, late: 0, leave: 0, holidays: 0 };

  const leaveBarData = (data?.leaveBalances || []).slice(0, 6).map((bal) => ({
    name: bal.label || bal.leaveType,
    remaining: bal.unlimited ? (bal.used || 0) : Math.max(0, bal.remaining ?? 0),
  }));

  const todayStatus = data?.todayAttendance?.status || 'Not marked';

  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page ed-home">
          <EmployeeWelcome
            employee={context.employee}
            actions={
              <button type="button" className="hr-btn hr-btn-secondary" onClick={loadDashboard}>
                Refresh
              </button>
            }
          />

          {loading ? (
            <div className="ed-loading">Loading dashboard...</div>
          ) : (
            <>
              <div className="hr-kpi-grid">
                <HrKpiCard
                  icon="📋"
                  label="Today's Attendance"
                  value={todayStatus}
                  variant={attendanceKpiVariant(todayStatus)}
                />
                <HrKpiCard
                  icon="✅"
                  label="Tasks Today"
                  value={data?.tasksToday?.length || 0}
                  variant="info"
                />
                <HrKpiCard
                  icon="💰"
                  label="Latest Salary"
                  value={
                    data?.latestPayroll ? formatCurrency(data.latestPayroll.netSalary) : '—'
                  }
                  variant="success"
                />
                <HrKpiCard
                  icon="📅"
                  label="Present This Month"
                  value={summary.present || 0}
                  variant="success"
                />
              </div>

              {(data?.todayAttendance?.checkIn || data?.latestPayroll) && (
                <div className="ed-home-meta-strip">
                  {data?.todayAttendance?.checkIn && (
                    <span>
                      Check-in: {formatTime12Hour(data.todayAttendance.checkIn)}
                      {data.todayAttendance.checkOut
                        ? ` · Check-out: ${formatTime12Hour(data.todayAttendance.checkOut)}`
                        : ''}
                    </span>
                  )}
                  {data?.latestPayroll && (
                    <span>
                      Last payslip:{' '}
                      {new Date(data.latestPayroll.year, data.latestPayroll.month - 1).toLocaleString(
                        'en-IN',
                        { month: 'short', year: 'numeric' }
                      )}{' '}
                      · {data.latestPayroll.paymentStatus}
                    </span>
                  )}
                </div>
              )}

              <div className="hr-chart-grid hr-chart-grid-2">
                <div className="hr-chart-card">
                  <h3>Tasks Due Today</h3>
                  {data?.tasksToday?.length ? (
                    <ul className="hr-mini-list ed-task-mini-list">
                      {data.tasksToday.map((task) => (
                        <li key={task._id} className={`ed-task-mini priority-${task.priority?.toLowerCase()}`}>
                          <span>
                            <strong>{task.title}</strong>
                            {task.description && (
                              <small>{task.description}</small>
                            )}
                          </span>
                          <span className="ed-task-mini-badge">{task.priority}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ed-empty-chart">No tasks due today.</p>
                  )}
                </div>

                <div className="hr-chart-card">
                  <h3>Leave Balance</h3>
                  {leaveBarData.length === 0 ? (
                    <p className="ed-empty-chart">No leave balance data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={leaveBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="remaining" fill="#ff8c00" name="Days remaining" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="hr-dashboard-bottom">
                <div className="hr-side-cards">
                  <div className="hr-panel-card">
                    <h3>Leave Balances</h3>
                    {data?.leaveBalances?.length ? (
                      <ul className="hr-mini-list">
                        {data.leaveBalances.slice(0, 5).map((bal) => (
                          <li key={bal.leaveType}>
                            <span>{bal.label}</span>
                            <span>{bal.unlimited ? 'Unlimited' : formatLeaveRemaining(bal)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ed-empty-chart">No leave balance data.</p>
                    )}
                  </div>

                  <div className="hr-panel-card ed-panel-accent">
                    <h3>Month at a Glance</h3>
                    <ul className="hr-mini-list ed-glance-list">
                      <li>
                        <span>Present</span>
                        <span className="ed-glance-success">{summary.present || 0}</span>
                      </li>
                      <li>
                        <span>Absent</span>
                        <span className="ed-glance-danger">{summary.absent || 0}</span>
                      </li>
                      <li>
                        <span>Half Day</span>
                        <span className="ed-glance-warning">{summary.late || 0}</span>
                      </li>
                      <li>
                        <span>On Leave</span>
                        <span className="ed-glance-info">{summary.leave || 0}</span>
                      </li>
                      <li>
                        <span>Holidays</span>
                        <span className="ed-glance-holiday">{summary.holidays || 0}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="hr-panel-card ed-leaves-table-panel">
                <h3>Recent Leave Applications</h3>
                {data?.recentLeaves?.length ? (
                  <div className="ed-table-card ed-table-card-flush">
                    <table className="ed-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Days</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentLeaves.map((leave) => (
                          <tr key={leave._id}>
                            <td>{leave.leaveType}</td>
                            <td>{formatDate(leave.fromDate)}</td>
                            <td>{formatDate(leave.toDate)}</td>
                            <td>{leave.days}</td>
                            <td>
                              <HrStatusBadge status={leave.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ed-empty-chart">No leave applications yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeHome;
