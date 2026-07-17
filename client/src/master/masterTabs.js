export const MASTER_GROUPS = [
  {
    label: 'Catalog',
    tabs: [
      { id: 'products', label: 'Products', icon: '📦' },
      { id: 'stock', label: 'Stock', icon: '📊' },
      { id: 'categories', label: 'Categories', icon: '📁' },
      { id: 'subcategories', label: 'Subcategories', icon: '📂' },
      { id: 'prices', label: 'Vendor Prices', icon: '💵' },
    ],
  },
  {
    label: 'Partners',
    tabs: [
      { id: 'suppliers', label: 'Suppliers', icon: '🏢' },
      { id: 'company-master', label: 'Company Master', icon: '🏛️' },
      { id: 'shipment-vendors', label: 'Shipment Vendors', icon: '🚚' },
    ],
  },
  {
    label: 'Locations & Sales',
    tabs: [
      { id: 'locations', label: 'Locations', icon: '🏭' },
      { id: 'sales-channels', label: 'Sales Channels', icon: '📡' },
      { id: 'sales-locations', label: 'Sales Locations', icon: '📍' },
    ],
  },
];

export const MASTER_TABS = MASTER_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => ({ ...tab, group: group.label }))
);

export const MASTER_TAB_IDS = MASTER_TABS.map((tab) => tab.id);

export function isMasterTab(tabId) {
  return MASTER_TAB_IDS.includes(tabId);
}

export function resolveMasterSubTab(tabId) {
  if (tabId === 'master') return 'products';
  if (tabId.startsWith('master:')) return tabId.slice('master:'.length);
  return isMasterTab(tabId) ? tabId : 'products';
}
