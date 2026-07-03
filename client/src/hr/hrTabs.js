export const HR_TABS = [
  { id: 'hr-dashboard', label: 'HR Dashboard', icon: '📊' },
  { id: 'employee-master', label: 'Employee Master', icon: '👥' },
  { id: 'attendance', label: 'Attendance', icon: '🕐' },
  { id: 'leave-management', label: 'Leave Management', icon: '📅' },
  { id: 'payroll', label: 'Payroll', icon: '💰' },
  { id: 'holidays', label: 'Holidays', icon: '🎉' },
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
