export const UTILITIES_TABS = [
  {
    id: 'image-generator',
    label: 'Image Generator',
    icon: '🎨',
    permission: 'gemini.view',
  },
  {
    id: 'location-settings',
    label: 'Location Settings',
    icon: '📍',
    permission: 'hr.access',
  },
];

export const UTILITIES_TAB_IDS = UTILITIES_TABS.map((tab) => tab.id);

export function isUtilitiesTab(tabId) {
  return UTILITIES_TAB_IDS.includes(tabId);
}

export function resolveUtilitiesSubTab(tabId) {
  if (tabId === 'utilities') return 'image-generator';
  if (tabId.startsWith('utilities:')) return tabId.slice('utilities:'.length);
  return isUtilitiesTab(tabId) ? tabId : 'image-generator';
}

export function filterUtilitiesTabs(hasPermission, tabs = UTILITIES_TABS) {
  if (hasPermission('admin.all')) {
    return tabs;
  }
  return tabs.filter(
    (tab) =>
      hasPermission(tab.permission) ||
      (tab.permission === 'gemini.view' && hasPermission('gemini.generate'))
  );
}
