import React from 'react';
import HrDashboard from './pages/HrDashboard';
import EmployeeMaster from './pages/EmployeeMaster';
import Attendance from './pages/Attendance';
import LeaveManagement from './pages/LeaveManagement';
import Payroll from './pages/Payroll';
import Holidays from './pages/Holidays';
import EmployeeTasks from './pages/EmployeeTasks';
import WorkLogs from './pages/WorkLogs';
import './HrModule.css';
import './styles/hrShared.css';

function HrModule({ subTab = 'hr-dashboard', onNavigate }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'hr-dashboard':
        return <HrDashboard onNavigate={onNavigate} />;
      case 'employee-master':
        return <EmployeeMaster />;
      case 'employee-tasks':
        return <EmployeeTasks />;
      case 'work-logs':
      case 'work-log-report':
        return <WorkLogs />;
      case 'attendance':
        return <Attendance />;
      case 'leave-management':
        return <LeaveManagement />;
      case 'payroll':
        return <Payroll />;
      case 'holidays':
        return <Holidays />;
      default:
        return <HrDashboard onNavigate={onNavigate} />;
    }
  };

  return <div className="hr-module">{renderPanel()}</div>;
}

export default HrModule;
