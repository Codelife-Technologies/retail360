import React from 'react';
import EmployeeHome from './pages/EmployeeHome';
import EmployeeAttendance from './pages/EmployeeAttendance';
import EmployeeTasks from './pages/EmployeeTasks';
import EmployeeWorkLog from './pages/EmployeeWorkLog';
import EmployeeSalarySlip from './pages/EmployeeSalarySlip';
import EmployeeLeave from './pages/EmployeeLeave';
import EmployeeChat from './pages/EmployeeChat';
import './EmployeeDashboardModule.css';
import '../hr/styles/hrShared.css';

function EmployeeDashboardModule({ subTab = 'home', onNavigate }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'home':
        return <EmployeeHome onNavigate={onNavigate} />;
      case 'attendance':
        return <EmployeeAttendance />;
      case 'tasks':
        return <EmployeeTasks />;
      case 'work-log':
        return <EmployeeWorkLog />;
      case 'salary-slip':
        return <EmployeeSalarySlip />;
      case 'leave':
        return <EmployeeLeave />;
      case 'chat':
        return <EmployeeChat />;
      default:
        return <EmployeeHome onNavigate={onNavigate} />;
    }
  };

  return <div className="employee-dashboard-module">{renderPanel()}</div>;
}

export default EmployeeDashboardModule;
