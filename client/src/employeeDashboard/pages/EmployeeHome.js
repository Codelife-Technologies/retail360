import React, { useEffect, useState } from 'react';
import { employeeDashboardAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import { formatDate, formatCurrency } from '../../hr/utils/hrUtils';
import { formatLeaveRemaining } from '../../hr/utils/leavePolicies';

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

  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="ed-page">
          <EmployeeWelcome employee={context.employee} />

          {loading ? (
            <div className="ed-loading">Loading dashboard...</div>
          ) : (
            <>
              <div className="ed-summary-grid">
                <div className="ed-card">
                  <span className="ed-card-label">Today&apos;s Attendance</span>
                  <strong className="ed-card-value">
                    {data?.todayAttendance?.status || 'Not marked'}
                  </strong>
                  {data?.todayAttendance?.checkIn && (
                    <p className="ed-card-meta">
                      In: {data.todayAttendance.checkIn}
                      {data.todayAttendance.checkOut ? ` · Out: ${data.todayAttendance.checkOut}` : ''}
                    </p>
                  )}
                </div>

                <div className="ed-card">
                  <span className="ed-card-label">Tasks Today</span>
                  <strong className="ed-card-value">{data?.tasksToday?.length || 0}</strong>
                  <p className="ed-card-meta">Pending tasks due today</p>
                </div>

                <div className="ed-card">
                  <span className="ed-card-label">Latest Salary</span>
                  <strong className="ed-card-value">
                    {data?.latestPayroll
                      ? formatCurrency(data.latestPayroll.netSalary)
                      : '—'}
                  </strong>
                  {data?.latestPayroll && (
                    <p className="ed-card-meta">
                      {new Date(data.latestPayroll.year, data.latestPayroll.month - 1).toLocaleString('en-IN', {
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {data.latestPayroll.paymentStatus}
                    </p>
                  )}
                </div>

                <div className="ed-card">
                  <span className="ed-card-label">This Month</span>
                  <strong className="ed-card-value">{data?.attendanceSummary?.present || 0} present</strong>
                  <p className="ed-card-meta">
                    {data?.attendanceSummary?.absent || 0} absent · {data?.attendanceSummary?.leave || 0} on leave
                  </p>
                </div>
              </div>

              <div className="ed-panels-grid">
                <section className="ed-panel">
                  <h3>Task of the Day</h3>
                  {data?.tasksToday?.length ? (
                    <ul className="ed-task-list">
                      {data.tasksToday.map((task) => (
                        <li key={task._id} className={`ed-task-item priority-${task.priority?.toLowerCase()}`}>
                          <div>
                            <strong>{task.title}</strong>
                            {task.description && <p>{task.description}</p>}
                          </div>
                          <span className="ed-task-priority">{task.priority}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ed-empty">No tasks due today.</p>
                  )}
                </section>

                <section className="ed-panel">
                  <h3>Leave Balances</h3>
                  {data?.leaveBalances?.length ? (
                    <div className="ed-leave-balances">
                      {data.leaveBalances.slice(0, 4).map((bal) => (
                        <div key={bal.leaveType} className="ed-leave-balance">
                          <span>{bal.label}</span>
                          <strong>{bal.unlimited ? 'Unlimited' : formatLeaveRemaining(bal)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ed-empty">No leave balance data.</p>
                  )}
                </section>

                <section className="ed-panel ed-panel-wide">
                  <h3>Recent Leave Applications</h3>
                  {data?.recentLeaves?.length ? (
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
                            <td><HrStatusBadge status={leave.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="ed-empty">No leave applications yet.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeHome;
