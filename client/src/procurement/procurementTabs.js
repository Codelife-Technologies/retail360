export const PROCUREMENT_GROUPS = [
  {
    label: 'Procurement',
    tabs: [
      { id: 'purchase-requisite', label: 'Purchase Requisition', icon: '📝', shortLabel: 'PR', permission: 'purchaseOrders.view' },
      { id: 'purchase-orders', label: 'Purchase Orders', icon: '📋', shortLabel: 'PO', permission: 'purchaseOrders.view' },
      { id: 'grn', label: 'Goods Receipt Note', icon: '📥', shortLabel: 'GRN', permission: 'purchaseOrders.view' },
      { id: 'purchases', label: 'Purchases', icon: '💰', permission: 'purchases.view' },
    ],
  },
];

export const PROCUREMENT_TABS = PROCUREMENT_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => ({ ...tab, group: group.label }))
);

export const PROCUREMENT_TAB_IDS = PROCUREMENT_TABS.map((tab) => tab.id);

export function isProcurementTab(tabId) {
  return PROCUREMENT_TAB_IDS.includes(tabId);
}

export function resolveProcurementSubTab(tabId) {
  if (tabId === 'procurement') return 'purchase-requisite';
  if (tabId.startsWith('procurement:')) return tabId.slice('procurement:'.length);
  return isProcurementTab(tabId) ? tabId : 'purchase-requisite';
}
