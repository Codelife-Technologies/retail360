export const SALES_GROUPS = [
  {
    label: 'Shipments',
    tabs: [
      { id: 'shipments', label: 'Shipments', icon: '📦', permission: 'shipments.view' },
      { id: 'shipping-charges', label: 'Shipping Charges', icon: '💳', permission: 'shippingCharges.view' },
    ],
  },
];

export const SALES_TABS = SALES_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => ({ ...tab, group: group.label }))
);

export const SALES_TAB_IDS = SALES_TABS.map((tab) => tab.id);

export function isSalesModuleTab(tabId) {
  return SALES_TAB_IDS.includes(tabId);
}

export function resolveSalesSubTab(tabId) {
  if (tabId === 'sales-module') return 'shipments';
  if (tabId.startsWith('sales-module:')) return tabId.slice('sales-module:'.length);
  return isSalesModuleTab(tabId) ? tabId : 'shipments';
}
