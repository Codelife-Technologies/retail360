import React, { useEffect, useState } from 'react';
import { employeeDashboardAPI } from '../services/employeeDashboardApi';
import { employeeName } from '../../hr/utils/hrUtils';

function EmployeeContextGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState(null);

  useEffect(() => {
    employeeDashboardAPI
      .getContext()
      .then((res) => setContext(res.data))
      .catch(() => setContext({ linked: false, employee: null }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="ed-loading">Loading employee profile...</div>;
  }

  if (!context?.linked) {
    return (
      <div className="ed-unlinked">
        <h2>Employee profile not linked</h2>
        <p>
          Your login email must match an employee record in HR → Employee Master.
          Ask HR to add or update your employee profile with the same email as your user account.
        </p>
      </div>
    );
  }

  return children(context);
}

export function EmployeeWelcome({ employee }) {
  if (!employee) return null;
  return (
    <div className="ed-welcome">
      <div>
        <h1>Welcome, {employeeName(employee)}</h1>
        <p className="ed-welcome-meta">
          {employee.employeeId} · {employee.department} · {employee.designation}
        </p>
      </div>
    </div>
  );
}

export default EmployeeContextGate;
