export const USER_MANAGEMENT_TABS = [
  { id: 'users', label: 'User', icon: '👤', permission: 'users.view' },
  { id: 'roles', label: 'Role', icon: '🔐', permission: 'roles.view' },
  { id: 'permissions', label: 'Permission', icon: '✅', permission: 'permissions.view' },
  { id: 'groups', label: 'Group', icon: '👥', permission: 'groups.view' },
  { id: 'logs', label: 'Logs', icon: '📋', permission: 'logs.view' },
];

export const USER_MANAGEMENT_TAB_IDS = USER_MANAGEMENT_TABS.map((tab) => tab.id);

export function isUserManagementTab(tabId) {
  return USER_MANAGEMENT_TAB_IDS.includes(tabId);
}

export function resolveUserManagementSubTab(tabId) {
  if (tabId === 'user-management') return 'users';
  if (tabId.startsWith('user-management:')) return tabId.slice('user-management:'.length);
  return isUserManagementTab(tabId) ? tabId : 'users';
}
