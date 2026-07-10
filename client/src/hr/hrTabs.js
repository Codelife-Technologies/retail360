export const HR_TABS = [
  { id: 'hr-dashboard', label: 'HR Dashboard', icon: '📊', permission: 'hr.access' },
  { id: 'employee-master', label: 'Employee Master', icon: '👥', permission: 'hr.access' },
  { id: 'employee-tasks', label: 'Assign Task', icon: '✅', permission: 'hr.access' },
  { id: 'work-logs', label: 'Daily Work Logs', icon: '📝', permission: 'hr.access' },
  { id: 'work-log-report', label: 'Work Log Report', icon: '📋', permission: 'hr.access' },
  { id: 'attendance', label: 'Attendance', icon: '🕐', permission: 'hr.access' },
  { id: 'leave-management', label: 'Leave Management', icon: '📅', permission: 'hr.access' },
  { id: 'payroll', label: 'Payroll', icon: '💰', permission: 'hr.access' },
  { id: 'holidays', label: 'Holidays', icon: '🎉', permission: 'hr.access' },
];

export const HR_TAB_IDS = HR_TABS.map((tab) => tab.id);

export function isHrTab(tabId) {
  return HR_TAB_IDS.includes(tabId);
}

export function resolveHrSubTab(tabId) {
  if (tabId === 'hr') return 'hr-dashboard';
  if (tabId.startsWith('hr:')) return tabId.slice('hr:'.length);
  return isHrTab(tabId) ? tabId : 'hr-dashboard';
}
