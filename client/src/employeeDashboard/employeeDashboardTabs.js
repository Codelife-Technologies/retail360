export const EMPLOYEE_DASHBOARD_TABS = [
  { id: 'home', label: 'My Dashboard', icon: '🏠' },
  { id: 'attendance', label: 'Attendance', icon: '🕐' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
  { id: 'work-log', label: 'Daily Work Log', icon: '📝' },
  { id: 'salary-slip', label: 'Salary Slip', icon: '💰' },
  { id: 'leave', label: 'Apply Leave', icon: '📅' },
  { id: 'chat', label: 'Team Chat', icon: '💬' },
];

export const EMPLOYEE_DASHBOARD_TAB_IDS = EMPLOYEE_DASHBOARD_TABS.map((tab) => tab.id);

export function isEmployeeDashboardTab(tabId) {
  return EMPLOYEE_DASHBOARD_TAB_IDS.includes(tabId);
}

export function resolveEmployeeDashboardSubTab(tabId) {
  if (tabId === 'employee-dashboard') return 'home';
  if (tabId.startsWith('employee-dashboard:')) return tabId.slice('employee-dashboard:'.length);
  return isEmployeeDashboardTab(tabId) ? tabId : 'home';
}
