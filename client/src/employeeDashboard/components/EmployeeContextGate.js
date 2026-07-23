import React, { useEffect, useState } from 'react';
import { employeeDashboardAPI } from '../services/employeeDashboardApi';
import { employeeName } from '../../hr/utils/hrUtils';
import HrEmployeeAvatar from '../../hr/components/HrEmployeeAvatar';

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
          Your login must match an active record in HR → Employee Master (same email, employee ID, or
          username as the employee name). HR staff also need their own employee record to use self-service
          here — ask an admin to sync users from Employee Master or align your email/username.
        </p>
      </div>
    );
  }

  return children(context);
}

export function EmployeeWelcome({ employee, actions = null }) {
  if (!employee) return null;
  return (
    <header className="hr-page-header ed-welcome">
      <div className="ed-welcome-main">
        <HrEmployeeAvatar employee={employee} size={56} />
        <div>
          <h1>Welcome, {employeeName(employee)}</h1>
          <p className="hr-page-subtitle">
            {employee.employeeId} · {employee.department} · {employee.designation}
          </p>
        </div>
      </div>
      {actions}
    </header>
  );
}

export default EmployeeContextGate;
