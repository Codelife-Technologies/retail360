export const MASTER_GROUPS = [
  {
    label: 'Catalog',
    tabs: [
      { id: 'products', label: 'Products', icon: '📦', permission: 'products.view' },
      { id: 'stock', label: 'Stock', icon: '📊', permission: 'stock.view' },
      { id: 'categories', label: 'Categories', icon: '📁', permission: 'categories.view' },
      { id: 'hsn-masters', label: 'HSN Tax Master', icon: '🧾', permission: 'hsnMasters.view' },
      { id: 'subcategories', label: 'Subcategories', icon: '📂', permission: 'subcategories.view' },
      { id: 'prices', label: 'Vendor Prices', icon: '💵', permission: 'prices.view' },
    ],
  },
  {
    label: 'Partners',
    tabs: [
      { id: 'suppliers', label: 'Suppliers', icon: '🏢', permission: 'suppliers.view' },
      { id: 'company-master', label: 'Company Master', icon: '🏛️', permission: 'companyProfile.view' },
      { id: 'shipment-vendors', label: 'Shipment Vendors', icon: '🚚', permission: 'shipmentVendors.view' },
    ],
  },
  {
    label: 'Locations & Sales',
    tabs: [
      { id: 'locations', label: 'Locations', icon: '🏭', permission: 'locations.view' },
      { id: 'sales-channels', label: 'Sales Channels', icon: '📡', permission: 'salesChannels.view' },
      { id: 'sales-locations', label: 'Sales Locations', icon: '📍', permission: 'salesLocations.view' },
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

export function resolveMasterSubTab(tabId, fallbackTabId = 'products') {
  if (tabId === 'master') return fallbackTabId;
  if (tabId.startsWith('master:')) {
    const sub = tabId.slice('master:'.length);
    return isMasterTab(sub) ? sub : fallbackTabId;
  }
  return isMasterTab(tabId) ? tabId : fallbackTabId;
}

/** Filter Master groups/tabs by permission (admin.all / master.full see all). */
export function filterMasterGroups(hasPermission, groups = MASTER_GROUPS) {
  if (hasPermission('admin.all') || hasPermission('master.full')) {
    return groups;
  }
  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => hasPermission(tab.permission)),
    }))
    .filter((group) => group.tabs.length > 0);
}

export function filterMasterTabs(hasPermission, tabs = MASTER_TABS) {
  if (hasPermission('admin.all') || hasPermission('master.full')) {
    return tabs;
  }
  return tabs.filter((tab) => hasPermission(tab.permission));
}
